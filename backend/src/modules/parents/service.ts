import type { Prisma } from '@prisma/client';
import type {
  AssignableStudentDto,
  CreateParentInput,
  ParentDto,
  ParentSummaryDto,
} from '@vig/shared';
import { joinName, splitName } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { contactPatch, toContactDto } from '../../lib/contact.js';
import { avatarStorage, signAvatar } from '../../lib/storage.js';
import { issueUsername } from '../../lib/accountNames.js';
import { createUser, renameUser, setUserStatus } from '../../auth/service.js';

/**
 * Parents, from the school's side of the desk.
 *
 * A parent account exists to show one family their own children (BR-13), so it
 * is created against those children rather than being an empty account somebody
 * is linked to later. The children are the point of the account: an account
 * with none of them sees nothing at all, which is why one is required.
 */

const parentInclude = {
  user: true,
  students: { include: { student: true } },
} satisfies Prisma.ParentInclude;

type ParentWithRelations = Prisma.ParentGetPayload<{ include: typeof parentInclude }>;

async function toSummary(parent: ParentWithRelations): Promise<ParentSummaryDto> {
  // Names were not always collected in two fields; fall back to splitting the
  // one we have so an older account still edits cleanly.
  const split = splitName(parent.user.fullName);

  const [avatarUrl, children] = await Promise.all([
    signAvatar(parent.user.avatarPath),
    Promise.all(
      parent.students.map(async (link) => ({
        id: link.student.id,
        fullName: link.student.fullName,
        avatarUrl: await signAvatar(link.student.avatarPath),
        relationship: link.relationship,
      })),
    ),
  ]);

  return {
    id: parent.id,
    userId: parent.userId,
    fullName: parent.user.fullName,
    firstName: parent.firstName ?? split.firstName,
    lastName: parent.lastName ?? split.lastName,
    username: parent.user.username,
    ...toContactDto(parent),
    status: parent.user.status,
    avatarUrl,
    children,
  };
}

export async function listParents(): Promise<ParentSummaryDto[]> {
  const parents = await prisma.parent.findMany({
    include: parentInclude,
    orderBy: { user: { fullName: 'asc' } },
  });
  return Promise.all(parents.map(toSummary));
}

export async function getParent(parentId: string): Promise<ParentDto> {
  const parent = await prisma.parent.findUnique({ where: { id: parentId }, include: parentInclude });
  if (!parent) throw notFound('Parent');

  return {
    ...(await toSummary(parent)),
    mustChangePassword: parent.user.mustChangePassword,
    createdAt: parent.user.createdAt.toISOString(),
  };
}

/**
 * The children still available to give a parent account.
 *
 * A child already linked to a parent is left out entirely, so the picker cannot
 * produce a second account for the same family. `excludeStudentIds` additionally
 * drops the ones the admin has already added to the form in front of them.
 */
export async function listAssignableStudents(
  parentId?: string,
): Promise<AssignableStudentDto[]> {
  const students = await prisma.student.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      // Editing an existing parent keeps their own children in the list, so the
      // picker shows the current selection rather than an empty box.
      parents: parentId ? { every: { parentId } } : { none: {} },
    },
    select: { id: true, fullName: true, gradeLabel: true, avatarPath: true, username: true },
    orderBy: { fullName: 'asc' },
  });

  return Promise.all(
    students.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      gradeLabel: s.gradeLabel,
      username: s.username,
      avatarUrl: await signAvatar(s.avatarPath),
    })),
  );
}

/** The photo is chosen before the account exists, so this takes no parent id. */
export function createAvatarUploadUrl(fileName: string, mimeType: string) {
  return avatarStorage.createUploadUrl(fileName, mimeType, 'parents');
}

export async function createParent(input: CreateParentInput, actorId: string) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const fullName = joinName(firstName, lastName);

  // Refuse the whole request rather than silently dropping a child: the admin
  // picked them from a list that said they were free.
  const taken = await prisma.parentStudent.findMany({
    where: { studentId: { in: input.studentIds } },
    select: { student: { select: { fullName: true } } },
  });
  if (taken.length > 0) {
    const names = taken.map((t) => t.student.fullName).join(', ');
    throw badRequest(`${names} already has a parent account. Reload and try again.`);
  }

  const username = await issueUsername('P', firstName, lastName);

  // createUser talks to Supabase Auth, so it happens before — and outside — the
  // database transaction below.
  const { user, tempPassword } = await createUser({ username, fullName, role: 'PARENT', actorId });

  const parent = await prisma.$transaction(async (tx) => {
    const updated = await tx.parent.update({
      where: { userId: user.id },
      data: { firstName, lastName, ...contactPatch(input) },
    });

    if (input.avatarPath) {
      await tx.user.update({ where: { id: user.id }, data: { avatarPath: input.avatarPath } });
    }

    await tx.parentStudent.createMany({
      data: input.studentIds.map((studentId) => ({
        parentId: updated.id,
        studentId,
        relationship: input.relationship,
      })),
    });

    return updated;
  });

  await audit({
    actorId,
    action: 'PARENT_CREATED',
    entity: 'Parent',
    entityId: parent.id,
    after: { fullName, username, children: input.studentIds.length },
  });

  return { parent: await getParent(parent.id), username, tempPassword };
}

export async function updateParent(
  parentId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: string;
    bloodGroup?: string;
    address?: string;
    emergencyContact?: string;
    relationship?: string;
    username?: string;
  },
  actorId: string,
) {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    include: { user: { select: { id: true, username: true, fullName: true } } },
  });
  if (!parent) throw notFound('Parent');

  const split = splitName(parent.user.fullName);
  const firstName = data.firstName?.trim() ?? parent.firstName ?? split.firstName;
  const lastName = data.lastName?.trim() ?? parent.lastName ?? split.lastName;

  // The sign-in name keys the Supabase Auth alias, so it moves through
  // renameUser or not at all.
  if (data.username && data.username !== parent.user.username) {
    await renameUser(parent.user.id, data.username, actorId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.parent.update({
      where: { id: parentId },
      data: { firstName, lastName, ...contactPatch(data) },
    });

    const fullName = joinName(firstName, lastName);
    if (fullName && fullName !== parent.user.fullName) {
      await tx.user.update({ where: { id: parent.user.id }, data: { fullName } });
    }

    if (data.relationship) {
      await tx.parentStudent.updateMany({
        where: { parentId },
        data: { relationship: data.relationship },
      });
    }
  });

  await audit({ actorId, action: 'PARENT_UPDATED', entity: 'Parent', entityId: parentId });
  return getParent(parentId);
}

/**
 * Replaces which children this parent can see.
 *
 * Removing a child removes their sight of it from the next request onwards;
 * nothing recorded about the child is touched (BR-09).
 */
export async function putChildren(
  parentId: string,
  studentIds: string[],
  relationship: string | undefined,
  actorId: string,
) {
  const parent = await prisma.parent.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) throw notFound('Parent');

  const taken = await prisma.parentStudent.findMany({
    where: { studentId: { in: studentIds }, parentId: { not: parentId } },
    select: { student: { select: { fullName: true } } },
  });
  if (taken.length > 0) {
    const names = taken.map((t) => t.student.fullName).join(', ');
    throw badRequest(`${names} already has a parent account.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.parentStudent.deleteMany({ where: { parentId, studentId: { notIn: studentIds } } });

    for (const studentId of studentIds) {
      await tx.parentStudent.upsert({
        where: { parentId_studentId: { parentId, studentId } },
        create: { parentId, studentId, relationship: relationship ?? null },
        update: relationship ? { relationship } : {},
      });
    }
  });

  await audit({ actorId, action: 'PARENT_CHILDREN_SET', entity: 'Parent', entityId: parentId });
  return getParent(parentId);
}

/**
 * Deactivation, not deletion. A parent losing access does not remove anything
 * the school recorded about their child (BR-09). Reactivating issues fresh
 * credentials, because deactivation destroyed the old ones.
 */
export async function setParentStatus(
  parentId: string,
  status: 'ACTIVE' | 'INACTIVE',
  actorId: string,
) {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    select: { userId: true },
  });
  if (!parent) throw notFound('Parent');

  const { credentials } = await setUserStatus(parent.userId, status, actorId);
  return { parent: await getParent(parentId), credentials };
}

export async function setAvatar(parentId: string, storagePath: string, actorId: string) {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    select: { userId: true, user: { select: { avatarPath: true } } },
  });
  if (!parent) throw notFound('Parent');

  await prisma.user.update({ where: { id: parent.userId }, data: { avatarPath: storagePath } });

  const previous = parent.user.avatarPath;
  if (previous && previous !== storagePath) await avatarStorage.remove(previous).catch(() => undefined);

  await audit({ actorId, action: 'PARENT_AVATAR_SET', entity: 'Parent', entityId: parentId });
  return getParent(parentId);
}

export async function removeAvatar(parentId: string, actorId: string) {
  const parent = await prisma.parent.findUnique({
    where: { id: parentId },
    select: { userId: true, user: { select: { avatarPath: true } } },
  });
  if (!parent) throw notFound('Parent');

  if (parent.user.avatarPath) {
    await prisma.user.update({ where: { id: parent.userId }, data: { avatarPath: null } });
    await avatarStorage.remove(parent.user.avatarPath).catch(() => undefined);
    await audit({ actorId, action: 'PARENT_AVATAR_REMOVED', entity: 'Parent', entityId: parentId });
  }
  return getParent(parentId);
}

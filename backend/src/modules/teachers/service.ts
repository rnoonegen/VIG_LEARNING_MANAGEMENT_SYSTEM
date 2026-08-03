import type { Prisma } from '@prisma/client';
import type {
  CreateTeacherInput,
  TeacherCreatedDto,
  TeacherDto,
  TeacherStatusResultDto,
  TeacherSummaryDto,
} from '@vig/shared';
import { formatTime12h, joinName, splitName } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { avatarStorage, signAvatar } from '../../lib/storage.js';
import { issueUsername } from '../../lib/accountNames.js';
import { createUser, renameUser, setUserStatus } from '../../auth/service.js';
import { resolveAvailability } from '../scheduling/availability.js';

/**
 * A teacher is not assumed able to teach everything (F5). Capabilities pin the
 * subject and the level range; availability pins when. Both become hard
 * constraints in the scheduling engine (BR-06).
 */

const teacherInclude = {
  user: true,
  capabilities: { include: { subject: true } },
  availability: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
  exceptions: { orderBy: { date: 'asc' } },
} satisfies Prisma.TeacherInclude;

/** Level display orders → readable names, for rendering a capability range. */
async function levelNameLookup(subjectIds: string[]) {
  const levels = await prisma.level.findMany({
    where: { subjectId: { in: subjectIds } },
    select: { subjectId: true, name: true, displayOrder: true },
  });
  const map = new Map<string, Map<number, string>>();
  for (const l of levels) {
    if (!map.has(l.subjectId)) map.set(l.subjectId, new Map());
    map.get(l.subjectId)!.set(l.displayOrder, l.name);
  }
  return map;
}

export async function listTeachers(): Promise<TeacherSummaryDto[]> {
  const teachers = await prisma.teacher.findMany({
    where: { user: { status: { not: 'ARCHIVED' } } },
    include: teacherInclude,
    orderBy: { user: { fullName: 'asc' } },
  });

  const lookup = await levelNameLookup(teachers.flatMap((t) => t.capabilities.map((c) => c.subjectId)));
  const today = new Date();

  return Promise.all(
    teachers.map(async (t) => {
      const windows = resolveAvailability(t.availability, t.exceptions, today);
      return {
        id: t.id,
        userId: t.userId,
        fullName: t.user.fullName,
        username: t.user.username,
        status: t.user.status,
        avatarUrl: await signAvatar(t.user.avatarPath),
        subjects: t.capabilities.map((c) => {
          const names = lookup.get(c.subjectId);
          const min = names?.get(c.minLevelOrder) ?? `Level ${c.minLevelOrder + 1}`;
          const max = names?.get(c.maxLevelOrder) ?? `Level ${c.maxLevelOrder + 1}`;
          return {
            subjectId: c.subjectId,
            name: c.subject.name,
            levelRange: min === max ? min : `${min} – ${max}`,
            colorToken: c.subject.colorToken,
            minLevelOrder: c.minLevelOrder,
            maxLevelOrder: c.maxLevelOrder,
          };
        }),
        // A deactivated teacher has no teaching day, whatever their weekly
        // pattern still says.
        availableToday:
          t.user.status === 'ACTIVE' && windows.length
            ? windows.map((w) => `${formatTime12h(w.startTime)} – ${formatTime12h(w.endTime)}`).join(', ')
            : null,
      };
    }),
  );
}

export async function getTeacher(teacherId: string): Promise<TeacherDto> {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, include: teacherInclude });
  if (!teacher) throw notFound('Teacher');

  const [lookup, avatarUrl, upcomingClassCount] = await Promise.all([
    levelNameLookup(teacher.capabilities.map((c) => c.subjectId)),
    signAvatar(teacher.user.avatarPath),
    prisma.classOccurrence.count({
      where: { teacherId, status: 'SCHEDULED', scheduledStart: { gte: new Date() } },
    }),
  ]);

  // Names were not always collected in two fields; fall back to splitting the
  // one we have so an older record still edits cleanly.
  const split = splitName(teacher.user.fullName);

  return {
    id: teacher.id,
    userId: teacher.userId,
    fullName: teacher.user.fullName,
    firstName: teacher.firstName ?? split.firstName,
    lastName: teacher.lastName ?? split.lastName,
    username: teacher.user.username,
    dateOfBirth: teacher.dateOfBirth ? teacher.dateOfBirth.toISOString().slice(0, 10) : null,
    address: teacher.address,
    status: teacher.user.status,
    avatarUrl,
    upcomingClassCount,
    notes: teacher.notes,
    capabilities: teacher.capabilities.map((c) => ({
      id: c.id,
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      minLevelOrder: c.minLevelOrder,
      maxLevelOrder: c.maxLevelOrder,
      minLevelName: lookup.get(c.subjectId)?.get(c.minLevelOrder) ?? null,
      maxLevelName: lookup.get(c.subjectId)?.get(c.maxLevelOrder) ?? null,
      isPrimary: c.isPrimary,
    })),
    availability: teacher.availability.map((a) => ({
      id: a.id,
      weekday: a.weekday,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    exceptions: teacher.exceptions.map((e) => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      isAvailable: e.isAvailable,
      allDay: e.allDay,
      startTime: e.startTime,
      endTime: e.endTime,
      reason: e.reason,
    })),
  };
}

/**
 * Creates the login account and the teacher record together.
 *
 * The sign-in name is issued here rather than chosen by the admin (AD-02) — the
 * same T26PriSha shape parents and students get — because only the API can see
 * that another Priya Sharma already has it.
 */
export async function createTeacher(
  input: CreateTeacherInput,
  actorId: string,
): Promise<TeacherCreatedDto> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const fullName = joinName(firstName, lastName);

  const username = await issueUsername('T', firstName, lastName);

  // createUser talks to Supabase Auth, so it happens before — and outside — the
  // database writes below.
  const { user, tempPassword } = await createUser({ username, fullName, role: 'TEACHER', actorId });

  const teacher = await prisma.$transaction(async (tx) => {
    const updated = await tx.teacher.update({
      where: { userId: user.id },
      data: {
        firstName,
        lastName,
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
        address: input.address?.trim() || null,
        notes: input.notes ?? null,
      },
    });

    if (input.avatarPath) {
      await tx.user.update({ where: { id: user.id }, data: { avatarPath: input.avatarPath } });
    }

    return updated;
  });

  await audit({
    actorId,
    action: 'TEACHER_CREATED',
    entity: 'Teacher',
    entityId: teacher.id,
    after: { fullName, username },
  });

  return { teacherId: teacher.id, userId: user.id, username: user.username, tempPassword };
}

export async function updateTeacher(
  teacherId: string,
  data: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    dateOfBirth?: string;
    address?: string;
    username?: string;
    notes?: string;
  },
  actorId: string,
) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: { select: { fullName: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  // The username is the sign-in name, so it goes through the auth service —
  // renaming here alone would leave them unable to log in.
  if (data.username) await renameUser(teacher.userId, data.username, actorId);

  const split = splitName(teacher.user.fullName);
  const firstName = data.firstName?.trim() ?? teacher.firstName ?? split.firstName;
  const lastName = data.lastName?.trim() ?? teacher.lastName ?? split.lastName;
  // An explicit full name wins; otherwise it follows the two fields it is built
  // from, so the displayed spelling never drifts from them.
  const fullName = data.fullName?.trim() || joinName(firstName, lastName);

  await prisma.$transaction(async (tx) => {
    await tx.teacher.update({
      where: { id: teacherId },
      data: {
        firstName,
        lastName,
        ...(data.dateOfBirth !== undefined
          ? { dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00.000Z`) : null }
          : {}),
        ...(data.address !== undefined ? { address: data.address.trim() || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    if (fullName && fullName !== teacher.user.fullName) {
      await tx.user.update({ where: { id: teacher.userId }, data: { fullName } });
    }
  });

  await audit({ actorId, action: 'TEACHER_UPDATED', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

/**
 * The photo goes straight from the browser to the private avatars bucket; only
 * the resulting path comes back to us (AD-04).
 *
 * The teacher id is optional because the commonest case is a photo chosen while
 * the teacher is still being added. The path is handed to createTeacher, or to
 * setAvatar for a teacher who already exists.
 */
export async function createAvatarUploadUrl(fileName: string, mimeType: string, teacherId?: string) {
  if (teacherId) {
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true } });
    if (!teacher) throw notFound('Teacher');
  }
  return avatarStorage.createUploadUrl(fileName, mimeType, 'teachers');
}

export async function setAvatar(teacherId: string, storagePath: string, actorId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { userId: true, user: { select: { avatarPath: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  await prisma.user.update({ where: { id: teacher.userId }, data: { avatarPath: storagePath } });

  // The replaced photo has no other referent, so it does not need keeping.
  const previous = teacher.user.avatarPath;
  if (previous && previous !== storagePath) await avatarStorage.remove(previous).catch(() => undefined);

  await audit({ actorId, action: 'TEACHER_AVATAR_SET', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

export async function removeAvatar(teacherId: string, actorId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { userId: true, user: { select: { avatarPath: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  if (teacher.user.avatarPath) {
    await prisma.user.update({ where: { id: teacher.userId }, data: { avatarPath: null } });
    await avatarStorage.remove(teacher.user.avatarPath).catch(() => undefined);
    await audit({ actorId, action: 'TEACHER_AVATAR_REMOVED', entity: 'Teacher', entityId: teacherId });
  }
  return getTeacher(teacherId);
}

/**
 * Deactivation, not deletion (BR-09).
 *
 * An inactive teacher cannot sign in and cannot be offered a class — the
 * scheduling snapshot only loads ACTIVE teachers — but every class record,
 * learning update and development observation they wrote stays exactly where it
 * is. A child's history does not depend on their teacher still working here.
 */
export async function setTeacherStatus(
  teacherId: string,
  status: 'ACTIVE' | 'INACTIVE',
  actorId: string,
): Promise<TeacherStatusResultDto> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { userId: true, user: { select: { status: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  if (teacher.user.status !== status) {
    const { credentials } = await setUserStatus(teacher.userId, status, actorId);
    await audit({
      actorId,
      action: status === 'ACTIVE' ? 'TEACHER_REACTIVATED' : 'TEACHER_DEACTIVATED',
      entity: 'Teacher',
      entityId: teacherId,
    });
    return { teacher: await getTeacher(teacherId), credentials };
  }

  return { teacher: await getTeacher(teacherId), credentials: null };
}

/** Replaces the whole capability set — the editor sends the full list. */
export async function putCapabilities(
  teacherId: string,
  capabilities: Array<{
    subjectId: string;
    minLevelOrder: number;
    maxLevelOrder: number;
    isPrimary: boolean;
  }>,
  actorId: string,
) {
  for (const c of capabilities) {
    if (c.minLevelOrder > c.maxLevelOrder) {
      throw badRequest('The lowest level in a range must not be above the highest.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherCapability.deleteMany({ where: { teacherId } });
    if (capabilities.length) {
      await tx.teacherCapability.createMany({
        data: capabilities.map((c) => ({ ...c, teacherId })),
      });
    }
  });

  await audit({ actorId, action: 'TEACHER_CAPABILITIES_SET', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

/**
 * Replaces the whole weekly pattern — the editor sends every window it holds.
 *
 * A day may carry several windows (Monday 9–11 and 12–1). They must not overlap:
 * the scheduler would merge them and quietly widen the teacher's stated week.
 */
export async function putAvailability(
  teacherId: string,
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
  actorId: string,
) {
  for (let day = 0; day < 7; day += 1) {
    const ofDay = slots.filter((s) => s.weekday === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < ofDay.length; i += 1) {
      if (ofDay[i]!.startTime < ofDay[i - 1]!.endTime) {
        throw badRequest('Two times on the same day overlap. Adjust them so they do not.');
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherAvailability.deleteMany({ where: { teacherId } });
    if (slots.length) {
      await tx.teacherAvailability.createMany({ data: slots.map((s) => ({ ...s, teacherId })) });
    }
  });

  await audit({ actorId, action: 'TEACHER_AVAILABILITY_SET', entity: 'Teacher', entityId: teacherId });
  return getTeacher(teacherId);
}

/**
 * A dated exception. Adding one does not rewrite the normal week — that
 * separation is the whole point (F5). Classes already booked on that date become
 * a Needs Attention issue rather than being moved silently.
 */
export async function addException(
  teacherId: string,
  input: {
    date: string;
    isAvailable: boolean;
    allDay: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  },
  actorId: string,
) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: { user: { select: { fullName: true } } },
  });
  if (!teacher) throw notFound('Teacher');

  const exception = await prisma.teacherAvailabilityException.create({
    data: {
      teacherId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      isAvailable: input.isAvailable,
      allDay: input.allDay,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      reason: input.reason ?? null,
    },
  });

  await audit({
    actorId,
    action: 'TEACHER_EXCEPTION_ADDED',
    entity: 'Teacher',
    entityId: teacherId,
    after: { date: input.date, isAvailable: input.isAvailable },
  });

  return exception;
}

export async function removeException(exceptionId: string) {
  await prisma.teacherAvailabilityException.delete({ where: { id: exceptionId } });
  return { removed: true };
}

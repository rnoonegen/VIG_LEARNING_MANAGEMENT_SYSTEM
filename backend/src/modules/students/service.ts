import type { Prisma } from '@prisma/client';
import type { CreateStudentInput, StudentDto, StudentSummaryDto, StudentSubjectLevelDto } from '@vig/shared';
import { joinName } from '@vig/shared';
import { prisma } from '../../prisma.js';
import type { Tx } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createUser } from '../../auth/service.js';
import { avatarStorage, signAvatar } from '../../lib/storage.js';
import { issueUsername } from '../../lib/accountNames.js';
import { readableStudentIds } from '../../auth/guards.js';
import type { AuthContext } from '../../types/express.js';

/**
 * Enrolling a child records who they are and what they study (F6). Weekly
 * availability and parent access come afterwards, from the profile — a student
 * still missing either surfaces as an INCOMPLETE_STUDENT_SETUP issue on Admin
 * Home rather than silently failing at scheduling time.
 */

const studentInclude = {
  subjectLevels: {
    where: { isCurrent: true },
    include: { subject: true, level: true },
    // Curriculum order, so a subject does not move between reads.
    orderBy: { subject: { displayOrder: 'asc' } },
  },
  parents: { include: { parent: { include: { user: true } } } },
} satisfies Prisma.StudentInclude;

type StudentWithRelations = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function mapSubjectLevels(student: StudentWithRelations): StudentSubjectLevelDto[] {
  return student.subjectLevels.map((sl) => ({
    subjectId: sl.subjectId,
    subjectName: sl.subject.name,
    colorToken: sl.subject.colorToken,
    levelId: sl.levelId,
    levelName: sl.level.name,
    levelOrder: sl.level.displayOrder,
  }));
}

/**
 * What a teacher covers, for annotating their own student list: the subjects and
 * level ranges they hold, and the children already on their schedule.
 */
async function teachingContext(teacherId: string) {
  const [capabilities, scheduled] = await Promise.all([
    prisma.teacherCapability.findMany({
      where: { teacherId },
      select: { subjectId: true, minLevelOrder: true, maxLevelOrder: true },
    }),
    prisma.classStudent.findMany({
      where: { class: { teacherId } },
      select: { studentId: true },
      distinct: ['studentId'],
    }),
  ]);

  const scheduledIds = new Set(scheduled.map((s) => s.studentId));

  return {
    /** The subjects out of a child's assignments that fall to this teacher. */
    taught: (subjectLevels: StudentSubjectLevelDto[]) =>
      subjectLevels.filter((sl) =>
        capabilities.some(
          (c) =>
            c.subjectId === sl.subjectId &&
            sl.levelOrder >= c.minLevelOrder &&
            sl.levelOrder <= c.maxLevelOrder,
        ),
      ),
    hasScheduledClass: (studentId: string) => scheduledIds.has(studentId),
  };
}

/**
 * The list, scoped to the caller. A teacher's rows additionally carry which
 * subjects are theirs, so their Students page reads as "my students, for what I
 * teach them" rather than an undifferentiated roster.
 */
export async function listStudents(ctx: AuthContext): Promise<StudentSummaryDto[]> {
  const scope = await readableStudentIds(ctx);

  const students = await prisma.student.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      ...(scope === 'ALL' ? {} : { id: { in: scope } }),
    },
    include: studentInclude,
    orderBy: { fullName: 'asc' },
  });

  const teaching =
    ctx.role === 'TEACHER' && ctx.teacherId ? await teachingContext(ctx.teacherId) : null;

  return Promise.all(
    students.map(async (s) => {
      const subjectLevels = mapSubjectLevels(s);
      return {
        id: s.id,
        fullName: s.fullName,
        firstName: s.firstName,
        lastName: s.lastName,
        username: s.username,
        gradeLabel: s.gradeLabel,
        status: s.status,
        avatarUrl: await signAvatar(s.avatarPath),
        subjectLevels,
        ...(teaching
          ? {
              taughtSubjectLevels: teaching.taught(subjectLevels),
              hasScheduledClass: teaching.hasScheduledClass(s.id),
            }
          : {}),
      };
    }),
  );
}

export async function getStudent(studentId: string): Promise<StudentDto> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: studentInclude });
  if (!student) throw notFound('Student');

  return {
    id: student.id,
    fullName: student.fullName,
    firstName: student.firstName,
    lastName: student.lastName,
    username: student.username,
    gradeLabel: student.gradeLabel,
    status: student.status,
    avatarUrl: await signAvatar(student.avatarPath),
    subjectLevels: mapSubjectLevels(student),
    dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    joinedAt: student.joinedAt?.toISOString().slice(0, 10) ?? null,
    notes: student.notes,
    parents: student.parents.map((p) => ({
      parentId: p.parentId,
      userId: p.parent.userId,
      fullName: p.parent.user.fullName,
      username: p.parent.user.username,
      relationship: p.relationship,
    })),
    // Subjects and a level in each are the whole of setup now: a child no longer
    // states when they can attend, so there is nothing else to wait for.
    setupComplete: student.subjectLevels.length > 0,
  };
}

/** Resolves the parent link, creating the account inline when asked to. */
async function resolveParent(
  tx: Tx,
  input: NonNullable<CreateStudentInput['parent']>,
  actorId: string,
): Promise<{ parentId: string; tempPassword?: string } | null> {
  if (input.parentUserId) {
    const parent = await tx.parent.findUnique({ where: { userId: input.parentUserId } });
    if (!parent) throw notFound('Parent account');
    return { parentId: parent.id };
  }

  if (input.username && input.fullName) {
    // createUser talks to Supabase, so it runs outside this transaction; the
    // caller sequences it before the student write.
    const { user, tempPassword } = await createUser({
      username: input.username,
      fullName: input.fullName,
      role: 'PARENT',
      actorId,
    });
    const parent = await prisma.parent.findUniqueOrThrow({ where: { userId: user.id } });
    return { parentId: parent.id, tempPassword };
  }

  return null;
}

export async function createStudent(input: CreateStudentInput, actorId: string) {
  // Parent account creation touches Supabase Auth, so it happens first and
  // outside the database transaction below.
  let parentLink: { parentId: string; tempPassword?: string } | null = null;
  if (input.parent) {
    parentLink = await resolveParent(prisma, input.parent, actorId);
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const username = await issueUsername('S', firstName, lastName);

  const student = await prisma.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        fullName: joinName(firstName, lastName),
        firstName,
        lastName,
        username,
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
        gradeLabel: input.gradeLabel ?? null,
        notes: input.notes ?? null,
        avatarPath: input.avatarPath ?? null,
        joinedAt: new Date(),
      },
    });

    if (input.subjectLevels.length) {
      await tx.studentSubjectLevel.createMany({
        data: input.subjectLevels.map((sl) => ({
          studentId: created.id,
          subjectId: sl.subjectId,
          levelId: sl.levelId,
          isCurrent: true,
        })),
      });
    }

    if (parentLink) {
      await tx.parentStudent.create({
        data: {
          parentId: parentLink.parentId,
          studentId: created.id,
          relationship: input.parent?.relationship ?? null,
        },
      });
    }

    return created;
  });

  await audit({
    actorId,
    action: 'STUDENT_CREATED',
    entity: 'Student',
    entityId: student.id,
    after: { fullName: student.fullName, username },
  });

  return { student: await getStudent(student.id), parentTempPassword: parentLink?.tempPassword ?? null };
}

export async function updateStudent(
  studentId: string,
  data: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    dateOfBirth?: string | null;
    gradeLabel?: string | null;
    notes?: string | null;
  },
  actorId: string,
) {
  const before = await prisma.student.findUnique({
    where: { id: studentId },
    select: { fullName: true, firstName: true, lastName: true, dateOfBirth: true, gradeLabel: true, notes: true },
  });
  if (!before) throw notFound('Student');

  // The two name fields are the source of truth once either is edited; fullName
  // follows so every existing screen keeps reading one spelling. The roll name
  // does not move — it is on paperwork already.
  const firstName = data.firstName ?? before.firstName ?? '';
  const lastName = data.lastName ?? before.lastName ?? '';
  const renamed = data.firstName !== undefined || data.lastName !== undefined;

  const after = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
      ...(renamed
        ? { fullName: joinName(firstName, lastName) }
        : data.fullName !== undefined
          ? { fullName: data.fullName }
          : {}),
      ...(data.gradeLabel !== undefined ? { gradeLabel: data.gradeLabel } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.dateOfBirth !== undefined
        ? { dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00.000Z`) : null }
        : {}),
    },
    select: { fullName: true, gradeLabel: true },
  });

  await audit({
    actorId,
    action: 'STUDENT_UPDATED',
    entity: 'Student',
    entityId: studentId,
    before: { fullName: before.fullName, gradeLabel: before.gradeLabel },
    after,
  });

  return getStudent(studentId);
}

/**
 * Replaces the current subject/level assignments.
 *
 * Superseded assignments are marked historical rather than deleted, so a level a
 * student has already worked through stays queryable (BR-08).
 */
export async function putSubjectLevels(
  studentId: string,
  subjectLevels: Array<{ subjectId: string; levelId: string }>,
  actorId: string,
) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw notFound('Student');

  // A level belongs to exactly one subject. A mismatched pair would produce a
  // learning map for a level the subject does not contain, so it is refused here
  // rather than discovered later.
  if (subjectLevels.length) {
    const levels = await prisma.level.findMany({
      where: { id: { in: subjectLevels.map((sl) => sl.levelId) } },
      select: { id: true, subjectId: true },
    });
    const subjectByLevel = new Map(levels.map((l) => [l.id, l.subjectId]));

    for (const sl of subjectLevels) {
      const owner = subjectByLevel.get(sl.levelId);
      if (!owner) throw badRequest('That level no longer exists. Reload and try again.');
      if (owner !== sl.subjectId) throw badRequest('That level does not belong to the chosen subject.');
    }

    const distinctSubjects = new Set(subjectLevels.map((sl) => sl.subjectId));
    if (distinctSubjects.size !== subjectLevels.length) {
      throw badRequest('A student can only be on one level per subject.');
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.studentSubjectLevel.findMany({ where: { studentId, isCurrent: true } });

    for (const row of existing) {
      const stillWanted = subjectLevels.some(
        (sl) => sl.subjectId === row.subjectId && sl.levelId === row.levelId,
      );
      if (!stillWanted) {
        await tx.studentSubjectLevel.update({
          where: { id: row.id },
          data: { isCurrent: false, completedAt: new Date() },
        });
      }
    }

    for (const sl of subjectLevels) {
      const already = existing.find((e) => e.subjectId === sl.subjectId && e.levelId === sl.levelId);
      if (already) continue;

      // The same student/subject/level pair may exist as history; revive it.
      await tx.studentSubjectLevel.upsert({
        where: {
          studentId_subjectId_levelId: { studentId, subjectId: sl.subjectId, levelId: sl.levelId },
        },
        create: { studentId, subjectId: sl.subjectId, levelId: sl.levelId, isCurrent: true },
        update: { isCurrent: true, completedAt: null },
      });
    }
  });

  await audit({ actorId, action: 'STUDENT_LEVELS_SET', entity: 'Student', entityId: studentId });
  return getStudent(studentId);
}

export async function putParentAccess(
  studentId: string,
  input: { parentUserId?: string; username?: string; fullName?: string; relationship?: string },
  actorId: string,
) {
  const link = await resolveParent(prisma, input, actorId);
  if (!link) throw badRequest('Provide either an existing parent account or a username and full name.');

  await prisma.parentStudent.upsert({
    where: { parentId_studentId: { parentId: link.parentId, studentId } },
    create: { parentId: link.parentId, studentId, relationship: input.relationship ?? null },
    update: { relationship: input.relationship ?? null },
  });

  await audit({ actorId, action: 'STUDENT_PARENT_LINKED', entity: 'Student', entityId: studentId });
  return { student: await getStudent(studentId), parentTempPassword: link.tempPassword ?? null };
}

/**
 * The photo goes straight from the browser to the private avatars bucket; only
 * the resulting path comes back to us (AD-04).
 *
 * No student id is needed, because the commonest case is a photo chosen while
 * the child is still being enrolled. The path is handed to createStudent, or to
 * setAvatar for a child who already exists.
 */
export function createAvatarUploadUrl(fileName: string, mimeType: string) {
  return avatarStorage.createUploadUrl(fileName, mimeType, 'students');
}

export async function setAvatar(studentId: string, storagePath: string, actorId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { avatarPath: true },
  });
  if (!student) throw notFound('Student');

  await prisma.student.update({ where: { id: studentId }, data: { avatarPath: storagePath } });

  // The replaced photo has no other referent, so it does not need keeping.
  if (student.avatarPath && student.avatarPath !== storagePath) {
    await avatarStorage.remove(student.avatarPath).catch(() => undefined);
  }

  await audit({ actorId, action: 'STUDENT_AVATAR_SET', entity: 'Student', entityId: studentId });
  return getStudent(studentId);
}

export async function removeAvatar(studentId: string, actorId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { avatarPath: true },
  });
  if (!student) throw notFound('Student');

  if (student.avatarPath) {
    await prisma.student.update({ where: { id: studentId }, data: { avatarPath: null } });
    await avatarStorage.remove(student.avatarPath).catch(() => undefined);
    await audit({ actorId, action: 'STUDENT_AVATAR_REMOVED', entity: 'Student', entityId: studentId });
  }
  return getStudent(studentId);
}

/** Archiving removes a student from active operations but preserves their history (BR-17). */
export async function setStatus(
  studentId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
  actorId: string,
) {
  await prisma.student.update({ where: { id: studentId }, data: { status } });
  await audit({
    actorId,
    action: 'STUDENT_STATUS_CHANGED',
    entity: 'Student',
    entityId: studentId,
    after: { status },
  });
  return getStudent(studentId);
}

/** Everything that has happened to this student, newest first. */
export async function getHistory(studentId: string) {
  const [learning, development, levelChanges, records] = await Promise.all([
    prisma.learningUpdate.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { skill: { include: { topic: { include: { level: { include: { subject: true } } } } } }, author: true },
    }),
    prisma.developmentObservation.findMany({
      where: { studentId },
      orderBy: { observedOn: 'desc' },
      take: 50,
      include: { area: true, observer: true },
    }),
    prisma.levelCompletion.findMany({
      where: { studentId },
      orderBy: { confirmedAt: 'desc' },
      include: { subject: true, fromLevel: true, toLevel: true },
    }),
    prisma.classRecord.findMany({
      where: { occurrence: { class: { students: { some: { studentId } } } }, status: 'SAVED' },
      orderBy: { savedAt: 'desc' },
      take: 20,
      include: { occurrence: { include: { class: { include: { subject: true, level: true } } } } },
    }),
  ]);

  return {
    learning: learning.map((l) => ({
      id: l.id,
      at: l.createdAt.toISOString(),
      subjectName: l.skill.topic.level.subject.name,
      skillName: l.skill.name,
      previousStatus: l.previousStatus,
      newStatus: l.newStatus,
      note: l.note,
      authorName: l.author.fullName,
      source: l.source,
    })),
    development: development.map((d) => ({
      id: d.id,
      at: d.observedOn.toISOString().slice(0, 10),
      areaName: d.area.name,
      observation: d.observation,
      observerName: d.observer.fullName,
      source: d.source,
    })),
    levelChanges: levelChanges.map((lc) => ({
      id: lc.id,
      at: lc.confirmedAt.toISOString(),
      subjectName: lc.subject.name,
      fromLevel: lc.fromLevel.name,
      toLevel: lc.toLevel?.name ?? null,
      carriedForward: lc.carriedForwardSkillIds.length,
    })),
    classRecords: records.map((r) => ({
      id: r.id,
      at: r.savedAt?.toISOString() ?? r.createdAt.toISOString(),
      subjectName: r.occurrence.class.subject.name,
      levelName: r.occurrence.class.level.name,
      note: r.overallClassNote,
    })),
  };
}

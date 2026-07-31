import type { Prisma } from '@prisma/client';
import type { CreateStudentInput, StudentDto, StudentSummaryDto, StudentSubjectLevelDto } from '@vig/shared';
import { prisma } from '../../prisma.js';
import type { Tx } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createUser } from '../../auth/service.js';
import { signAvatar } from '../../lib/storage.js';

/**
 * Adding a student means making them teachable and schedulable, not just naming
 * them (F6): subjects, a level per subject, weekly availability and parent access.
 * A student missing any of those surfaces as an INCOMPLETE_STUDENT_SETUP issue on
 * Admin Home rather than silently failing at scheduling time.
 */

const studentInclude = {
  subjectLevels: {
    where: { isCurrent: true },
    include: { subject: true, level: true },
  },
  availability: { orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
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

export async function listStudents(scope: string[] | 'ALL'): Promise<StudentSummaryDto[]> {
  const students = await prisma.student.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      ...(scope === 'ALL' ? {} : { id: { in: scope } }),
    },
    include: studentInclude,
    orderBy: { fullName: 'asc' },
  });

  return Promise.all(
    students.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      gradeLabel: s.gradeLabel,
      status: s.status,
      avatarUrl: await signAvatar(s.avatarPath),
      subjectLevels: mapSubjectLevels(s),
    })),
  );
}

export async function getStudent(studentId: string): Promise<StudentDto> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: studentInclude });
  if (!student) throw notFound('Student');

  return {
    id: student.id,
    fullName: student.fullName,
    gradeLabel: student.gradeLabel,
    status: student.status,
    avatarUrl: await signAvatar(student.avatarPath),
    subjectLevels: mapSubjectLevels(student),
    dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    joinedAt: student.joinedAt?.toISOString().slice(0, 10) ?? null,
    notes: student.notes,
    availability: student.availability.map((a) => ({
      id: a.id,
      weekday: a.weekday,
      startTime: a.startTime,
      endTime: a.endTime,
    })),
    parents: student.parents.map((p) => ({
      parentId: p.parentId,
      userId: p.parent.userId,
      fullName: p.parent.user.fullName,
      relationship: p.relationship,
    })),
    setupComplete: student.subjectLevels.length > 0 && student.availability.length > 0,
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

  const student = await prisma.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        fullName: input.fullName,
        dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
        gradeLabel: input.gradeLabel ?? null,
        notes: input.notes ?? null,
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

    if (input.availability.length) {
      await tx.studentAvailability.createMany({
        data: input.availability.map((a) => ({ ...a, studentId: created.id })),
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
    after: { fullName: student.fullName },
  });

  return { student: await getStudent(student.id), parentTempPassword: parentLink?.tempPassword ?? null };
}

export async function updateStudent(
  studentId: string,
  data: { fullName?: string; dateOfBirth?: string | null; gradeLabel?: string | null; notes?: string | null },
) {
  await prisma.student.update({
    where: { id: studentId },
    data: {
      ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      ...(data.gradeLabel !== undefined ? { gradeLabel: data.gradeLabel } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.dateOfBirth !== undefined
        ? { dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00.000Z`) : null }
        : {}),
    },
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

export async function putAvailability(
  studentId: string,
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
  actorId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.studentAvailability.deleteMany({ where: { studentId } });
    if (slots.length) {
      await tx.studentAvailability.createMany({ data: slots.map((s) => ({ ...s, studentId })) });
    }
  });

  await audit({ actorId, action: 'STUDENT_AVAILABILITY_SET', entity: 'Student', entityId: studentId });
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

import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { forbidden, notFound } from '../lib/errors.js';
import type { AuthContext } from '../types/express.js';

/**
 * Resource-scoped authorization.
 *
 * Role checks alone are not enough: a teacher may hold the TEACHER role and still
 * have no business reading another teacher's occurrence. Every scoped read below
 * pushes the constraint into the query rather than filtering after the fact, so
 * there is no unscoped findMany on student data (§2).
 */

/** Teachers may only touch occurrences they are assigned to. Admins may read any. */
export async function assertTeacherOwnsOccurrence(
  ctx: AuthContext,
  occurrenceId: string,
): Promise<void> {
  if (ctx.role === 'ADMIN') return;
  if (ctx.role !== 'TEACHER' || !ctx.teacherId) throw forbidden();

  const occurrence = await prisma.classOccurrence.findFirst({
    where: { id: occurrenceId, teacherId: ctx.teacherId },
    select: { id: true },
  });
  if (!occurrence) throw forbidden('This class is not assigned to you.');
}

/**
 * Who may write the curriculum under a level.
 *
 * The admin builds the structure — subjects and their levels — and a teacher
 * fills in the headings and sub-headings for what they actually teach. So the
 * test is their capability: the right subject, and a level inside the range they
 * were assigned. A teacher who has not been given the subject cannot author it.
 */
export async function assertCanAuthorLevel(ctx: AuthContext, levelId: string): Promise<void> {
  if (ctx.role === 'ADMIN') return;
  if (ctx.role !== 'TEACHER' || !ctx.teacherId) throw forbidden();

  const level = await prisma.level.findUnique({
    where: { id: levelId },
    select: { subjectId: true, displayOrder: true, name: true },
  });
  if (!level) throw notFound('Level');

  const capability = await prisma.teacherCapability.findUnique({
    where: { teacherId_subjectId: { teacherId: ctx.teacherId, subjectId: level.subjectId } },
    select: { minLevelOrder: true, maxLevelOrder: true },
  });
  if (!capability) throw forbidden('You can only edit the curriculum for a subject you teach.');

  if (level.displayOrder < capability.minLevelOrder || level.displayOrder > capability.maxLevelOrder) {
    throw forbidden(`${level.name} is outside the levels you are assigned to teach.`);
  }
}

/** The same check, reached from a heading or a sub-heading rather than a level. */
export async function assertCanAuthorTopic(ctx: AuthContext, topicId: string): Promise<void> {
  if (ctx.role === 'ADMIN') return;
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { levelId: true } });
  if (!topic) throw notFound('Heading');
  await assertCanAuthorLevel(ctx, topic.levelId);
}

export async function assertCanAuthorSkill(ctx: AuthContext, skillId: string): Promise<void> {
  if (ctx.role === 'ADMIN') return;
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { topic: { select: { levelId: true } } },
  });
  if (!skill) throw notFound('Sub-heading');
  await assertCanAuthorLevel(ctx, skill.topic.levelId);
}

/**
 * The students a teacher is responsible for by capability rather than by timetable.
 *
 * A capability is the admin stating "this teacher teaches this subject, over these
 * levels" (BR-05). So a child assigned that subject, at a level inside that range,
 * is already theirs to teach — before anyone has scheduled a class. Scoping on
 * classes alone left a teacher looking at an empty Students list for children they
 * had been given, which is the gap this closes.
 */
async function capabilityStudentWhere(teacherId: string): Promise<Prisma.StudentSubjectLevelWhereInput | null> {
  const capabilities = await prisma.teacherCapability.findMany({
    where: { teacherId },
    select: { subjectId: true, minLevelOrder: true, maxLevelOrder: true },
  });
  if (capabilities.length === 0) return null;

  return {
    isCurrent: true,
    OR: capabilities.map((c) => ({
      subjectId: c.subjectId,
      level: { displayOrder: { gte: c.minLevelOrder, lte: c.maxLevelOrder } },
    })),
  };
}

/** Parents may only read children linked to their parent record (BR-13). */
export async function assertParentLinkedToStudent(
  ctx: AuthContext,
  studentId: string,
): Promise<void> {
  if (!ctx.parentId) throw forbidden();

  const link = await prisma.parentStudent.findFirst({
    where: { parentId: ctx.parentId, studentId },
    select: { studentId: true },
  });
  if (!link) throw forbidden('You do not have access to this student.');
}

/**
 * The general "may this caller see this student?" check.
 *
 * Admin: any. Parent: linked children. Teacher: a child in one of their classes,
 * or one assigned a subject and level they hold the capability for — the two ways
 * a child comes to be theirs.
 */
export async function assertCanReadStudent(ctx: AuthContext, studentId: string): Promise<void> {
  if (ctx.role === 'ADMIN') return;

  if (ctx.role === 'PARENT') {
    await assertParentLinkedToStudent(ctx, studentId);
    return;
  }

  if (ctx.role === 'TEACHER' && ctx.teacherId) {
    const scheduled = await prisma.classStudent.findFirst({
      where: { studentId, class: { teacherId: ctx.teacherId } },
      select: { studentId: true },
    });
    if (scheduled) return;

    const byCapability = await capabilityStudentWhere(ctx.teacherId);
    if (byCapability) {
      const assigned = await prisma.studentSubjectLevel.findFirst({
        where: { ...byCapability, studentId },
        select: { studentId: true },
      });
      if (assigned) return;
    }

    throw forbidden('This student is not one of yours.');
  }

  throw forbidden();
}

/** Returns the student ids this caller may read, for list endpoints. */
export async function readableStudentIds(ctx: AuthContext): Promise<string[] | 'ALL'> {
  if (ctx.role === 'ADMIN') return 'ALL';

  if (ctx.role === 'PARENT' && ctx.parentId) {
    const links = await prisma.parentStudent.findMany({
      where: { parentId: ctx.parentId },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  if (ctx.role === 'TEACHER' && ctx.teacherId) {
    const byCapability = await capabilityStudentWhere(ctx.teacherId);

    const [scheduled, assigned] = await Promise.all([
      prisma.classStudent.findMany({
        where: { class: { teacherId: ctx.teacherId } },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      byCapability
        ? prisma.studentSubjectLevel.findMany({
            where: byCapability,
            select: { studentId: true },
            distinct: ['studentId'],
          })
        : Promise.resolve([]),
    ]);

    return [...new Set([...scheduled, ...assigned].map((r) => r.studentId))];
  }

  return [];
}

/** Loads a student the caller is allowed to see, or throws. */
export async function loadReadableStudent(ctx: AuthContext, studentId: string) {
  await assertCanReadStudent(ctx, studentId);
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student');
  return student;
}

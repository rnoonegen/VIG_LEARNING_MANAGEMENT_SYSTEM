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
 * Admin: any. Teacher: students in a class they teach. Parent: linked children.
 */
export async function assertCanReadStudent(ctx: AuthContext, studentId: string): Promise<void> {
  if (ctx.role === 'ADMIN') return;

  if (ctx.role === 'PARENT') {
    await assertParentLinkedToStudent(ctx, studentId);
    return;
  }

  if (ctx.role === 'TEACHER' && ctx.teacherId) {
    const taught = await prisma.classStudent.findFirst({
      where: { studentId, class: { teacherId: ctx.teacherId } },
      select: { studentId: true },
    });
    if (!taught) throw forbidden('This student is not in any of your classes.');
    return;
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
    const links = await prisma.classStudent.findMany({
      where: { class: { teacherId: ctx.teacherId } },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    return links.map((l) => l.studentId);
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

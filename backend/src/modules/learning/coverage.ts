import type { CoverageDto, PutCoverageInput } from '@vig/shared';
import { COVERED_STATUS, NOT_COVERED_STATUS } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { signAvatar } from '../../lib/storage.js';

/**
 * Coverage — which sub-headings a child has actually been taken through.
 *
 * The teacher's question at the end of a class is not "what level of mastery did
 * Kushi reach in adding fractions", it is "did we cover this with her". So this
 * is a tick per student per sub-heading, and nothing more.
 *
 * Every tick still appends a `learning_updates` row before projecting
 * `student_skill_progress` (BR-09), which is what makes "who ticked this, and
 * when" answerable months later — the same append-then-project pair the class
 * record uses.
 */

/** The level's headings, in curriculum order, for the class behind an occurrence. */
async function headingsForOccurrence(occurrenceId: string) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      class: {
        include: {
          subject: { select: { name: true, colorToken: true } },
          level: {
            select: {
              name: true,
              topics: {
                where: { status: { not: 'ARCHIVED' } },
                orderBy: { displayOrder: 'asc' },
                include: {
                  skills: {
                    where: { status: { not: 'ARCHIVED' } },
                    orderBy: { displayOrder: 'asc' },
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
          students: {
            include: { student: { select: { id: true, fullName: true, avatarPath: true } } },
          },
        },
      },
    },
  });
  if (!occurrence) throw notFound('Class');
  return occurrence;
}

/** studentId → the sub-headings they are already ticked against. */
export async function coveredByStudent(
  studentIds: string[],
  skillIds: string[],
): Promise<Record<string, string[]>> {
  const rows = await prisma.studentSkillProgress.findMany({
    where: { studentId: { in: studentIds }, skillId: { in: skillIds }, status: COVERED_STATUS },
    select: { studentId: true, skillId: true },
  });

  const covered: Record<string, string[]> = Object.fromEntries(studentIds.map((id) => [id, []]));
  for (const row of rows) covered[row.studentId]?.push(row.skillId);
  return covered;
}

export async function getCoverage(occurrenceId: string): Promise<CoverageDto> {
  const occurrence = await headingsForOccurrence(occurrenceId);
  const topics = occurrence.class.level.topics;
  const students = occurrence.class.students.map((cs) => cs.student);

  const covered = await coveredByStudent(
    students.map((s) => s.id),
    topics.flatMap((t) => t.skills.map((s) => s.id)),
  );

  return {
    occurrenceId,
    subjectName: occurrence.class.subject.name,
    colorToken: occurrence.class.subject.colorToken,
    levelName: occurrence.class.level.name,
    scheduledStart: occurrence.scheduledStart.toISOString(),
    students: await Promise.all(
      students.map(async (s) => ({
        id: s.id,
        fullName: s.fullName,
        avatarUrl: await signAvatar(s.avatarPath),
      })),
    ),
    headings: topics.map((t) => ({
      id: t.id,
      name: t.name,
      subHeadings: t.skills.map((s) => ({ id: s.id, name: s.name })),
    })),
    covered,
  };
}

/**
 * Applies a grid of ticks.
 *
 * Only genuine changes are written. Re-saving the same grid twice must not
 * produce a second page of identical history, or the trail stops being readable.
 */
export async function putCoverage(
  occurrenceId: string,
  entries: PutCoverageInput['entries'],
  authorId: string,
  source: 'TEACHER_MANUAL' | 'ADMIN_MANUAL',
): Promise<CoverageDto> {
  if (entries.length > 0) {
    const existing = await prisma.studentSkillProgress.findMany({
      where: {
        studentId: { in: [...new Set(entries.map((e) => e.studentId))] },
        skillId: { in: [...new Set(entries.map((e) => e.skillId))] },
      },
      select: { studentId: true, skillId: true, status: true },
    });
    const statusByKey = new Map(existing.map((row) => [`${row.studentId}:${row.skillId}`, row.status]));

    const changes = entries.filter((entry) => {
      const current = statusByKey.get(`${entry.studentId}:${entry.skillId}`);
      const wanted = entry.covered ? COVERED_STATUS : NOT_COVERED_STATUS;
      // An absent row means "not covered", which is what a false entry asks for.
      return (current ?? NOT_COVERED_STATUS) !== wanted;
    });

    if (changes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          const previous = statusByKey.get(`${change.studentId}:${change.skillId}`) ?? null;
          const status = change.covered ? COVERED_STATUS : NOT_COVERED_STATUS;

          await tx.learningUpdate.create({
            data: {
              studentId: change.studentId,
              skillId: change.skillId,
              previousStatus: previous,
              newStatus: status,
              source,
              authorId,
            },
          });

          await tx.studentSkillProgress.upsert({
            where: { studentId_skillId: { studentId: change.studentId, skillId: change.skillId } },
            create: {
              studentId: change.studentId,
              skillId: change.skillId,
              status,
              updatedBy: authorId,
            },
            update: { status, updatedBy: authorId },
          });
        }
      });
    }
  }

  return getCoverage(occurrenceId);
}

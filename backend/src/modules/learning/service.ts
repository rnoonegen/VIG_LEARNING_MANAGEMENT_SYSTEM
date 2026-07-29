import type { LearningUpdateDto, LevelChangePreviewDto, SkillStatus, SubjectLearningDto } from '@vig/shared';
import { SKILL_STATUSES } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

/**
 * The Learning Map answers "where is this student?", which is a different
 * question from "what does the curriculum contain?" (BR-07). Skill status belongs
 * to the student; the curriculum only defines that the skill exists.
 *
 * Every status change appends a `learning_updates` row and projects
 * `student_skill_progress` in the same transaction (BR-09) — fast reads, replayable
 * truth, no destructive overwrite.
 */

function emptyCounts(): Record<SkillStatus, number> {
  return { TO_LEARN: 0, LEARNING: 0, NEEDS_SUPPORT: 0, MASTERED: 0 };
}

/**
 * Which skills in a level are finished and which are not (BR-08).
 *
 * A skill with no progress row has not been started, so it counts as TO_LEARN
 * rather than being silently omitted — otherwise a level nobody has touched
 * would look complete and the carry-forward list would come back empty.
 *
 * Pure and exported so the rule is unit-tested independently of the query that
 * feeds it.
 */
export function summariseLevelProgress(
  skills: Array<{ id: string; name: string }>,
  statusById: Map<string, SkillStatus>,
): {
  counts: Record<SkillStatus, number>;
  unfinishedSkills: Array<{ id: string; name: string; status: SkillStatus }>;
} {
  const counts = emptyCounts();
  const unfinishedSkills: Array<{ id: string; name: string; status: SkillStatus }> = [];

  for (const skill of skills) {
    const status = statusById.get(skill.id) ?? 'TO_LEARN';
    counts[status] += 1;
    // Anything short of Mastered is a carry-forward candidate.
    if (status !== 'MASTERED') unfinishedSkills.push({ id: skill.id, name: skill.name, status });
  }

  return { counts, unfinishedSkills };
}

export async function getLearning(studentId: string): Promise<SubjectLearningDto[]> {
  const assignments = await prisma.studentSubjectLevel.findMany({
    where: { studentId, isCurrent: true },
    include: {
      subject: true,
      level: {
        include: {
          topics: {
            where: { status: { not: 'ARCHIVED' } },
            orderBy: { displayOrder: 'asc' },
            include: {
              skills: { where: { status: { not: 'ARCHIVED' } }, orderBy: { displayOrder: 'asc' } },
            },
          },
        },
      },
    },
    orderBy: { subject: { displayOrder: 'asc' } },
  });

  const progress = await prisma.studentSkillProgress.findMany({ where: { studentId } });
  const byskill = new Map(progress.map((p) => [p.skillId, p]));

  return assignments.map((a) => {
    const counts = emptyCounts();
    const topics = a.level.topics.map((t) => ({
      topicId: t.id,
      topicName: t.name,
      skills: t.skills.map((s) => {
        const current = byskill.get(s.id);
        const status = (current?.status ?? 'TO_LEARN') as SkillStatus;
        counts[status] += 1;
        return {
          skillId: s.id,
          skillName: s.name,
          status,
          updatedAt: current?.updatedAt.toISOString() ?? null,
        };
      }),
    }));

    return {
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      colorToken: a.subject.colorToken,
      levelId: a.levelId,
      levelName: a.level.name,
      topics,
      counts,
    };
  });
}

export async function getSubjectLearning(studentId: string, subjectId: string): Promise<SubjectLearningDto> {
  const all = await getLearning(studentId);
  const match = all.find((s) => s.subjectId === subjectId);
  if (!match) throw notFound('Subject for this student');
  return match;
}

/** Recent learning history, used by the profile and the weekly update. */
export async function getLearningHistory(studentId: string, since?: Date): Promise<LearningUpdateDto[]> {
  const rows = await prisma.learningUpdate.findMany({
    where: { studentId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      skill: { include: { topic: { include: { level: { include: { subject: true } } } } } },
      author: { select: { fullName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    skillName: r.skill.name,
    subjectName: r.skill.topic.level.subject.name,
    previousStatus: r.previousStatus,
    newStatus: r.newStatus,
    note: r.note,
    source: r.source,
    authorName: r.author.fullName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * A single skill status change, outside the class-record flow.
 * Same append-then-project pair the atomic save uses, so both paths produce
 * identical history.
 */
export async function updateSkillStatus(
  studentId: string,
  skillId: string,
  input: { status: SkillStatus; note?: string },
  authorId: string,
  source: 'TEACHER_MANUAL' | 'ADMIN_MANUAL',
) {
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw notFound('Skill');

  await prisma.$transaction(async (tx) => {
    const current = await tx.studentSkillProgress.findUnique({
      where: { studentId_skillId: { studentId, skillId } },
    });

    await tx.learningUpdate.create({
      data: {
        studentId,
        skillId,
        previousStatus: current?.status ?? null,
        newStatus: input.status,
        note: input.note ?? null,
        source,
        authorId,
      },
    });

    await tx.studentSkillProgress.upsert({
      where: { studentId_skillId: { studentId, skillId } },
      create: { studentId, skillId, status: input.status, updatedBy: authorId },
      update: { status: input.status, updatedBy: authorId },
    });
  });

  return getSubjectLearningBySkill(studentId, skillId);
}

async function getSubjectLearningBySkill(studentId: string, skillId: string) {
  const skill = await prisma.skill.findUniqueOrThrow({
    where: { id: skillId },
    include: { topic: { include: { level: true } } },
  });
  return getSubjectLearning(studentId, (await prisma.level.findUniqueOrThrow({
    where: { id: skill.topic.levelId },
    select: { subjectId: true },
  })).subjectId);
}

/**
 * What moving up would mean, shown before anything changes (F4).
 * Level progression must not erase the journey: the preview names exactly which
 * skills are unfinished so the school decides what carries forward.
 */
export async function levelChangePreview(studentId: string, subjectId: string): Promise<LevelChangePreviewDto> {
  const assignment = await prisma.studentSubjectLevel.findFirst({
    where: { studentId, subjectId, isCurrent: true },
    include: {
      subject: true,
      level: {
        include: {
          topics: { include: { skills: { where: { status: { not: 'ARCHIVED' } } } } },
        },
      },
    },
  });
  if (!assignment) throw notFound('Current level for this subject');

  const skills = assignment.level.topics.flatMap((t) => t.skills);
  const progress = await prisma.studentSkillProgress.findMany({
    where: { studentId, skillId: { in: skills.map((s) => s.id) } },
  });
  const byId = new Map(progress.map((p) => [p.skillId, p.status as SkillStatus]));
  const { counts, unfinishedSkills } = summariseLevelProgress(skills, byId);

  const next = await prisma.level.findFirst({
    where: {
      subjectId,
      status: 'ACTIVE',
      displayOrder: { gt: assignment.level.displayOrder },
    },
    orderBy: { displayOrder: 'asc' },
  });

  return {
    subjectId,
    subjectName: assignment.subject.name,
    currentLevelId: assignment.levelId,
    currentLevelName: assignment.level.name,
    nextLevelId: next?.id ?? null,
    nextLevelName: next?.name ?? null,
    counts,
    unfinishedSkills,
  };
}

/**
 * Confirms the move. The previous level stays queryable and carried-forward
 * skills keep their status so they can be picked up again (BR-08).
 */
export async function applyLevelChange(
  studentId: string,
  input: { subjectId: string; toLevelId?: string; carriedForwardSkillIds: string[] },
  actorId: string,
) {
  const assignment = await prisma.studentSubjectLevel.findFirst({
    where: { studentId, subjectId: input.subjectId, isCurrent: true },
  });
  if (!assignment) throw notFound('Current level for this subject');

  if (!input.toLevelId) {
    // "Stay on this level" is a valid outcome — record the decision, change nothing.
    await audit({
      actorId,
      action: 'LEVEL_CHANGE_DECLINED',
      entity: 'Student',
      entityId: studentId,
      after: { subjectId: input.subjectId },
    });
    return levelChangePreview(studentId, input.subjectId);
  }

  const target = await prisma.level.findUnique({ where: { id: input.toLevelId } });
  if (!target || target.subjectId !== input.subjectId) {
    throw badRequest('That level does not belong to this subject.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentSubjectLevel.update({
      where: { id: assignment.id },
      data: { isCurrent: false, completedAt: new Date() },
    });

    await tx.studentSubjectLevel.upsert({
      where: {
        studentId_subjectId_levelId: { studentId, subjectId: input.subjectId, levelId: input.toLevelId! },
      },
      create: { studentId, subjectId: input.subjectId, levelId: input.toLevelId!, isCurrent: true },
      update: { isCurrent: true, completedAt: null },
    });

    await tx.levelCompletion.create({
      data: {
        studentId,
        subjectId: input.subjectId,
        fromLevelId: assignment.levelId,
        toLevelId: input.toLevelId,
        carriedForwardSkillIds: input.carriedForwardSkillIds,
        confirmedBy: actorId,
      },
    });
  });

  await audit({
    actorId,
    action: 'LEVEL_CHANGED',
    entity: 'Student',
    entityId: studentId,
    after: {
      subjectId: input.subjectId,
      fromLevelId: assignment.levelId,
      toLevelId: input.toLevelId,
      carriedForward: input.carriedForwardSkillIds.length,
    },
  });

  return levelChangePreview(studentId, input.subjectId);
}

/** Every status the UI may offer, in a stable order. */
export const skillStatuses = SKILL_STATUSES;

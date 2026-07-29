import type { LevelDto, SkillDto, SubjectDto, TopicDto } from '@vig/shared';
import { subjectColor } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * Curriculum defines what exists; the Learning Map defines where a student is
 * (BR-07). Nothing here touches student progress.
 *
 * Archiving is used everywhere a delete would otherwise be (BR-17) — a skill
 * that has been assessed must stay queryable.
 */

const ACTIVE = { status: { not: 'ARCHIVED' as const } };

export async function listSubjects(includeArchived = false): Promise<SubjectDto[]> {
  const subjects = await prisma.subject.findMany({
    where: includeArchived ? {} : ACTIVE,
    orderBy: { displayOrder: 'asc' },
    include: { _count: { select: { levels: true } } },
  });

  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    colorToken: s.colorToken,
    displayOrder: s.displayOrder,
    status: s.status,
    levelCount: s._count.levels,
  }));
}

export async function getSubject(subjectId: string): Promise<SubjectDto> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      levels: {
        where: ACTIVE,
        orderBy: { displayOrder: 'asc' },
        include: {
          topics: {
            where: ACTIVE,
            orderBy: { displayOrder: 'asc' },
            include: { _count: { select: { skills: true } } },
          },
        },
      },
    },
  });
  if (!subject) throw notFound('Subject');

  const levels: LevelDto[] = subject.levels.map((l) => ({
    id: l.id,
    name: l.name,
    displayOrder: l.displayOrder,
    status: l.status,
    topicCount: l.topics.length,
    skillCount: l.topics.reduce((sum, t) => sum + t._count.skills, 0),
  }));

  return {
    id: subject.id,
    name: subject.name,
    colorToken: subject.colorToken,
    displayOrder: subject.displayOrder,
    status: subject.status,
    levelCount: levels.length,
    levels,
  };
}

export async function getLevel(levelId: string): Promise<LevelDto & { subject: SubjectDto }> {
  const level = await prisma.level.findUnique({
    where: { id: levelId },
    include: {
      subject: true,
      topics: {
        where: ACTIVE,
        orderBy: { displayOrder: 'asc' },
        include: { _count: { select: { skills: true } } },
      },
    },
  });
  if (!level) throw notFound('Level');

  const topics: TopicDto[] = level.topics.map((t) => ({
    id: t.id,
    name: t.name,
    displayOrder: t.displayOrder,
    status: t.status,
    skillCount: t._count.skills,
  }));

  return {
    id: level.id,
    name: level.name,
    displayOrder: level.displayOrder,
    status: level.status,
    topicCount: topics.length,
    skillCount: topics.reduce((sum, t) => sum + t.skillCount, 0),
    topics,
    subject: {
      id: level.subject.id,
      name: level.subject.name,
      colorToken: level.subject.colorToken,
      displayOrder: level.subject.displayOrder,
      status: level.subject.status,
      levelCount: 0,
    },
  };
}

export async function getTopic(
  topicId: string,
): Promise<TopicDto & { levelId: string; levelName: string; subjectId: string; subjectName: string }> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      skills: { where: ACTIVE, orderBy: { displayOrder: 'asc' } },
      level: { include: { subject: true } },
    },
  });
  if (!topic) throw notFound('Topic');

  const skills: SkillDto[] = topic.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    learningGoal: s.learningGoal,
    displayOrder: s.displayOrder,
    status: s.status,
  }));

  return {
    id: topic.id,
    name: topic.name,
    displayOrder: topic.displayOrder,
    status: topic.status,
    skillCount: skills.length,
    skills,
    levelId: topic.levelId,
    levelName: topic.level.name,
    subjectId: topic.level.subjectId,
    subjectName: topic.level.subject.name,
  };
}

// --- Creates ----------------------------------------------------------------

async function nextOrder(
  model: 'level' | 'topic' | 'skill' | 'subject',
  where: Record<string, unknown>,
): Promise<number> {
  // @ts-expect-error — indexed access across four delegates with identical shape
  const last = await prisma[model].findFirst({ where, orderBy: { displayOrder: 'desc' }, select: { displayOrder: true } });
  return (last?.displayOrder ?? -1) + 1;
}

export async function createSubject(input: { name: string; colorToken?: string }) {
  return prisma.subject.create({
    data: {
      name: input.name,
      colorToken: input.colorToken ?? subjectColor(input.name),
      displayOrder: await nextOrder('subject', {}),
    },
  });
}

export async function createLevel(subjectId: string, name: string) {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) throw notFound('Subject');
  return prisma.level.create({
    data: { subjectId, name, displayOrder: await nextOrder('level', { subjectId }) },
  });
}

export async function createTopic(levelId: string, name: string) {
  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) throw notFound('Level');
  return prisma.topic.create({
    data: { levelId, name, displayOrder: await nextOrder('topic', { levelId }) },
  });
}

export async function createSkill(
  topicId: string,
  input: { name: string; description?: string; learningGoal?: string },
) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) throw notFound('Topic');
  return prisma.skill.create({
    data: {
      topicId,
      name: input.name,
      description: input.description ?? null,
      learningGoal: input.learningGoal ?? null,
      displayOrder: await nextOrder('skill', { topicId }),
    },
  });
}

// --- Updates & reordering ---------------------------------------------------

type NodeKind = 'subjects' | 'levels' | 'topics' | 'skills';

const delegateFor = {
  subjects: () => prisma.subject,
  levels: () => prisma.level,
  topics: () => prisma.topic,
  skills: () => prisma.skill,
} as const;

export async function updateNode(kind: NodeKind, id: string, data: Record<string, unknown>) {
  const delegate = delegateFor[kind]?.();
  if (!delegate) throw badRequest('Unknown curriculum node type.');
  // Strip keys that do not exist on the target model rather than letting Prisma throw.
  const allowed: Record<NodeKind, string[]> = {
    subjects: ['name', 'colorToken', 'displayOrder', 'status'],
    levels: ['name', 'displayOrder', 'status'],
    topics: ['name', 'displayOrder', 'status'],
    skills: ['name', 'description', 'learningGoal', 'displayOrder', 'status'],
  };
  const payload = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => allowed[kind].includes(k) && v !== undefined),
  );
  // @ts-expect-error — four delegates, one shape
  return delegate.update({ where: { id }, data: payload });
}

/** Persists an explicit ordering. The client sends the full ordered id list. */
export async function reorder(kind: NodeKind, orderedIds: string[]) {
  const delegate = delegateFor[kind]?.();
  if (!delegate) throw badRequest('Unknown curriculum node type.');

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      // @ts-expect-error — four delegates, one shape
      delegate.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );
  return { reordered: orderedIds.length };
}

/** Archive, never hard-delete, anything with history (BR-17). */
export async function archiveNode(kind: NodeKind, id: string) {
  return updateNode(kind, id, { status: 'ARCHIVED' });
}

/** Flat skill list for a level — what the class-record picker needs. */
export async function skillsForLevel(levelId: string) {
  const topics = await prisma.topic.findMany({
    where: { levelId, ...ACTIVE },
    orderBy: { displayOrder: 'asc' },
    include: { skills: { where: ACTIVE, orderBy: { displayOrder: 'asc' } } },
  });
  return topics.flatMap((t) => t.skills.map((s) => ({ id: s.id, name: s.name, topicName: t.name })));
}

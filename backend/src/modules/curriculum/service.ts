import type { CurriculumSubjectDto, LevelDto, Role, SubjectDto } from '@vig/shared';
import { subjectColor } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

/**
 * Curriculum defines what exists; the Learning Map defines where a student is
 * (BR-07). Nothing here touches student progress.
 *
 * The shape is Subject → Level → Heading → Sub-heading. Subjects and levels are
 * structure and belong to the admin; headings and sub-headings are content and
 * are written by whoever teaches that level, with their name and the time
 * recorded against each entry.
 *
 * Archiving is used everywhere a delete would otherwise be (BR-17) — a
 * sub-heading a child has already been ticked against must stay queryable.
 */

const ACTIVE = { status: { not: 'ARCHIVED' as const } };

/**
 * Every subject opens with the same four levels. They are named rather than
 * numbered so a school can call them what it likes, but there are four, and the
 * admin renames rather than invents them.
 */
export const DEFAULT_LEVEL_NAMES = ['L1', 'L2', 'L3', 'L4'] as const;

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

/**
 * The whole curriculum in one call: every subject, its four levels, and the
 * headings and sub-headings underneath.
 *
 * It is one page rather than four drill-downs because the thing an admin or a
 * teacher actually wants to see is the shape of a subject, not one node of it.
 * Fewer than ten teachers and a handful of subjects — the whole tree is small.
 *
 * `canAuthor` is computed per level from the caller's capabilities, so the UI
 * never offers an "Add heading" button that the API would then refuse.
 */
export async function getTree(
  ctx: { role: Role; teacherId: string | null },
  onlyMine = false,
): Promise<CurriculumSubjectDto[]> {
  const capabilities = ctx.teacherId
    ? await prisma.teacherCapability.findMany({
        where: { teacherId: ctx.teacherId },
        select: { subjectId: true, minLevelOrder: true, maxLevelOrder: true },
      })
    : [];
  const capabilityBySubject = new Map(capabilities.map((c) => [c.subjectId, c]));
  const isAdmin = ctx.role === 'ADMIN';

  const subjects = await prisma.subject.findMany({
    where: {
      ...ACTIVE,
      ...(onlyMine && !isAdmin ? { id: { in: capabilities.map((c) => c.subjectId) } } : {}),
    },
    orderBy: { displayOrder: 'asc' },
    include: {
      capabilities: {
        include: { teacher: { include: { user: { select: { fullName: true, status: true } } } } },
      },
      levels: {
        where: ACTIVE,
        orderBy: { displayOrder: 'asc' },
        include: {
          topics: {
            where: ACTIVE,
            orderBy: { displayOrder: 'asc' },
            include: {
              createdBy: { select: { fullName: true } },
              skills: {
                where: ACTIVE,
                orderBy: { displayOrder: 'asc' },
                include: { createdBy: { select: { fullName: true } } },
              },
            },
          },
        },
      },
    },
  });

  return subjects.map((subject) => {
    const capability = capabilityBySubject.get(subject.id);

    return {
      id: subject.id,
      name: subject.name,
      colorToken: subject.colorToken,
      displayOrder: subject.displayOrder,
      canRename: isAdmin,
      teacherNames: subject.capabilities
        .filter((c) => c.teacher.user.status === 'ACTIVE')
        .map((c) => c.teacher.user.fullName),
      levels: subject.levels.map((level) => ({
        id: level.id,
        name: level.name,
        displayOrder: level.displayOrder,
        canAuthor:
          isAdmin ||
          (capability !== undefined &&
            level.displayOrder >= capability.minLevelOrder &&
            level.displayOrder <= capability.maxLevelOrder),
        headings: level.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          displayOrder: topic.displayOrder,
          addedByName: topic.createdBy?.fullName ?? null,
          addedAt: topic.createdAt.toISOString(),
          subHeadings: topic.skills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            displayOrder: skill.displayOrder,
            addedByName: skill.createdBy?.fullName ?? null,
            addedAt: skill.createdAt.toISOString(),
          })),
        })),
      })),
    };
  });
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

/** A new subject arrives with its four levels already in place. */
export async function createSubject(input: { name: string; colorToken?: string }, actorId: string) {
  const displayOrder = await nextOrder('subject', {});

  const subject = await prisma.$transaction(async (tx) => {
    const created = await tx.subject.create({
      data: {
        name: input.name,
        colorToken: input.colorToken ?? subjectColor(input.name),
        displayOrder,
      },
    });

    await tx.level.createMany({
      data: DEFAULT_LEVEL_NAMES.map((name, index) => ({
        subjectId: created.id,
        name,
        displayOrder: index,
      })),
    });

    return created;
  });

  await audit({
    actorId,
    action: 'SUBJECT_CREATED',
    entity: 'Subject',
    entityId: subject.id,
    after: { name: subject.name, levels: DEFAULT_LEVEL_NAMES.length },
  });

  return subject;
}

export async function createLevel(subjectId: string, name: string) {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject) throw notFound('Subject');
  return prisma.level.create({
    data: { subjectId, name, displayOrder: await nextOrder('level', { subjectId }) },
  });
}

/** A heading. The author is stamped on it — see the note at the top of this file. */
export async function createTopic(levelId: string, name: string, actorId: string) {
  const level = await prisma.level.findUnique({ where: { id: levelId } });
  if (!level) throw notFound('Level');
  return prisma.topic.create({
    data: {
      levelId,
      name,
      createdById: actorId,
      displayOrder: await nextOrder('topic', { levelId }),
    },
  });
}

export async function createSkill(
  topicId: string,
  input: { name: string; description?: string; learningGoal?: string },
  actorId: string,
) {
  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  if (!topic) throw notFound('Heading');
  return prisma.skill.create({
    data: {
      topicId,
      name: input.name,
      description: input.description ?? null,
      learningGoal: input.learningGoal ?? null,
      createdById: actorId,
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

/** Flat sub-heading list for a level, used where a picker needs one list. */
export async function skillsForLevel(levelId: string) {
  const topics = await prisma.topic.findMany({
    where: { levelId, ...ACTIVE },
    orderBy: { displayOrder: 'asc' },
    include: { skills: { where: ACTIVE, orderBy: { displayOrder: 'asc' } } },
  });
  return topics.flatMap((t) => t.skills.map((s) => ({ id: s.id, name: s.name, topicName: t.name })));
}

/** The same content grouped, which is how the coverage grid reads it. */
export async function headingsForLevel(levelId: string) {
  const topics = await prisma.topic.findMany({
    where: { levelId, ...ACTIVE },
    orderBy: { displayOrder: 'asc' },
    include: {
      skills: {
        where: ACTIVE,
        orderBy: { displayOrder: 'asc' },
        select: { id: true, name: true },
      },
    },
  });

  return topics.map((t) => ({ id: t.id, name: t.name, subHeadings: t.skills }));
}

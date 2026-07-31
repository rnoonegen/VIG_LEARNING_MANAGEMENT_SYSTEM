import type { WeeklyUpdateDto, WeeklyUpdateItemDto } from '@vig/shared';
import { SKILL_STATUS_META, addDays, formatShortDate, startOfWeek, toDateKey } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { notify } from '../notifications/service.js';
import { deliver } from '../notifications/push.js';
import { listMoments } from '../moments/service.js';

/**
 * The weekly update turns a week of approved records into a parent-friendly
 * story. It is not a raw dump of every teacher note.
 *
 * Item selection and the "Week at a glance" narrative are deterministic template
 * assembly (Q4 default) — no model involved. Only teacher-approved material is
 * eligible, so a parent can never see a draft (BR-13).
 */

function weekBounds(weekStartKey: string) {
  const weekStart = new Date(`${weekStartKey}T00:00:00.000Z`);
  const weekEnd = addDays(weekStart, 6);
  const rangeEnd = new Date(weekEnd);
  rangeEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd, rangeEnd };
}

/** Sentence-cases a list: ["a","b","c"] → "a, b and c". */
function joinNaturally(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function currentWeekStart(reference = new Date()): string {
  return toDateKey(startOfWeek(reference, 1));
}

/**
 * Builds (or rebuilds) the draft for one student-week.
 *
 * Regenerating replaces the item set but keeps the row, so a published update
 * keeps its identity and the parent's link never breaks.
 */
export async function generate(studentId: string, weekStartKey: string) {
  const { weekStart, weekEnd, rangeEnd } = weekBounds(weekStartKey);

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw notFound('Student');

  const [learning, development, records, moments] = await Promise.all([
    prisma.learningUpdate.findMany({
      where: { studentId, createdAt: { gte: weekStart, lte: rangeEnd } },
      include: { skill: { include: { topic: { include: { level: { include: { subject: true } } } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.developmentObservation.findMany({
      where: { studentId, observedOn: { gte: weekStart, lte: weekEnd } },
      include: { area: true },
      orderBy: { observedOn: 'asc' },
    }),
    prisma.classRecord.findMany({
      where: {
        status: 'SAVED',
        occurrence: {
          scheduledStart: { gte: weekStart, lte: rangeEnd },
          class: { students: { some: { studentId } } },
        },
      },
      include: { occurrence: { include: { class: { include: { subject: true } } } } },
      orderBy: { savedAt: 'asc' },
    }),
    prisma.moment.findMany({
      where: { students: { some: { studentId } }, capturedOn: { gte: weekStart, lte: weekEnd } },
      select: { id: true, title: true },
      orderBy: { capturedOn: 'asc' },
      take: 6,
    }),
  ]);

  // --- Week at a glance, assembled from what was actually approved ----------
  const subjectsWorkedOn = [...new Set(records.map((r) => r.occurrence.class.subject.name))];
  const covered = learning.filter((l) => l.newStatus === 'MASTERED').map((l) => l.skill.name);
  const growthAreas = [...new Set(development.map((d) => d.area.name))];

  const sentences: string[] = [];
  if (subjectsWorkedOn.length) {
    sentences.push(
      `This week ${student.fullName.split(' ')[0]} worked on ${joinNaturally(subjectsWorkedOn)}.`,
    );
  }
  if (covered.length) {
    sentences.push(`They were taken through ${joinNaturally(covered)}.`);
  }
  if (growthAreas.length) {
    sentences.push(`Teachers also noted growth in ${joinNaturally(growthAreas.map((g) => g.toLowerCase()))}.`);
  }
  if (sentences.length === 0) {
    sentences.push(
      `There were no completed classes for ${student.fullName.split(' ')[0]} this week.`,
    );
  }

  const items: Array<Omit<WeeklyUpdateItemDto, 'id'>> = [];
  let order = 0;

  for (const l of learning) {
    items.push({
      itemType: 'LEARNING',
      refId: l.id,
      highlightText: `${l.skill.topic.level.subject.name} · ${l.skill.name} — ${
        SKILL_STATUS_META[l.newStatus].label
      }`,
      displayOrder: order++,
    });
  }
  for (const d of development) {
    items.push({
      itemType: 'DEVELOPMENT',
      refId: d.id,
      highlightText: `${d.area.name}: ${d.observation}`,
      displayOrder: order++,
    });
  }
  for (const r of records) {
    items.push({
      itemType: 'CLASS_NOTE',
      refId: r.id,
      highlightText: `${r.occurrence.class.subject.name} · ${formatShortDate(
        r.occurrence.scheduledStart,
      )} — ${r.overallClassNote}`,
      displayOrder: order++,
    });
  }
  for (const m of moments) {
    items.push({ itemType: 'MOMENT', refId: m.id, highlightText: m.title, displayOrder: order++ });
  }

  const update = await prisma.$transaction(async (tx) => {
    const row = await tx.weeklyUpdate.upsert({
      where: { studentId_weekStart: { studentId, weekStart } },
      create: {
        studentId,
        weekStart,
        weekEnd,
        summaryText: sentences.join(' '),
        status: 'DRAFT',
      },
      update: { summaryText: sentences.join(' '), weekEnd, generatedAt: new Date() },
    });

    await tx.weeklyUpdateItem.deleteMany({ where: { weeklyUpdateId: row.id } });
    if (items.length) {
      await tx.weeklyUpdateItem.createMany({
        data: items.map((i) => ({ ...i, weeklyUpdateId: row.id })),
      });
    }
    return row;
  });

  return getUpdate(update.id, { includeDrafts: true });
}

/** Generates a draft for every active student. Runs on the weekly job. */
export async function generateAll(weekStartKey: string) {
  const students = await prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  const results = [];
  for (const s of students) results.push(await generate(s.id, weekStartKey));
  return results;
}

export async function getUpdate(
  id: string,
  options: { includeDrafts?: boolean } = {},
): Promise<WeeklyUpdateDto> {
  const row = await prisma.weeklyUpdate.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, fullName: true } },
      items: { orderBy: { displayOrder: 'asc' } },
    },
  });
  if (!row) throw notFound('Weekly update');
  if (row.status !== 'PUBLISHED' && !options.includeDrafts) throw notFound('Weekly update');

  const momentIds = row.items.filter((i) => i.itemType === 'MOMENT').map((i) => i.refId!);
  const moments = momentIds.length
    ? (await listMoments({ scope: 'ALL', studentId: row.studentId })).filter((m) =>
        momentIds.includes(m.id),
      )
    : [];

  const pick = (type: WeeklyUpdateItemDto['itemType']): WeeklyUpdateItemDto[] =>
    row.items
      .filter((i) => i.itemType === type)
      .map((i) => ({
        id: i.id,
        itemType: i.itemType,
        refId: i.refId,
        highlightText: i.highlightText,
        displayOrder: i.displayOrder,
      }));

  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.fullName,
    weekStart: row.weekStart.toISOString().slice(0, 10),
    weekEnd: row.weekEnd.toISOString().slice(0, 10),
    summaryText: row.summaryText,
    teacherNote: row.teacherNote,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    learning: pick('LEARNING'),
    development: pick('DEVELOPMENT'),
    classNotes: pick('CLASS_NOTE'),
    moments,
  };
}

/**
 * Publishing is the single moment a parent hears from us all week (BR-14).
 * An admin does it deliberately; nothing auto-publishes to families.
 */
export async function publish(id: string, teacherNote: string | undefined, actorId: string) {
  const row = await prisma.weeklyUpdate.findUnique({
    where: { id },
    include: { student: { include: { parents: { include: { parent: true } } } } },
  });
  if (!row) throw notFound('Weekly update');
  if (row.status === 'PUBLISHED') throw badRequest('This update has already been published.');

  await prisma.weeklyUpdate.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ...(teacherNote !== undefined ? { teacherNote } : {}),
    },
  });

  for (const link of row.student.parents) {
    const title = `${row.student.fullName}'s weekly update is ready`;
    const body = 'See what they learned, worked on and experienced this week.';

    await notify({
      recipientUserId: link.parent.userId,
      type: 'WEEKLY_UPDATE_READY',
      title,
      body,
      payload: { weeklyUpdateId: id, studentId: row.studentId },
    });

    // The one push a parent receives all week (BR-14). No-ops while
    // FEATURE_WEB_PUSH is off; the in-app notification above is the launch
    // channel and has already been written.
    await deliver(link.parent.userId, { title, body, url: `/parent/weekly-updates/${id}` });
  }

  await audit({ actorId, action: 'WEEKLY_UPDATE_PUBLISHED', entity: 'WeeklyUpdate', entityId: id });
  return getUpdate(id, { includeDrafts: true });
}

export async function listForStudent(studentId: string, publishedOnly: boolean) {
  const rows = await prisma.weeklyUpdate.findMany({
    where: { studentId, ...(publishedOnly ? { status: 'PUBLISHED' } : {}) },
    orderBy: { weekStart: 'desc' },
    take: 26,
  });

  return rows.map((r) => ({
    id: r.id,
    weekStart: r.weekStart.toISOString().slice(0, 10),
    weekEnd: r.weekEnd.toISOString().slice(0, 10),
    status: r.status,
    summaryText: r.summaryText,
    publishedAt: r.publishedAt?.toISOString() ?? null,
  }));
}

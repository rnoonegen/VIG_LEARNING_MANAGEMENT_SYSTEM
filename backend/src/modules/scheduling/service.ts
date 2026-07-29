import type { Prisma } from '@prisma/client';
import type { ConfirmScheduleInput, OccurrenceDto, ScheduleOptionsInput, SlotOptionDto } from '@vig/shared';
import { toHHMM, toMinutes } from '@vig/shared';
import { prisma } from '../../prisma.js';
import type { Tx } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { notify } from '../notifications/service.js';
import {
  combineDateAndTime,
  findValidSlots,
  validateMove,
  type RankedSlot,
  type SchedulingSnapshot,
} from './engine.js';

/** How far ahead occurrences are materialised (AD-05). */
const HORIZON_DAYS = 120;

// ---------------------------------------------------------------------------
// Snapshot loading — the only place the engine touches the database
// ---------------------------------------------------------------------------

async function loadSnapshot(levelId: string, studentIds: string[]): Promise<SchedulingSnapshot> {
  const level = await prisma.level.findUnique({ where: { id: levelId }, select: { displayOrder: true } });
  if (!level) throw notFound('Level');

  const [teachers, students, booked] = await Promise.all([
    prisma.teacher.findMany({
      where: { user: { status: 'ACTIVE' } },
      include: { user: { select: { fullName: true } }, capabilities: true, availability: true, exceptions: true },
    }),
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { availability: true },
    }),
    prisma.classOccurrence.findMany({
      where: { status: 'SCHEDULED', scheduledStart: { gte: new Date() } },
      include: { class: { include: { students: { select: { studentId: true } } } } },
    }),
  ]);

  return {
    levelOrder: level.displayOrder,
    teachers: teachers.map((t) => ({
      teacherId: t.id,
      fullName: t.user.fullName,
      capabilities: t.capabilities.map((c) => ({
        subjectId: c.subjectId,
        minLevelOrder: c.minLevelOrder,
        maxLevelOrder: c.maxLevelOrder,
        isPrimary: c.isPrimary,
      })),
      availability: t.availability,
      exceptions: t.exceptions,
    })),
    students: students.map((s) => ({
      studentId: s.id,
      fullName: s.fullName,
      availability: s.availability,
    })),
    booked: booked.map((o) => ({
      teacherId: o.teacherId,
      studentIds: o.class.students.map((cs) => cs.studentId),
      start: o.scheduledStart,
      end: o.scheduledEnd,
    })),
  };
}

/**
 * Structured request → ranked valid options.
 *
 * TODO(AI-PHASE-2): Phase 2 adds POST /schedule/interpret ahead of this, turning
 * a sentence into exactly this input. This function does not change.
 * See docs/DEFERRED-AI.md §2.1.
 */
export async function findOptions(
  input: ScheduleOptionsInput,
  adminId: string,
): Promise<{ options: Array<SlotOptionDto & { teacherId: string; teacherName: string }>; requestId: string }> {
  const snapshot = await loadSnapshot(input.levelId, input.studentIds);
  const options = findValidSlots(input, snapshot);

  const request = await prisma.schedulingRequest.create({
    data: {
      adminId,
      // Week 1 stores the structured form payload; Phase 2 stores the sentence.
      rawText: JSON.stringify(input),
      interpreted: input,
      status: options.length ? 'OPTIONS_FOUND' : 'NO_OPTIONS',
    },
  });

  return { options, requestId: request.id };
}

// ---------------------------------------------------------------------------
// Occurrence materialisation (AD-05)
// ---------------------------------------------------------------------------

/**
 * Expands a weekly recurrence into concrete instants over the horizon.
 *
 * Exported for its unit tests: recurrence is where end dates, mid-week edits and
 * horizon boundaries go wrong, and every occurrence downstream — attendance,
 * class records, the schedule grid — is built on what this returns.
 */
export function expandOccurrences(
  klass: { daysOfWeek: number[]; startTime: string; durationMinutes: number; startDate: Date; endDate: Date | null },
  from: Date,
  horizonDays: number,
): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  const begin = new Date(Math.max(+from, +klass.startDate));
  begin.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < horizonDays; i += 1) {
    const day = new Date(begin);
    day.setUTCDate(day.getUTCDate() + i);
    if (klass.endDate && day > klass.endDate) break;
    if (!klass.daysOfWeek.includes(day.getUTCDay())) continue;

    const start = combineDateAndTime(day, klass.startTime);
    const end = combineDateAndTime(day, toHHMM(toMinutes(klass.startTime) + klass.durationMinutes));
    out.push({ start, end });
  }
  return out;
}

/**
 * Generates the occurrence rows a class implies, idempotently on
 * (classId, scheduledStart). Safe to call repeatedly — the nightly extend job
 * and the create path share it.
 */
export async function materialiseClass(classId: string, tx: Tx = prisma): Promise<number> {
  const klass = await tx.class.findUnique({ where: { id: classId } });
  if (!klass || klass.status === 'ARCHIVED') return 0;

  const slots = expandOccurrences(klass, new Date(), HORIZON_DAYS);
  if (slots.length === 0) return 0;

  const result = await tx.classOccurrence.createMany({
    data: slots.map((s) => ({
      classId,
      scheduledStart: s.start,
      scheduledEnd: s.end,
      teacherId: klass.teacherId,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Extends the horizon for every active class. Called on boot and nightly. */
export async function extendHorizon(): Promise<number> {
  const classes = await prisma.class.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  let total = 0;
  for (const c of classes) total += await materialiseClass(c.id);
  return total;
}

// ---------------------------------------------------------------------------
// Class creation & editing
// ---------------------------------------------------------------------------

export async function confirmSchedule(input: ConfirmScheduleInput, adminId: string) {
  // Re-validate rather than trusting the option the client sends back.
  const snapshot = await loadSnapshot(input.levelId, input.studentIds);
  const revalidated = findValidSlots(
    {
      studentIds: input.studentIds,
      subjectId: input.subjectId,
      levelId: input.levelId,
      teacherId: input.teacherId,
      timesPerWeek: input.daysOfWeek.length,
      durationMinutes: input.durationMinutes,
      timePreference: 'ANY',
      startDate: input.startDate,
      endDate: input.endDate,
    },
    snapshot,
  );

  const stillValid = revalidated.some(
    (o) =>
      o.startTime === input.startTime &&
      o.teacherId === input.teacherId &&
      o.daysOfWeek.length === input.daysOfWeek.length &&
      o.daysOfWeek.every((d) => input.daysOfWeek.includes(d)),
  );
  if (!stillValid) {
    throw badRequest('That slot is no longer valid. Please search for options again.');
  }

  const created = await prisma.$transaction(async (tx) => {
    const klass = await tx.class.create({
      data: {
        subjectId: input.subjectId,
        levelId: input.levelId,
        teacherId: input.teacherId,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
        createdBy: adminId,
        students: { create: input.studentIds.map((studentId) => ({ studentId })) },
      },
    });
    await materialiseClass(klass.id, tx);
    return klass;
  });

  await audit({ actorId: adminId, action: 'CLASS_CREATED', entity: 'Class', entityId: created.id, after: input });

  const teacher = await prisma.teacher.findUnique({ where: { id: input.teacherId }, select: { userId: true } });
  if (teacher) {
    await notify({
      recipientUserId: teacher.userId,
      type: 'SCHEDULE_CHANGED',
      title: 'New class scheduled',
      body: 'A new recurring class has been added to your timetable.',
      payload: { classId: created.id },
    });
  }

  return getClass(created.id);
}

export async function getClass(classId: string) {
  const klass = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      subject: true,
      level: true,
      teacher: { include: { user: { select: { fullName: true } } } },
      students: { include: { student: { select: { id: true, fullName: true } } } },
      _count: { select: { occurrences: true } },
    },
  });
  if (!klass) throw notFound('Class');

  return {
    id: klass.id,
    subjectId: klass.subjectId,
    subjectName: klass.subject.name,
    colorToken: klass.subject.colorToken,
    levelId: klass.levelId,
    levelName: klass.level.name,
    teacherId: klass.teacherId,
    teacherName: klass.teacher.user.fullName,
    daysOfWeek: klass.daysOfWeek,
    startTime: klass.startTime,
    durationMinutes: klass.durationMinutes,
    startDate: klass.startDate.toISOString().slice(0, 10),
    endDate: klass.endDate?.toISOString().slice(0, 10) ?? null,
    status: klass.status,
    students: klass.students.map((cs) => cs.student),
    occurrenceCount: klass._count.occurrences,
  };
}

/** Cancelling one occurrence never touches the rest of the recurrence. */
export async function cancelOccurrence(occurrenceId: string, reason: string | undefined, actorId: string) {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: { classRecord: { select: { id: true } } },
  });
  if (!occurrence) throw notFound('Class');
  if (occurrence.classRecord) {
    throw badRequest('This class already has a saved record and cannot be cancelled.');
  }

  const updated = await prisma.classOccurrence.update({
    where: { id: occurrenceId },
    data: { status: 'CANCELLED', cancelledReason: reason ?? null },
  });
  await audit({ actorId, action: 'OCCURRENCE_CANCELLED', entity: 'ClassOccurrence', entityId: occurrenceId });
  return updated;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const occurrenceInclude = {
  class: {
    include: {
      subject: true,
      level: true,
      students: { include: { student: { select: { id: true, fullName: true } } } },
    },
  },
  teacher: { include: { user: { select: { fullName: true } } } },
  classRecord: { select: { id: true, status: true } },
} satisfies Prisma.ClassOccurrenceInclude;

type OccurrenceRow = Prisma.ClassOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;

export function toOccurrenceDto(o: OccurrenceRow): OccurrenceDto {
  return {
    id: o.id,
    classId: o.classId,
    scheduledStart: o.scheduledStart.toISOString(),
    scheduledEnd: o.scheduledEnd.toISOString(),
    status: o.status,
    subjectName: o.class.subject.name,
    colorToken: o.class.subject.colorToken,
    levelName: o.class.level.name,
    teacherId: o.teacherId,
    teacherName: o.teacher.user.fullName,
    studentNames: o.class.students.map((cs) => cs.student.fullName),
    hasClassRecord: Boolean(o.classRecord && o.classRecord.status === 'SAVED'),
    classRecordStatus: o.classRecord?.status ?? null,
  };
}

export async function getSchedule(from: string, to: string, teacherId?: string): Promise<OccurrenceDto[]> {
  const occurrences = await prisma.classOccurrence.findMany({
    where: {
      scheduledStart: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
      status: { not: 'CANCELLED' },
      ...(teacherId ? { teacherId } : {}),
    },
    include: occurrenceInclude,
    orderBy: { scheduledStart: 'asc' },
  });
  return occurrences.map(toOccurrenceDto);
}

export async function getOccurrence(occurrenceId: string): Promise<OccurrenceDto> {
  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    include: occurrenceInclude,
  });
  if (!occurrence) throw notFound('Class');
  return toOccurrenceDto(occurrence);
}

// ---------------------------------------------------------------------------
// Rescheduling (M11)
// ---------------------------------------------------------------------------

export interface ProposedMove {
  occurrenceId: string;
  label: string;
  currentStart: string;
  proposedStart: string | null;
  reason: string | null;
}

/**
 * For each affected occurrence, finds the earliest still-valid alternative.
 *
 * The engine validates every proposal; nothing is applied until the admin
 * confirms the whole set (BR-03 in spirit — no silent mutation).
 *
 * TODO(AI-PHASE-2): Phase 2 adds a "Describe the change" entry point that picks
 * the occurrence set from a sentence. The proposal and apply steps are unchanged.
 * See docs/DEFERRED-AI.md §1 AI-9.
 */
export async function proposeMoves(occurrenceIds: string[]): Promise<ProposedMove[]> {
  const occurrences = await prisma.classOccurrence.findMany({
    where: { id: { in: occurrenceIds } },
    include: occurrenceInclude,
  });

  const proposals: ProposedMove[] = [];

  for (const o of occurrences) {
    const studentIds = o.class.students.map((cs) => cs.studentId);
    const snapshot = await loadSnapshot(o.class.levelId, studentIds);
    const durationMinutes = o.class.durationMinutes;
    const day = new Date(o.scheduledStart);
    day.setUTCHours(0, 0, 0, 0);

    let proposedStart: Date | null = null;
    let reason: string | null = 'No valid alternative was found this week.';

    // Probe later the same day first, then the following six days — the
    // smallest disruption that still satisfies every constraint.
    outer: for (let dayOffset = 0; dayOffset <= 6; dayOffset += 1) {
      const candidateDay = new Date(day);
      candidateDay.setUTCDate(candidateDay.getUTCDate() + dayOffset);

      for (let minutes = 7 * 60; minutes <= 19 * 60 - durationMinutes; minutes += 30) {
        const candidate = combineDateAndTime(candidateDay, toHHMM(minutes));
        if (candidate <= o.scheduledStart && dayOffset === 0) continue;

        const check = validateMove(
          { teacherId: o.teacherId, studentIds, start: candidate, durationMinutes },
          snapshot,
          { start: o.scheduledStart, end: o.scheduledEnd },
        );
        if (check.valid) {
          proposedStart = candidate;
          reason = null;
          break outer;
        }
      }
    }

    proposals.push({
      occurrenceId: o.id,
      label: `${o.class.subject.name} · ${o.class.students.map((cs) => cs.student.fullName).join(', ')}`,
      currentStart: o.scheduledStart.toISOString(),
      proposedStart: proposedStart?.toISOString() ?? null,
      reason,
    });
  }

  return proposals;
}

/** Applies confirmed moves. Every move is revalidated one final time. */
export async function applyMoves(
  moves: Array<{ occurrenceId: string; newStart: string }>,
  actorId: string,
) {
  const applied: string[] = [];

  for (const move of moves) {
    const occurrence = await prisma.classOccurrence.findUnique({
      where: { id: move.occurrenceId },
      include: occurrenceInclude,
    });
    if (!occurrence) continue;

    const studentIds = occurrence.class.students.map((cs) => cs.studentId);
    const snapshot = await loadSnapshot(occurrence.class.levelId, studentIds);
    const start = new Date(move.newStart);
    const check = validateMove(
      {
        teacherId: occurrence.teacherId,
        studentIds,
        start,
        durationMinutes: occurrence.class.durationMinutes,
      },
      snapshot,
      { start: occurrence.scheduledStart, end: occurrence.scheduledEnd },
    );
    if (!check.valid) continue;

    const end = new Date(start.getTime() + occurrence.class.durationMinutes * 60_000);
    await prisma.classOccurrence.update({
      where: { id: move.occurrenceId },
      data: { scheduledStart: start, scheduledEnd: end },
    });
    applied.push(move.occurrenceId);

    await notify({
      recipientUserId: (await prisma.teacher.findUniqueOrThrow({
        where: { id: occurrence.teacherId },
        select: { userId: true },
      })).userId,
      type: 'SCHEDULE_CHANGED',
      title: 'Class rescheduled',
      body: `${occurrence.class.subject.name} has been moved.`,
      payload: { occurrenceId: move.occurrenceId },
    });
  }

  await audit({ actorId, action: 'SCHEDULE_MOVES_APPLIED', entity: 'ClassOccurrence', after: { applied } });
  return { applied: applied.length, occurrenceIds: applied };
}

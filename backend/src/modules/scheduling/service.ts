import type { Prisma } from '@prisma/client';
import type {
  ConfirmScheduleInput,
  OccurrenceDto,
  ScheduleOptionsInput,
  SlotOptionDto,
  StudentTeachingDto,
} from '@vig/shared';
import { toHHMM, toMinutes } from '@vig/shared';
import { prisma } from '../../prisma.js';
import type { Tx } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { notify } from '../notifications/service.js';
import {
  combineDateAndTime,
  CONFLICT_HORIZON_WEEKS,
  diagnoseNoOptions,
  findValidSlots,
  validateMove,
  type RankedSlot,
  type SchedulingSnapshot,
} from './engine.js';
import { checkJoin } from './enrolment.js';
import { recordState, recordWindow } from '../classrecord/window.js';

/** How far ahead occurrences are materialised (AD-05). */
const HORIZON_DAYS = 120;

// ---------------------------------------------------------------------------
// Snapshot loading — the only place the engine touches the database
// ---------------------------------------------------------------------------

/** The span of dates a snapshot needs to answer for. */
interface SnapshotWindow {
  from: Date;
  to: Date;
}

/** `from` through `from` + `days`, as a snapshot window. */
function windowFrom(from: Date, days: number): SnapshotWindow {
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + days);
  return { from, to };
}

/**
 * The dates a new-class search can collide with: from the requested start date
 * over the engine's conflict horizon. Anchored at today when the start date is in
 * the past, so a stale form does not widen the query to the whole timetable.
 */
function searchWindow(startDate: string): SnapshotWindow {
  const requested = new Date(`${startDate}T00:00:00.000Z`);
  const now = new Date();
  const from = requested > now ? requested : now;
  return windowFrom(from, CONFLICT_HORIZON_WEEKS * 7);
}

/**
 * Loads the snapshot the engine reasons over.
 *
 * The window matters: the engine only ever checks conflicts inside a bounded
 * span (CONFLICT_HORIZON_WEEKS for a new class, a week for a proposed move), but
 * occurrences are materialised 120 days out. Fetching all of them — with the
 * class and its roster joined — pulled the school's entire future schedule into
 * memory on every "Find options" click, and once per occurrence inside
 * proposeMoves. Asking only for the dates that can affect the answer keeps this
 * flat as the timetable grows.
 */
async function loadSnapshot(
  levelId: string,
  studentIds: string[],
  window: SnapshotWindow,
): Promise<SchedulingSnapshot> {
  const level = await prisma.level.findUnique({ where: { id: levelId }, select: { displayOrder: true } });
  if (!level) throw notFound('Level');

  const [teachers, students, booked] = await Promise.all([
    prisma.teacher.findMany({
      where: { user: { status: 'ACTIVE' } },
      include: { user: { select: { fullName: true } }, capabilities: true, availability: true, exceptions: true },
    }),
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, fullName: true },
    }),
    prisma.classOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStart: { gte: window.from, lte: window.to },
      },
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
    students: students.map((s) => ({ studentId: s.id, fullName: s.fullName })),
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
): Promise<{
  options: Array<SlotOptionDto & { teacherId: string; teacherName: string }>;
  requestId: string;
  /** Why the search was empty. Populated only when there are no options. */
  reasons: string[];
}> {
  const snapshot = await loadSnapshot(input.levelId, input.studentIds, searchWindow(input.startDate));
  const options = findValidSlots(input, snapshot);

  // An empty result is not self-explanatory — the admin needs to know which
  // constraint ruled everything out to know what to change.
  let reasons: string[] = [];
  if (options.length === 0) {
    const level = await prisma.level.findUnique({
      where: { id: input.levelId },
      select: { name: true, subject: { select: { name: true } } },
    });
    reasons = diagnoseNoOptions(input, snapshot, {
      subjectName: level?.subject.name ?? 'this subject',
      levelName: level?.name ?? 'this level',
    });
  }

  const request = await prisma.schedulingRequest.create({
    data: {
      adminId,
      // Week 1 stores the structured form payload; Phase 2 stores the sentence.
      rawText: JSON.stringify(input),
      interpreted: input,
      status: options.length ? 'OPTIONS_FOUND' : 'NO_OPTIONS',
    },
  });

  return { options, requestId: request.id, reasons };
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
  const snapshot = await loadSnapshot(input.levelId, input.studentIds, searchWindow(input.startDate));
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

/**
 * Everything a student would inherit by joining a class, and everything they are
 * already booked into — the two sides of the enrolment check.
 */
async function joinContext(classId: string, studentIds: string[]) {
  const now = new Date();

  const [klass, students, booked] = await Promise.all([
    prisma.class.findUnique({
      where: { id: classId },
      include: { subject: true, level: true, students: { select: { studentId: true } } },
    }),
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        subjectLevels: { where: { isCurrent: true }, include: { level: true } },
      },
    }),
    prisma.classOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStart: { gte: now },
        class: { students: { some: { studentId: { in: studentIds } } } },
      },
      select: {
        scheduledStart: true,
        scheduledEnd: true,
        classId: true,
        class: { select: { students: { select: { studentId: true } } } },
      },
    }),
  ]);
  if (!klass) throw notFound('Class');

  const occurrences = await prisma.classOccurrence.findMany({
    where: { classId, status: 'SCHEDULED', scheduledStart: { gte: now } },
    select: { scheduledStart: true, scheduledEnd: true },
    orderBy: { scheduledStart: 'asc' },
  });

  return { klass, students, booked, occurrences };
}

/** Runs the enrolment rules for one student against one class. */
function evaluateJoin(
  klass: { subject: { name: string }; levelId: string; level: { name: string } },
  student: {
    fullName: string;
    subjectLevels: Array<{ subjectId: string; levelId: string; level: { name: string } }>;
  },
  subjectId: string,
  occurrences: Array<{ scheduledStart: Date; scheduledEnd: Date }>,
  booked: Array<{ scheduledStart: Date; scheduledEnd: Date }>,
) {
  const current = student.subjectLevels.find((sl) => sl.subjectId === subjectId);

  return checkJoin({
    studentName: student.fullName,
    klass: { subjectName: klass.subject.name, levelId: klass.levelId, levelName: klass.level.name },
    current: current ? { levelId: current.levelId, levelName: current.level.name } : null,
    occurrences: occurrences.map((o) => ({ start: o.scheduledStart, end: o.scheduledEnd })),
    booked: booked.map((b) => ({ start: b.scheduledStart, end: b.scheduledEnd })),
  });
}

/**
 * Adds students to a class that already runs.
 *
 * They pick up the whole recurrence from here on, including attendance and the
 * class record — which is the point: this is how a child ends up in front of a
 * teacher without a second class being created for the same group.
 */
export async function addClassStudents(
  classId: string,
  input: { studentIds: string[]; acceptWarnings: boolean },
  actorId: string,
) {
  const { klass, students, booked, occurrences } = await joinContext(classId, input.studentIds);

  if (klass.status === 'ARCHIVED') throw badRequest('That class is no longer running.');

  const missing = input.studentIds.filter((id) => !students.some((s) => s.id === id));
  if (missing.length) throw notFound('Student');

  const alreadyIn = new Set(klass.students.map((cs) => cs.studentId));
  const joining = students.filter((s) => !alreadyIn.has(s.id));
  if (joining.length === 0) return { klass: await getClass(classId), warnings: [] };

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const student of joining) {
    const check = evaluateJoin(
      klass,
      student,
      klass.subjectId,
      occurrences,
      // Their own bookings only, and never this class's own occurrences.
      booked.filter(
        (b) => b.classId !== classId && b.class.students.some((cs) => cs.studentId === student.id),
      ),
    );
    blockers.push(...check.blockers);
    warnings.push(...check.warnings);
  }

  if (blockers.length) throw badRequest(blockers.join(' '));
  if (warnings.length && !input.acceptWarnings) {
    throw badRequest(`${warnings.join(' ')} Confirm to add them anyway.`);
  }

  await prisma.classStudent.createMany({
    data: joining.map((s) => ({ classId, studentId: s.id })),
    skipDuplicates: true,
  });

  await audit({
    actorId,
    action: 'CLASS_STUDENTS_ADDED',
    entity: 'Class',
    entityId: classId,
    after: { studentIds: joining.map((s) => s.id) },
  });

  const teacher = await prisma.teacher.findUnique({
    where: { id: klass.teacherId },
    select: { userId: true },
  });
  if (teacher) {
    await notify({
      recipientUserId: teacher.userId,
      type: 'SCHEDULE_CHANGED',
      title: joining.length === 1 ? 'A student joined your class' : 'Students joined your class',
      body: `${joining.map((s) => s.fullName).join(', ')} — ${klass.subject.name}, ${klass.level.name}.`,
      payload: { classId },
    });
  }

  return { klass: await getClass(classId), warnings };
}

/**
 * Removes a student from a class going forward.
 *
 * Attendance and class records already written name the student directly, so
 * their history of the classes they did attend is untouched (BR-09).
 */
export async function removeClassStudent(classId: string, studentId: string, actorId: string) {
  const link = await prisma.classStudent.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!link) throw notFound('Student in this class');

  const remaining = await prisma.classStudent.count({ where: { classId } });
  if (remaining <= 1) {
    throw badRequest(
      'This is the only student in the class. Cancel the class from the schedule instead of emptying it.',
    );
  }

  await prisma.classStudent.delete({ where: { classId_studentId: { classId, studentId } } });
  await audit({
    actorId,
    action: 'CLASS_STUDENT_REMOVED',
    entity: 'Class',
    entityId: classId,
    before: { studentId },
  });

  return getClass(classId);
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

/**
 * Who teaches this child, subject by subject — and where nobody does yet.
 *
 * Assigning a subject and scheduling a class are two different acts, and the gap
 * between them is invisible everywhere else: the child simply never appears on a
 * teacher's list. This read names the gap and offers the classes that already run
 * for that subject and level, so filling it is one click rather than a new class.
 */
export async function getStudentTeaching(studentId: string): Promise<StudentTeachingDto> {
  const now = new Date();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      subjectLevels: {
        where: { isCurrent: true },
        include: { subject: true, level: true },
        orderBy: { subject: { displayOrder: 'asc' } },
      },
    },
  });
  if (!student) throw notFound('Student');

  const classInclude = {
    subject: true,
    level: true,
    teacher: { include: { user: { select: { fullName: true } } } },
    _count: { select: { students: true } },
    occurrences: {
      where: { status: 'SCHEDULED' as const, scheduledStart: { gte: now } },
      orderBy: { scheduledStart: 'asc' as const },
      take: 1,
      select: { scheduledStart: true },
    },
  };

  const enrolled = await prisma.class.findMany({
    where: { status: { not: 'ARCHIVED' }, students: { some: { studentId } } },
    include: classInclude,
    orderBy: { subject: { displayOrder: 'asc' } },
  });

  const covered = new Set(enrolled.map((c) => c.subjectId));
  const gaps = student.subjectLevels.filter((sl) => !covered.has(sl.subjectId));

  // Candidates are classes for exactly the subject and level the child is on —
  // any other level would record coverage against a level they are not studying.
  const candidates = gaps.length
    ? await prisma.class.findMany({
        where: {
          status: 'ACTIVE',
          OR: gaps.map((g) => ({ subjectId: g.subjectId, levelId: g.levelId })),
        },
        include: {
          ...classInclude,
          occurrences: {
            where: { status: 'SCHEDULED' as const, scheduledStart: { gte: now } },
            orderBy: { scheduledStart: 'asc' as const },
            select: { scheduledStart: true, scheduledEnd: true },
          },
        },
      })
    : [];

  const booked = await prisma.classOccurrence.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledStart: { gte: now },
      class: { students: { some: { studentId } } },
    },
    select: { scheduledStart: true, scheduledEnd: true },
  });

  return {
    classes: enrolled.map((c) => ({
      classId: c.id,
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      colorToken: c.subject.colorToken,
      levelId: c.levelId,
      levelName: c.level.name,
      teacherId: c.teacherId,
      teacherName: c.teacher.user.fullName,
      daysOfWeek: c.daysOfWeek,
      startTime: c.startTime,
      durationMinutes: c.durationMinutes,
      nextOccurrence: c.occurrences[0]?.scheduledStart.toISOString() ?? null,
      studentCount: c._count.students,
    })),
    unassigned: gaps.map((gap) => ({
      subjectId: gap.subjectId,
      subjectName: gap.subject.name,
      colorToken: gap.subject.colorToken,
      levelId: gap.levelId,
      levelName: gap.level.name,
      joinable: candidates
        .filter((c) => c.subjectId === gap.subjectId && c.levelId === gap.levelId)
        .map((c) => {
          const check = evaluateJoin(c, student, gap.subjectId, c.occurrences, booked);
          return {
            classId: c.id,
            teacherId: c.teacherId,
            teacherName: c.teacher.user.fullName,
            daysOfWeek: c.daysOfWeek,
            startTime: c.startTime,
            durationMinutes: c.durationMinutes,
            studentCount: c._count.students,
            blockers: check.blockers,
            warnings: check.warnings,
          };
        }),
    })),
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

export function toOccurrenceDto(o: OccurrenceRow, now = new Date()): OccurrenceDto {
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
    // Derived in one place so every timetable — admin, teacher, day view — agrees
    // on whether a class is still recordable.
    recordState: recordState(o.scheduledStart, o.classRecord?.status, now),
    recordClosesAt: recordWindow(o.scheduledStart).closesAt.toISOString(),
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
  return occurrences.map((o) => toOccurrenceDto(o));
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
    const durationMinutes = o.class.durationMinutes;
    const day = new Date(o.scheduledStart);
    day.setUTCHours(0, 0, 0, 0);

    // Alternatives are probed over this day and the following six, so that is
    // the only span a conflict can come from.
    const snapshot = await loadSnapshot(o.class.levelId, studentIds, windowFrom(day, 7));

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
    const start = new Date(move.newStart);

    // A move is validated against its own day only; a day either side covers
    // anything straddling midnight in the school's timezone.
    const day = new Date(start);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 1);
    const snapshot = await loadSnapshot(occurrence.class.levelId, studentIds, windowFrom(day, 3));
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

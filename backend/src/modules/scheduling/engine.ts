import type { SlotOptionDto } from '@vig/shared';
import { intersectRanges, toHHMM, toMinutes, type TimeRange } from '@vig/shared';
import {
  isAvailableFor,
  resolveAvailability,
  type DatedException,
  type RecurringSlot,
} from './availability.js';

/**
 * The scheduling constraint engine.
 *
 * Pure and I/O-free by design (AD-07): it takes an in-memory snapshot and returns
 * ranked options. That makes it unit-testable, deterministic, and reusable for
 * both "find me options" and "is this proposed move still valid?".
 *
 * Schedule validity = teacher capability ∧ teacher availability ∧ student
 * availability ∧ no conflict, with dated exceptions overriding recurring
 * availability on their date (BR-06).
 *
 * Note: the AI that Phase 2 adds only ever *parsed the sentence*. Everything
 * below is the actual intelligence in scheduling and ships now.
 */

export interface TeacherSnapshot {
  teacherId: string;
  fullName: string;
  capabilities: Array<{ subjectId: string; minLevelOrder: number; maxLevelOrder: number; isPrimary: boolean }>;
  availability: RecurringSlot[];
  exceptions: DatedException[];
}

export interface StudentSnapshot {
  studentId: string;
  fullName: string;
  availability: RecurringSlot[];
}

export interface BookedOccurrence {
  teacherId: string;
  studentIds: string[];
  start: Date;
  end: Date;
}

export interface SchedulingSnapshot {
  teachers: TeacherSnapshot[];
  students: StudentSnapshot[];
  booked: BookedOccurrence[];
  /** Display order of the requested level, compared against capability ranges. */
  levelOrder: number;
}

export interface SlotRequest {
  studentIds: string[];
  subjectId: string;
  levelId: string;
  teacherId?: string;
  timesPerWeek: number;
  durationMinutes: number;
  timePreference: 'MORNING' | 'AFTERNOON' | 'ANY';
  startDate: string;
  endDate?: string;
}

export interface RankedSlot extends SlotOptionDto {
  teacherId: string;
  teacherName: string;
}

/** Candidate start times are probed on the half hour. */
const STEP_MINUTES = 30;
/**
 * How many weeks of the future to check for conflicts before offering a pattern.
 * Exported so the snapshot loader fetches exactly this span rather than every
 * materialised occurrence — the two must not drift apart.
 */
export const CONFLICT_HORIZON_WEEKS = 4;
const MAX_OPTIONS = 5;

// --- Small helpers ----------------------------------------------------------

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0 || k > items.length) return [];
  if (k === items.length) return [items];
  if (k === 1) return items.map((i) => [i]);

  const [head, ...rest] = items;
  const withHead = combinations(rest, k - 1).map((c) => [head!, ...c]);
  const withoutHead = combinations(rest, k);
  return [...withHead, ...withoutHead];
}

/** Smallest circular gap between chosen weekdays. Higher means better spread. */
function weekdaySpread(days: number[]): number {
  if (days.length < 2) return 7;
  const sorted = [...days].sort((a, b) => a - b);
  let min = 7;
  for (let i = 0; i < sorted.length; i += 1) {
    const next = sorted[(i + 1) % sorted.length]!;
    const gap = i + 1 === sorted.length ? next + 7 - sorted[i]! : next - sorted[i]!;
    min = Math.min(min, gap);
  }
  return min;
}

function matchesPreference(startTime: string, preference: SlotRequest['timePreference']): boolean {
  if (preference === 'ANY') return true;
  const minutes = toMinutes(startTime);
  return preference === 'MORNING' ? minutes < 12 * 60 : minutes >= 12 * 60;
}

/** The dates a weekly pattern lands on, over the conflict horizon. */
function occurrenceDates(startDate: Date, daysOfWeek: number[], weeks: number, endDate?: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let day = 0; day < weeks * 7; day += 1) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() + day);
    if (endDate && d > endDate) break;
    if (daysOfWeek.includes(d.getUTCDay())) dates.push(d);
  }
  return dates;
}

/** Combines a UTC date with a school-local wall clock into an absolute instant. */
export function combineDateAndTime(date: Date, hhmm: string): Date {
  const out = new Date(date);
  const [h, m] = hhmm.split(':').map(Number);
  out.setUTCHours(h!, m ?? 0, 0, 0);
  return out;
}

// --- Shared stages ----------------------------------------------------------

/** Whether a teacher is assigned this subject at this level (F5, BR-05). */
function canTeach(teacher: TeacherSnapshot, subjectId: string, levelOrder: number): boolean {
  return teacher.capabilities.some(
    (c) => c.subjectId === subjectId && levelOrder >= c.minLevelOrder && levelOrder <= c.maxLevelOrder,
  );
}

/**
 * Start times that fit the whole class, per weekday, once the teacher's and
 * every student's weekly availability are intersected.
 *
 * Shared by the search and its diagnosis so the two cannot disagree about what
 * "they are both free" means.
 */
function sharedStartTimes(
  teacher: TeacherSnapshot,
  students: StudentSnapshot[],
  durationMinutes: number,
): Map<number, Set<string>> {
  const startTimesByWeekday = new Map<number, Set<string>>();

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const teacherWindows: TimeRange[] = teacher.availability
      .filter((a) => a.weekday === weekday)
      .map((a) => ({ startTime: a.startTime, endTime: a.endTime }));
    if (teacherWindows.length === 0) continue;

    let shared = teacherWindows;
    for (const student of students) {
      const studentWindows: TimeRange[] = student.availability
        .filter((a) => a.weekday === weekday)
        .map((a) => ({ startTime: a.startTime, endTime: a.endTime }));
      if (studentWindows.length === 0) {
        shared = [];
        break;
      }
      shared = intersectRanges(shared, studentWindows);
    }
    if (shared.length === 0) continue;

    // Slide the class duration through each shared window.
    const starts = new Set<string>();
    for (const window of shared) {
      const first = toMinutes(window.startTime);
      const last = toMinutes(window.endTime) - durationMinutes;
      const aligned = Math.ceil(first / STEP_MINUTES) * STEP_MINUTES;
      for (let t = aligned; t <= last; t += STEP_MINUTES) starts.add(toHHMM(t));
    }
    if (starts.size) startTimesByWeekday.set(weekday, starts);
  }

  return startTimesByWeekday;
}

/** A recurring pattern needs the same start time on every chosen day. */
function daysByStartTime(startTimesByWeekday: Map<number, Set<string>>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [weekday, starts] of startTimesByWeekday) {
    for (const start of starts) {
      if (!out.has(start)) out.set(start, []);
      out.get(start)!.push(weekday);
    }
  }
  return out;
}

// --- The engine -------------------------------------------------------------

export function findValidSlots(request: SlotRequest, snapshot: SchedulingSnapshot): RankedSlot[] {
  const startDate = new Date(`${request.startDate}T00:00:00.000Z`);
  const endDate = request.endDate ? new Date(`${request.endDate}T00:00:00.000Z`) : undefined;

  // 1 — Capability filter. A free teacher who cannot teach the subject or level
  //     is not a candidate, however convenient the slot (F5).
  const candidates = snapshot.teachers.filter((t) => {
    if (request.teacherId && t.teacherId !== request.teacherId) return false;
    return canTeach(t, request.subjectId, snapshot.levelOrder);
  });

  const students = snapshot.students.filter((s) => request.studentIds.includes(s.studentId));
  if (candidates.length === 0 || students.length !== request.studentIds.length) return [];

  const results: RankedSlot[] = [];

  for (const teacher of candidates) {
    // 2/3 — Availability intersection, then the duration slid through it.
    const startTimesByWeekday = sharedStartTimes(teacher, students, request.durationMinutes);

    // 4 — Group the weekdays that share a start time ("Mon & Wed · 8:00 – 9:00").
    for (const [startTime, days] of daysByStartTime(startTimesByWeekday)) {
      if (days.length < request.timesPerWeek) continue;
      const endTime = toHHMM(toMinutes(startTime) + request.durationMinutes);

      for (const combo of combinations([...days].sort((a, b) => a - b), request.timesPerWeek)) {
        // 5 — Validate the concrete dates: dated exceptions override the
        //     recurring pattern, and nothing may collide with an existing booking.
        const dates = occurrenceDates(startDate, combo, CONFLICT_HORIZON_WEEKS, endDate);
        if (dates.length === 0) continue;

        const window: TimeRange = { startTime, endTime };
        const exceptionOk = dates.every((d) =>
          isAvailableFor(teacher.availability, teacher.exceptions, d, window),
        );
        if (!exceptionOk) continue;

        const conflictFree = dates.every((d) => {
          const slotStart = combineDateAndTime(d, startTime);
          const slotEnd = combineDateAndTime(d, endTime);
          return !snapshot.booked.some((b) => {
            const overlaps = b.start < slotEnd && slotStart < b.end;
            if (!overlaps) return false;
            const sharesTeacher = b.teacherId === teacher.teacherId;
            const sharesStudent = b.studentIds.some((id) => request.studentIds.includes(id));
            return sharesTeacher || sharesStudent;
          });
        });
        if (!conflictFree) continue;

        // 6 — Rank. Preference match dominates, then spread, then earlier in the day.
        const isPrimary = teacher.capabilities.some(
          (c) => c.subjectId === request.subjectId && c.isPrimary,
        );
        const score =
          (matchesPreference(startTime, request.timePreference) ? 1000 : 0) +
          weekdaySpread(combo) * 50 +
          (isPrimary ? 25 : 0) +
          Math.max(0, 720 - toMinutes(startTime)) / 60;

        results.push({
          teacherId: teacher.teacherId,
          teacherName: teacher.fullName,
          daysOfWeek: combo,
          startTime,
          endTime,
          durationMinutes: request.durationMinutes,
          isBestMatch: false,
          score: Math.round(score),
          checks: [
            { label: 'Teacher can teach this subject and level', passed: true },
            { label: 'Teacher available', passed: true },
            { label: 'Student available', passed: true },
            { label: 'No conflicts', passed: true },
          ],
        });
      }
    }
  }

  // Distinct patterns only — the same days/time from one teacher is one option.
  const seen = new Set<string>();
  const deduped = results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      const key = `${r.teacherId}|${r.daysOfWeek.join(',')}|${r.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPTIONS);

  if (deduped[0]) deduped[0].isBestMatch = true;
  return deduped;
}

/**
 * Why the search came back empty.
 *
 * "No valid times found" is a true statement and a useless one: the admin cannot
 * tell whether the teacher lacks the subject, nobody has set availability, or
 * everything is simply booked — and those need completely different fixes. This
 * walks the same stages in the same order and reports the first one that ruled
 * everything out, in the school's own vocabulary.
 *
 * Only called when findValidSlots returns nothing, so it is free to be thorough.
 */
export function diagnoseNoOptions(
  request: SlotRequest,
  snapshot: SchedulingSnapshot,
  labels: { subjectName: string; levelName: string },
): string[] {
  const students = snapshot.students.filter((s) => request.studentIds.includes(s.studentId));
  if (students.length !== request.studentIds.length) {
    return ['One of the selected students could not be loaded. Reload and try again.'];
  }

  const list = (names: string[]) =>
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

  // 1 — Capability. The stage that stops a search before availability matters.
  const capable = snapshot.teachers.filter((t) => canTeach(t, request.subjectId, snapshot.levelOrder));
  const requested = request.teacherId
    ? snapshot.teachers.find((t) => t.teacherId === request.teacherId)
    : null;

  if (request.teacherId && !requested) {
    return ['That teacher is no longer active. Choose another, or leave the teacher blank.'];
  }

  if (requested && !capable.some((t) => t.teacherId === requested.teacherId)) {
    const reasons = [
      `${requested.fullName} is not assigned to teach ${labels.subjectName} at ${labels.levelName}. ` +
        `Add it under Teachers → ${requested.fullName} → Teaching.`,
    ];
    reasons.push(
      capable.length > 0
        ? `${list(capable.map((t) => t.fullName))} can teach it — or leave the teacher blank to search everyone.`
        : `No teacher is assigned to ${labels.subjectName} at ${labels.levelName} yet.`,
    );
    return reasons;
  }

  if (capable.length === 0) {
    return [
      `No teacher is assigned to teach ${labels.subjectName} at ${labels.levelName}. ` +
        'Add the subject and level range to a teacher under Teachers → Teaching.',
    ];
  }

  const candidates = requested ? [requested] : capable;

  // 2 — Availability, named per person so the admin knows whose to set.
  const reasons: string[] = [];
  const studentsUnset = students.filter((s) => s.availability.length === 0);
  if (studentsUnset.length) {
    reasons.push(
      `${list(studentsUnset.map((s) => s.fullName))} ${
        studentsUnset.length === 1 ? 'has' : 'have'
      } no weekly availability set.`,
    );
  }
  const teachersUnset = candidates.filter((t) => t.availability.length === 0);
  if (teachersUnset.length === candidates.length) {
    reasons.push(`${list(candidates.map((t) => t.fullName))} has no weekly availability set.`);
  }
  if (reasons.length) return reasons;

  // 3 — Overlap, and whether it covers enough days for the requested frequency.
  let mostDaysAtOneTime = 0;
  for (const teacher of candidates) {
    for (const [, days] of daysByStartTime(sharedStartTimes(teacher, students, request.durationMinutes))) {
      mostDaysAtOneTime = Math.max(mostDaysAtOneTime, days.length);
    }
  }

  if (mostDaysAtOneTime === 0) {
    return [
      `There is no ${request.durationMinutes}-minute window when ${list(
        candidates.map((t) => t.fullName),
      )} and ${list(students.map((s) => s.fullName))} are both free on the same day.`,
    ];
  }

  if (mostDaysAtOneTime < request.timesPerWeek) {
    return [
      `They are free at the same time on only ${mostDaysAtOneTime} ${
        mostDaysAtOneTime === 1 ? 'day' : 'days'
      } a week, but you asked for ${request.timesPerWeek} times per week. ` +
        `Try ${mostDaysAtOneTime} times per week, or widen availability.`,
    ];
  }

  // 4 — Dates. An end date before the pattern's first occurrence produces none.
  const startDate = new Date(`${request.startDate}T00:00:00.000Z`);
  const endDate = request.endDate ? new Date(`${request.endDate}T00:00:00.000Z`) : undefined;
  if (endDate && endDate < startDate) {
    return ['The end date is before the start date.'];
  }

  // 5 — Everything else was ruled out on the concrete dates.
  return [
    'Every time that would otherwise work is taken by a class already on the schedule, or falls on a date ' +
      'marked unavailable. Try a later start date, a different frequency, or cancel the clashing class.',
  ];
}

/**
 * Revalidates one proposed move. Used by the reschedule flow so a suggested new
 * time is checked against exactly the same rules that produced it in the first
 * place — no second, looser code path.
 */
export function validateMove(
  move: { teacherId: string; studentIds: string[]; start: Date; durationMinutes: number },
  snapshot: SchedulingSnapshot,
  ignoreOccurrence?: { start: Date; end: Date },
): { valid: boolean; reason?: string } {
  const teacher = snapshot.teachers.find((t) => t.teacherId === move.teacherId);
  if (!teacher) return { valid: false, reason: 'Teacher not found.' };

  const startTime = toHHMM(move.start.getUTCHours() * 60 + move.start.getUTCMinutes());
  const endTime = toHHMM(toMinutes(startTime) + move.durationMinutes);
  const window: TimeRange = { startTime, endTime };
  const date = new Date(move.start);
  date.setUTCHours(0, 0, 0, 0);

  if (!isAvailableFor(teacher.availability, teacher.exceptions, date, window)) {
    return { valid: false, reason: 'The teacher is not available then.' };
  }

  for (const studentId of move.studentIds) {
    const student = snapshot.students.find((s) => s.studentId === studentId);
    if (!student) return { valid: false, reason: 'Student not found.' };
    const windows = resolveAvailability(student.availability, [], date);
    const fits = windows.some(
      (w) => toMinutes(w.startTime) <= toMinutes(startTime) && toMinutes(w.endTime) >= toMinutes(endTime),
    );
    if (!fits) return { valid: false, reason: `${student.fullName} is not available then.` };
  }

  const slotEnd = combineDateAndTime(date, endTime);
  const clash = snapshot.booked.some((b) => {
    if (ignoreOccurrence && +b.start === +ignoreOccurrence.start && +b.end === +ignoreOccurrence.end) {
      return false;
    }
    const overlaps = b.start < slotEnd && move.start < b.end;
    if (!overlaps) return false;
    return b.teacherId === move.teacherId || b.studentIds.some((id) => move.studentIds.includes(id));
  });
  if (clash) return { valid: false, reason: 'That time clashes with another class.' };

  return { valid: true };
}

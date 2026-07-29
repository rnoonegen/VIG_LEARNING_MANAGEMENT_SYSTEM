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
/** How many weeks of the future to check for conflicts before offering a pattern. */
const CONFLICT_HORIZON_WEEKS = 4;
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

// --- The engine -------------------------------------------------------------

export function findValidSlots(request: SlotRequest, snapshot: SchedulingSnapshot): RankedSlot[] {
  const startDate = new Date(`${request.startDate}T00:00:00.000Z`);
  const endDate = request.endDate ? new Date(`${request.endDate}T00:00:00.000Z`) : undefined;

  // 1 — Capability filter. A free teacher who cannot teach the subject or level
  //     is not a candidate, however convenient the slot (F5).
  const candidates = snapshot.teachers.filter((t) => {
    if (request.teacherId && t.teacherId !== request.teacherId) return false;
    return t.capabilities.some(
      (c) =>
        c.subjectId === request.subjectId &&
        snapshot.levelOrder >= c.minLevelOrder &&
        snapshot.levelOrder <= c.maxLevelOrder,
    );
  });

  const students = snapshot.students.filter((s) => request.studentIds.includes(s.studentId));
  if (candidates.length === 0 || students.length !== request.studentIds.length) return [];

  const results: RankedSlot[] = [];

  for (const teacher of candidates) {
    // 2 — Availability intersection, per weekday, across the teacher and every
    //     student in the class.
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

      // 3 — Slide the class duration through each shared window.
      const starts = new Set<string>();
      for (const window of shared) {
        const first = toMinutes(window.startTime);
        const last = toMinutes(window.endTime) - request.durationMinutes;
        const aligned = Math.ceil(first / STEP_MINUTES) * STEP_MINUTES;
        for (let t = aligned; t <= last; t += STEP_MINUTES) starts.add(toHHMM(t));
      }
      if (starts.size) startTimesByWeekday.set(weekday, starts);
    }

    // 4 — A recurring pattern needs the same start time on every chosen day,
    //     which is what the boards show ("Mon & Wed · 8:00 – 9:00").
    const daysByStartTime = new Map<string, number[]>();
    for (const [weekday, starts] of startTimesByWeekday) {
      for (const start of starts) {
        if (!daysByStartTime.has(start)) daysByStartTime.set(start, []);
        daysByStartTime.get(start)!.push(weekday);
      }
    }

    for (const [startTime, days] of daysByStartTime) {
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

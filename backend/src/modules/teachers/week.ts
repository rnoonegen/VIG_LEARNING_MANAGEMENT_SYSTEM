import type { TeacherWeekDayDto, TeacherWeekDto } from '@vig/shared';
import { WEEKDAY_SHORT, addDays, fromDateKey, startOfWeek, toDateKey, toMinutes } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { resolveAvailability } from '../scheduling/availability.js';

/**
 * The running week, with dates on it (F5).
 *
 * The weekly pattern a teacher states is a repeating shape — "Tuesdays, 9 to 12"
 * — with no dates attached. That is the right way to state availability and the
 * wrong way to read it: neither the teacher deciding whether to ask for leave nor
 * the admin answering that request thinks in weekdays, they think in "this
 * Thursday". So this lands the pattern on one actual week.
 *
 * Every day is resolved through the scheduler's own resolveAvailability, not a
 * second implementation of the same rules, so what this shows and what may
 * actually be booked cannot drift apart. Nothing here is stored (AD-06).
 */

/** The Monday of the week containing `date`; the school week runs Mon–Sun. */
export function weekStartOf(date: Date): Date {
  return startOfWeek(date, 1);
}

/** "3 – 9 Aug 2026", collapsing the parts the two ends share. */
export function weekLabel(start: Date, end: Date): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' }).format(d);
  const month = (d: Date) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d);
  const year = (d: Date) => new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' }).format(d);

  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) return `${day(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  if (sameYear) return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  return `${day(start)} ${month(start)} ${year(start)} – ${day(end)} ${month(end)} ${year(end)}`;
}

/** Hours in a set of windows, to one decimal — the unit a week is read in. */
export function windowHours(windows: Array<{ startTime: string; endTime: string }>): number {
  const minutes = windows.reduce((sum, w) => sum + (toMinutes(w.endTime) - toMinutes(w.startTime)), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export async function getTeacherWeek(teacherId: string, weekOf?: string): Promise<TeacherWeekDto> {
  const start = weekStartOf(weekOf ? fromDateKey(weekOf) : new Date());
  const end = addDays(start, 6);
  // Half-open, so a class at 23:30 on Sunday still belongs to this week.
  const rangeEnd = addDays(start, 7);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { fullName: true } },
      availability: { select: { weekday: true, startTime: true, endTime: true } },
      exceptions: {
        where: { date: { gte: start, lte: end } },
        select: { date: true, isAvailable: true, allDay: true, startTime: true, endTime: true },
      },
    },
  });
  if (!teacher) throw notFound('Teacher');

  const [occurrences, leave] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: {
        teacherId,
        status: { not: 'CANCELLED' },
        scheduledStart: { gte: start, lt: rangeEnd },
      },
      select: { scheduledStart: true },
    }),
    // Pending leave counts here too: it has not moved the calendar, but it is
    // the reason a day may be about to change, which is what both sides are
    // looking for.
    prisma.teacherLeaveRequest.findMany({
      where: {
        teacherId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        status: true,
        reason: true,
        allDay: true,
      },
    }),
  ]);

  const classesByDate = new Map<string, number>();
  for (const o of occurrences) {
    const key = toDateKey(o.scheduledStart);
    classesByDate.set(key, (classesByDate.get(key) ?? 0) + 1);
  }

  const todayKey = toDateKey(new Date());

  const days: TeacherWeekDayDto[] = [];
  let leaveDays = 0;
  let pendingLeaveDays = 0;

  for (let i = 0; i < 7; i += 1) {
    const date = addDays(start, i);
    const key = toDateKey(date);

    // Approved wins the label when both touch a date — it is the one that has
    // already taken the day out of the week.
    const covering = leave.filter((r) => toDateKey(r.fromDate) <= key && toDateKey(r.toDate) >= key);
    const onDay = covering.find((r) => r.status === 'APPROVED') ?? covering[0] ?? null;

    if (onDay) {
      const share = onDay.allDay ? 1 : 0.5;
      if (onDay.status === 'APPROVED') leaveDays += share;
      else pendingLeaveDays += share;
    }

    const windows = resolveAvailability(teacher.availability, teacher.exceptions, date);
    const patternWindows = teacher.availability
      .filter((s) => s.weekday === date.getUTCDay())
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime }))
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    days.push({
      date: key,
      weekday: date.getUTCDay(),
      dayLabel: WEEKDAY_SHORT[date.getUTCDay()]!,
      dateLabel: new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(date),
      isToday: key === todayKey,
      isPast: key < todayKey,
      windows,
      patternWindows,
      leaveStatus: onDay?.status ?? null,
      leaveReason: onDay?.reason ?? null,
      leaveRequestId: onDay?.id ?? null,
      classCount: classesByDate.get(key) ?? 0,
    });
  }

  return {
    teacherId,
    teacherName: teacher.user.fullName,
    weekStart: toDateKey(start),
    weekEnd: toDateKey(end),
    label: weekLabel(start, end),
    isCurrentWeek: toDateKey(weekStartOf(new Date())) === toDateKey(start),
    days,
    availableHours: windowHours(days.flatMap((d) => d.windows)),
    classCount: occurrences.length,
    leaveDays,
    pendingLeaveDays,
  };
}

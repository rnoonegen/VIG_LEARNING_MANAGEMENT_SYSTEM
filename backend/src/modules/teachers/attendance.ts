import type { TeacherMonthDto } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { datesCovered, listLeave } from './leave.js';

/**
 * A teacher's month, derived on read (AD-06).
 *
 * Nothing here is stored. Attendance is what the calendar and the answered leave
 * requests already say between them, so correcting a leave record corrects the
 * history with it — there is no second copy to fall out of step.
 *
 * "Taken" means the class ran: it is marked completed, or its end time has
 * passed and it was never cancelled. An upcoming class is counted separately
 * rather than folded in, because a month half-elapsed should not read as a month
 * half-worked.
 */

interface MonthRange {
  start: Date;
  end: Date;
  label: string;
}

/** "2026-08" → the UTC half-open range [1 Aug, 1 Sep). */
export function monthRange(month: string): MonthRange {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return {
    start,
    end,
    label: new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start),
  };
}

/** Every date in the month, as YYYY-MM-DD. */
function datesInMonth(range: MonthRange): string[] {
  const lastDay = new Date(range.end);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return datesCovered(range.start, lastDay);
}

export async function getTeacherMonth(teacherId: string, month: string): Promise<TeacherMonthDto> {
  const range = monthRange(month);
  const monthDateKeys = datesInMonth(range);
  const firstDay = monthDateKeys[0]!;
  const lastDay = monthDateKeys[monthDateKeys.length - 1]!;

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { fullName: true } },
      availability: { select: { weekday: true } },
    },
  });
  if (!teacher) throw notFound('Teacher');

  const [occurrences, leave] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: {
        teacherId,
        scheduledStart: { gte: range.start, lt: range.end },
      },
      select: {
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
        classRecord: { select: { status: true } },
      },
    }),
    // Every request overlapping the month in either direction, so leave that
    // straddles month end is counted in both, for the days it covers in each.
    listLeave({ teacherId }).then((all) =>
      all.filter((r) => r.fromDate <= lastDay && r.toDate >= firstDay),
    ),
  ]);

  const now = new Date();

  let classesTaken = 0;
  let classesUpcoming = 0;
  let classesCancelled = 0;
  let recordsOutstanding = 0;
  const taughtDates = new Set<string>();

  for (const o of occurrences) {
    if (o.status === 'CANCELLED') {
      classesCancelled += 1;
      continue;
    }

    const ran = o.status === 'COMPLETED' || o.scheduledEnd < now;
    if (!ran) {
      classesUpcoming += 1;
      continue;
    }

    classesTaken += 1;
    taughtDates.add(o.scheduledStart.toISOString().slice(0, 10));
    if (o.classRecord?.status !== 'SAVED') recordsOutstanding += 1;
  }

  // Leave days, counted only for the dates that actually fall inside this month.
  const monthDates = new Set(monthDateKeys);
  const countWithinMonth = (status: 'APPROVED' | 'PENDING') =>
    leave
      .filter((r) => r.status === status)
      .reduce((total, r) => {
        const inside = datesCovered(new Date(`${r.fromDate}T00:00:00.000Z`), new Date(`${r.toDate}T00:00:00.000Z`))
          .filter((d) => monthDates.has(d));
        return total + (r.allDay ? inside.length : inside.length * 0.5);
      }, 0);

  const leaveDays = countWithinMonth('APPROVED');
  const pendingLeaveDays = countWithinMonth('PENDING');

  // The days their stated week covers, less the ones leave took out of it.
  const workingWeekdays = new Set(teacher.availability.map((a) => a.weekday));
  const approvedDates = new Set(
    leave
      .filter((r) => r.status === 'APPROVED' && r.allDay)
      .flatMap((r) =>
        datesCovered(new Date(`${r.fromDate}T00:00:00.000Z`), new Date(`${r.toDate}T00:00:00.000Z`)),
      ),
  );
  const workingDays = [...monthDates].filter(
    (d) => workingWeekdays.has(new Date(`${d}T00:00:00.000Z`).getUTCDay()) && !approvedDates.has(d),
  ).length;

  return {
    month,
    monthLabel: range.label,
    teacherId,
    teacherName: teacher.user.fullName,
    classesTaken,
    classesUpcoming,
    classesCancelled,
    daysTaught: taughtDates.size,
    leaveDays,
    workingDays,
    pendingLeaveDays,
    recordsOutstanding,
    leave,
  };
}

/** The same month for every active teacher — the admin's attendance table. */
export async function getMonthForAllTeachers(month: string): Promise<TeacherMonthDto[]> {
  const teachers = await prisma.teacher.findMany({
    where: { user: { status: { not: 'ARCHIVED' } } },
    select: { id: true },
    orderBy: { user: { fullName: 'asc' } },
  });

  return Promise.all(teachers.map((t) => getTeacherMonth(t.id, month)));
}

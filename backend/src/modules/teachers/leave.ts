import type { Prisma } from '@prisma/client';
import type { CreateLeaveRequestInput, LeaveStatus, TeacherLeaveRequestDto } from '@vig/shared';
import { formatShortDate, formatTime12h } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { notify, notifyAllAdmins } from '../notifications/service.js';
import {
  resolveAvailability,
  type DatedException,
  type RecurringSlot,
} from '../scheduling/availability.js';

/**
 * Teacher leave (F5).
 *
 * A teacher states their own weekly availability, but taking a day out of it is
 * the school's decision — so this is a request, and the calendar does not move
 * until an admin answers it. Approving writes ordinary dated exceptions, which
 * means the scheduler, Needs Attention and the availability resolver learn
 * nothing new: approved leave is simply unavailability that went through a gate.
 *
 * Classes already booked on those dates are deliberately left alone. They become
 * a scheduling issue for a person to resolve (BR-06); nothing takes a class off a
 * child's calendar without somebody deciding to.
 */

const leaveInclude = {
  teacher: { include: { user: { select: { fullName: true } } } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.TeacherLeaveRequestInclude;

type LeaveWithRelations = Prisma.TeacherLeaveRequestGetPayload<{ include: typeof leaveInclude }>;

/** Dates are stored as calendar days; the school's clock is UTC wall time (BR-20). */
function dayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Every calendar date the request covers, inclusive of both ends. */
export function datesCovered(fromDate: Date, toDate: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    out.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Whole days, with a part-day counting as a half — the unit the month is read in. */
export function leaveDayCount(request: { fromDate: Date; toDate: Date; allDay: boolean }): number {
  const dates = datesCovered(request.fromDate, request.toDate);
  return request.allDay ? dates.length : 0.5;
}

/**
 * Which of the dates asked for are days the teacher actually works.
 *
 * Leave releases somebody from time they were expected for, so a date they were
 * never expected on has nothing to release: asking to be away on a Sunday they
 * never teach is not a request, it is a no-op that an admin would have to read
 * and answer anyway.
 *
 * A date carrying a class counts as worked whatever the weekly pattern says —
 * the class is the expectation, and a class they cannot make is precisely the
 * thing worth telling somebody about.
 *
 * Kept separate from the database so the rule can be tested directly.
 */
export function workingDatesIn(
  dates: string[],
  availability: RecurringSlot[],
  exceptions: DatedException[],
  datesWithClasses: ReadonlySet<string>,
): string[] {
  return dates.filter(
    (key) =>
      datesWithClasses.has(key) ||
      resolveAvailability(availability, exceptions, dayStart(key)).length > 0,
  );
}

function describe(request: { fromDate: Date; toDate: Date; allDay: boolean; startTime: string | null; endTime: string | null }): string {
  const from = formatShortDate(request.fromDate);
  const span = toDateKey(request.fromDate) === toDateKey(request.toDate)
    ? from
    : `${from} – ${formatShortDate(request.toDate)}`;

  if (request.allDay) return span;
  return `${span}, ${formatTime12h(request.startTime!)}–${formatTime12h(request.endTime!)}`;
}

/**
 * Classes still on the calendar inside the dates asked for.
 *
 * Shown to the admin before they answer, so approving is an informed decision
 * rather than a surprise on Admin Home the next morning.
 */
async function countAffectedClasses(request: { teacherId: string; fromDate: Date; toDate: Date }): Promise<number> {
  const dayAfter = new Date(request.toDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  return prisma.classOccurrence.count({
    where: {
      teacherId: request.teacherId,
      status: 'SCHEDULED',
      scheduledStart: { gte: request.fromDate, lt: dayAfter },
    },
  });
}

async function toDto(request: LeaveWithRelations): Promise<TeacherLeaveRequestDto> {
  return {
    id: request.id,
    teacherId: request.teacherId,
    teacherName: request.teacher.user.fullName,
    fromDate: toDateKey(request.fromDate),
    toDate: toDateKey(request.toDate),
    allDay: request.allDay,
    startTime: request.startTime,
    endTime: request.endTime,
    reason: request.reason,
    status: request.status,
    decidedByName: request.decidedBy?.fullName ?? null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    decisionNote: request.decisionNote,
    createdAt: request.createdAt.toISOString(),
    days: leaveDayCount(request),
    // Only pending and approved leave can still break a booking; a refused
    // request never touched the calendar.
    affectedClassCount:
      request.status === 'REJECTED' ? 0 : await countAffectedClasses(request),
  };
}

export async function listLeave(filter: { teacherId?: string; status?: LeaveStatus }): Promise<TeacherLeaveRequestDto[]> {
  const requests = await prisma.teacherLeaveRequest.findMany({
    where: {
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: leaveInclude,
    orderBy: [{ status: 'asc' }, { fromDate: 'desc' }],
  });

  return Promise.all(requests.map(toDto));
}

export async function createLeaveRequest(
  teacherId: string,
  input: CreateLeaveRequestInput,
  actorId: string,
): Promise<TeacherLeaveRequestDto> {
  const fromDate = dayStart(input.fromDate);
  const toDate = dayStart(input.toDate);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: { select: { fullName: true } },
      availability: { select: { weekday: true, startTime: true, endTime: true } },
      exceptions: {
        where: { date: { gte: fromDate, lte: toDate } },
        select: { date: true, isAvailable: true, allDay: true, startTime: true, endTime: true },
      },
    },
  });
  if (!teacher) throw notFound('Teacher');

  // Two live requests over the same dates would be two answers to one question.
  const clash = await prisma.teacherLeaveRequest.findFirst({
    where: {
      teacherId,
      status: { in: ['PENDING', 'APPROVED'] },
      fromDate: { lte: toDate },
      toDate: { gte: fromDate },
    },
  });
  if (clash) {
    throw badRequest(
      clash.status === 'PENDING'
        ? 'You already have a leave request waiting on these dates.'
        : 'Leave is already approved for these dates.',
    );
  }

  // Checked after the clash above, so a date already on leave is told why it is
  // refused rather than being reported as a day they do not work — which is
  // true, but only because the approved leave made it so.
  const dates = datesCovered(fromDate, toDate);
  const dayAfter = new Date(toDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const occurrences = await prisma.classOccurrence.findMany({
    where: {
      teacherId,
      status: 'SCHEDULED',
      scheduledStart: { gte: fromDate, lt: dayAfter },
    },
    select: { scheduledStart: true },
  });

  const working = workingDatesIn(
    dates,
    teacher.availability,
    teacher.exceptions,
    new Set(occurrences.map((o) => toDateKey(o.scheduledStart))),
  );

  if (working.length === 0) {
    throw badRequest(
      dates.length === 1
        ? 'You are not teaching that day, so there is no leave to ask for.'
        : 'You are not teaching on any of those dates, so there is no leave to ask for.',
    );
  }

  const created = await prisma.teacherLeaveRequest.create({
    data: {
      teacherId,
      fromDate,
      toDate,
      allDay: input.allDay,
      startTime: input.allDay ? null : (input.startTime ?? null),
      endTime: input.allDay ? null : (input.endTime ?? null),
      reason: input.reason.trim(),
    },
    include: leaveInclude,
  });

  const dto = await toDto(created);

  await notifyAllAdmins({
    type: 'LEAVE_REQUESTED',
    title: `${teacher.user.fullName} has requested leave`,
    body: `${describe(created)} — ${created.reason}`,
    payload: { teacherId, leaveRequestId: created.id },
  });

  await audit({
    actorId,
    action: 'LEAVE_REQUESTED',
    entity: 'TeacherLeaveRequest',
    entityId: created.id,
    after: { from: dto.fromDate, to: dto.toDate, days: dto.days },
  });

  return dto;
}

/**
 * The admin's answer.
 *
 * Approving writes one unavailable exception per covered date, tagged with this
 * request. Refusing writes nothing at all — a refused request is a record of the
 * conversation, not a change to the week.
 */
export async function decideLeaveRequest(
  requestId: string,
  status: 'APPROVED' | 'REJECTED',
  decisionNote: string | undefined,
  actorId: string,
): Promise<TeacherLeaveRequestDto> {
  const request = await prisma.teacherLeaveRequest.findUnique({
    where: { id: requestId },
    include: { teacher: { select: { userId: true } } },
  });
  if (!request) throw notFound('Leave request');
  if (request.status !== 'PENDING') {
    throw badRequest('This request has already been answered.');
  }

  const decided = await prisma.$transaction(async (tx) => {
    const updated = await tx.teacherLeaveRequest.update({
      where: { id: requestId },
      data: {
        status,
        decidedById: actorId,
        decidedAt: new Date(),
        decisionNote: decisionNote?.trim() || null,
      },
      include: leaveInclude,
    });

    if (status === 'APPROVED') {
      await tx.teacherAvailabilityException.createMany({
        data: datesCovered(request.fromDate, request.toDate).map((date) => ({
          teacherId: request.teacherId,
          date: dayStart(date),
          isAvailable: false,
          allDay: request.allDay,
          startTime: request.startTime,
          endTime: request.endTime,
          reason: `Approved leave — ${request.reason}`,
          leaveRequestId: requestId,
        })),
      });
    }

    return updated;
  });

  await notify({
    recipientUserId: request.teacher.userId,
    type: 'LEAVE_DECIDED',
    title: status === 'APPROVED' ? 'Your leave was approved' : 'Your leave was not approved',
    body: [describe(decided), decisionNote?.trim()].filter(Boolean).join(' — '),
    payload: { leaveRequestId: requestId, status },
  });

  await audit({
    actorId,
    action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    entity: 'TeacherLeaveRequest',
    entityId: requestId,
  });

  return toDto(decided);
}

/**
 * Withdrawing a request, or an admin taking an approval back.
 *
 * Deleting an approved request removes the exceptions it created — that is what
 * the foreign key cascade is for — so the teacher's week returns to what it was
 * rather than keeping a block nobody can account for.
 */
export async function deleteLeaveRequest(
  requestId: string,
  by: { role: 'ADMIN' | 'TEACHER'; teacherId: string | null; userId: string },
): Promise<{ removed: true }> {
  const request = await prisma.teacherLeaveRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('Leave request');

  if (by.role === 'TEACHER') {
    if (request.teacherId !== by.teacherId) throw notFound('Leave request');
    if (request.status !== 'PENDING') {
      throw badRequest('This request has been answered. Ask your administrator to change it.');
    }
  }

  await prisma.teacherLeaveRequest.delete({ where: { id: requestId } });

  await audit({
    actorId: by.userId,
    action: request.status === 'PENDING' ? 'LEAVE_WITHDRAWN' : 'LEAVE_APPROVAL_REVOKED',
    entity: 'TeacherLeaveRequest',
    entityId: requestId,
  });

  return { removed: true };
}

import type { AttentionIssueDto } from '@vig/shared';
import { formatShortDate, formatInstantTime, toHHMM } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { isAvailableFor } from '../scheduling/availability.js';
import { recordWindowState } from '../classrecord/window.js';

/**
 * Needs Attention is derived, never stored (AD-06).
 *
 * Recomputing from current state on each Home request is cheap at this scale and
 * removes a whole class of bug: there is nothing to keep in sync, and an issue
 * disappears the moment its cause is resolved.
 *
 * One root cause produces exactly one issue with a deterministic groupKey, and
 * the affected records hang off it for drill-down (BR-16). Three classes broken
 * by one teacher's absence is one card saying "Priya is unavailable — 3 classes
 * affected", not three unrelated warnings.
 */

const LOOKAHEAD_DAYS = 14;

function endOfWindow(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + LOOKAHEAD_DAYS);
  return d;
}

function windowOf(start: Date, end: Date) {
  return {
    startTime: toHHMM(start.getUTCHours() * 60 + start.getUTCMinutes()),
    endTime: toHHMM(end.getUTCHours() * 60 + end.getUTCMinutes()),
  };
}

function dayOf(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Merges an affected record into its root-cause issue, creating the issue on
 * first sight (BR-16). Pure and exported so the grouping rule can be tested
 * without standing up a database.
 */
export function pushIssue(
  issues: Map<string, AttentionIssueDto>,
  issue: AttentionIssueDto,
  affected: AttentionIssueDto['affected'][number],
): void {
  const existing = issues.get(issue.groupKey);
  if (existing) {
    existing.affected.push(affected);
  } else {
    issues.set(issue.groupKey, { ...issue, affected: [affected] });
  }
}

/**
 * Orders issues for display and fills in the details that are only knowable once
 * every affected record has been collected — notably the "3 classes affected"
 * count and the reschedule deep link.
 */
export function finaliseIssues(issues: Map<string, AttentionIssueDto>): AttentionIssueDto[] {
  // Danger first, then warning, then info — the order the boards show.
  const weight = { danger: 0, warning: 1, info: 2 } as const;
  const out = [...issues.values()].sort((a, b) => weight[a.severity] - weight[b.severity]);

  for (const issue of out) {
    if (issue.type === 'TEACHER_UNAVAILABLE') {
      issue.actionHref = `/admin/schedule/reschedule?occurrences=${issue.affected.map((a) => a.id).join(',')}`;
      issue.detail = `${issue.detail} · ${issue.affected.length} ${
        issue.affected.length === 1 ? 'class' : 'classes'
      } affected`;
    }
  }

  return out;
}

export async function computeAttention(): Promise<AttentionIssueDto[]> {
  const now = new Date();
  const horizon = endOfWindow();

  const [upcoming, students, overdue, resetRequests] = await Promise.all([
    prisma.classOccurrence.findMany({
      where: { status: 'SCHEDULED', scheduledStart: { gte: now, lte: horizon } },
      include: {
        class: {
          include: {
            subject: true,
            students: { include: { student: { select: { id: true, fullName: true } } } },
          },
        },
        teacher: { include: { user: { select: { fullName: true } }, availability: true, exceptions: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.student.findMany({
      where: { status: 'ACTIVE' },
      include: {
        subjectLevels: { where: { isCurrent: true }, include: { subject: true } },
        // Which subjects somebody is actually teaching them — an assignment with
        // no class means the child is studying it on paper only.
        classes: { include: { class: { select: { subjectId: true, status: true } } } },
      },
    }),
    prisma.classOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledEnd: { lt: now },
        OR: [{ classRecord: null }, { classRecord: { status: { not: 'SAVED' } } }],
      },
      include: {
        class: { include: { subject: true } },
        teacher: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 100,
    }),
    prisma.notification.findMany({
      where: { type: 'PASSWORD_RESET_REQUEST', readAt: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const issues = new Map<string, AttentionIssueDto>();

  const push = (issue: AttentionIssueDto, affected: AttentionIssueDto['affected'][number]) =>
    pushIssue(issues, issue, affected);

  // --- 1. Teacher unavailable for a class already scheduled -----------------
  for (const o of upcoming) {
    const date = dayOf(o.scheduledStart);
    const free = isAvailableFor(
      o.teacher.availability,
      o.teacher.exceptions,
      date,
      windowOf(o.scheduledStart, o.scheduledEnd),
    );
    if (free) continue;

    const dateKey = date.toISOString().slice(0, 10);
    push(
      {
        // One teacher + one date = one root cause.
        groupKey: `TEACHER_UNAVAILABLE:${o.teacherId}:${dateKey}`,
        type: 'TEACHER_UNAVAILABLE',
        title: `${o.teacher.user.fullName} is unavailable`,
        detail: formatShortDate(date),
        severity: 'danger',
        actionLabel: 'Resolve',
        actionHref: `/admin/schedule/reschedule?occurrences=`,
        affected: [],
      },
      {
        id: o.id,
        label: o.class.subject.name,
        sublabel: `${formatShortDate(o.scheduledStart)} · ${formatInstantTime(o.scheduledStart)}`,
        href: `/admin/schedule?date=${dateKey}`,
      },
    );
  }

  // --- 2. Double bookings ---------------------------------------------------
  //
  // "Student scheduled outside their availability" used to sit here. A child no
  // longer states when they can attend, so the only timing problem left that
  // concerns them is being in two places at once, immediately below.
  for (let i = 0; i < upcoming.length; i += 1) {
    for (let j = i + 1; j < upcoming.length; j += 1) {
      const a = upcoming[i]!;
      const b = upcoming[j]!;
      if (a.scheduledStart >= b.scheduledEnd || b.scheduledStart >= a.scheduledEnd) continue;

      const sameTeacher = a.teacherId === b.teacherId;
      const sharedStudent = a.class.students.some((x) =>
        b.class.students.some((y) => y.studentId === x.studentId),
      );
      if (!sameTeacher && !sharedStudent) continue;

      // Order the pair so the key is stable regardless of query order.
      const [first, second] = [a.id, b.id].sort();
      push(
        {
          groupKey: `SCHEDULE_CONFLICT:${first}:${second}`,
          type: 'SCHEDULE_CONFLICT',
          title: 'Two classes overlap',
          detail: sameTeacher
            ? `${a.teacher.user.fullName} is booked twice at the same time.`
            : 'A student is booked into two classes at once.',
          severity: 'danger',
          actionLabel: 'Resolve',
          actionHref: `/admin/schedule?date=${a.scheduledStart.toISOString().slice(0, 10)}`,
          affected: [],
        },
        {
          id: a.id,
          label: `${a.class.subject.name} & ${b.class.subject.name}`,
          sublabel: `${formatShortDate(a.scheduledStart)} · ${formatInstantTime(a.scheduledStart)}`,
          href: `/admin/schedule?date=${a.scheduledStart.toISOString().slice(0, 10)}`,
        },
      );
    }
  }

  // --- 3. Incomplete student setup ------------------------------------------
  for (const s of students) {
    const missing: string[] = [];
    if (s.subjectLevels.length === 0) missing.push('subject levels');

    // A subject added to a child after enrolment is easy to leave stranded: it
    // shows on their profile and in the parent portal, but no teacher ever sees
    // them for it until a class exists.
    const taught = new Set(
      s.classes.filter((cs) => cs.class.status !== 'ARCHIVED').map((cs) => cs.class.subjectId),
    );
    const untaught = s.subjectLevels.filter((sl) => !taught.has(sl.subjectId));
    if (untaught.length > 0) {
      missing.push(`a class for ${untaught.map((sl) => sl.subject.name).join(' and ')}`);
    }

    if (missing.length === 0) continue;

    issues.set(`INCOMPLETE_STUDENT_SETUP:${s.id}`, {
      groupKey: `INCOMPLETE_STUDENT_SETUP:${s.id}`,
      type: 'INCOMPLETE_STUDENT_SETUP',
      title: `${s.fullName}'s setup is incomplete`,
      detail: `Still needed: ${missing.join(' and ')}.`,
      severity: 'info',
      actionLabel: 'Review student',
      actionHref: `/admin/students/${s.id}`,
      affected: [
        { id: s.id, label: s.fullName, sublabel: missing.join(', '), href: `/admin/students/${s.id}` },
      ],
    });
  }

  // --- 4. Class records: still due, versus missed for good -------------------
  //
  // These need different responses. An outstanding record can still be written
  // by the teacher; a missed one cannot — the deadline passed, the class is
  // undocumented, and only an admin can now do anything about it.
  for (const o of overdue) {
    const closed = recordWindowState(o.scheduledStart, now) === 'CLOSED';

    push(
      closed
        ? {
            groupKey: `CLASS_RECORD_MISSED:${o.teacherId}`,
            type: 'CLASS_RECORD_OVERDUE',
            title: `${o.teacher.user.fullName} missed the deadline on some class records`,
            detail: 'These classes were never recorded and can no longer be recorded by the teacher.',
            severity: 'danger',
            actionLabel: 'Review',
            actionHref: `/admin/schedule?date=${o.scheduledStart.toISOString().slice(0, 10)}`,
            affected: [],
          }
        : {
            groupKey: `CLASS_RECORD_OVERDUE:${o.teacherId}`,
            type: 'CLASS_RECORD_OVERDUE',
            title: `${o.teacher.user.fullName} has class records outstanding`,
            detail: 'These classes have finished but have no saved record yet.',
            severity: 'warning',
            actionLabel: 'Review',
            actionHref: `/admin/schedule?date=${o.scheduledStart.toISOString().slice(0, 10)}`,
            affected: [],
          },
      {
        id: o.id,
        label: o.class.subject.name,
        sublabel: `${formatShortDate(o.scheduledStart)} · ${formatInstantTime(o.scheduledStart)}`,
        href: `/teacher/class/${o.id}`,
      },
    );
  }

  // --- 5. Password reset requests (AD-09) -----------------------------------
  const seenResetUsers = new Set<string>();
  for (const n of resetRequests) {
    const payload = n.payload as { userId?: string; username?: string } | null;
    if (!payload?.userId || seenResetUsers.has(payload.userId)) continue;
    seenResetUsers.add(payload.userId);

    issues.set(`PASSWORD_RESET_REQUEST:${payload.userId}`, {
      groupKey: `PASSWORD_RESET_REQUEST:${payload.userId}`,
      type: 'PASSWORD_RESET_REQUEST',
      title: 'Password reset requested',
      detail: n.body,
      severity: 'info',
      actionLabel: 'Reset password',
      actionHref: `/settings/accounts?reset=${payload.userId}`,
      affected: [
        {
          id: payload.userId,
          label: payload.username ?? 'Account',
          sublabel: 'Awaiting an admin reset',
          href: `/settings/accounts?reset=${payload.userId}`,
        },
      ],
    });
  }

  return finaliseIssues(issues);
}

import type { LeaveStatus, TeacherLeaveRequestDto, TeacherMonthDto } from '@vig/shared';
import { formatShortDate, formatTime12h } from '@vig/shared';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Field';

/**
 * A teacher's month, as both sides read it (F5).
 *
 * The same component serves the teacher looking at their own record and the
 * admin looking at anybody's, because the answer should not depend on who is
 * asking. Every figure is derived from the calendar and answered leave requests
 * — nothing here is a stored tally that could drift (AD-06).
 */

/** The last twelve months, newest first, as YYYY-MM. */
export function recentMonths(count = 12): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let i = 0; i < count; i += 1) {
    out.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return out;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00.000Z`),
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Month"
      className="max-w-[190px]"
    >
      {recentMonths().map((month) => (
        <option key={month} value={month}>
          {monthLabel(month)}
        </option>
      ))}
    </Select>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className="rounded-[12px] border border-line px-3 py-2.5">
      <p className={`text-xl font-semibold ${tone === 'warning' && value > 0 ? 'text-warning' : 'text-ink'}`}>
        {value % 1 === 0 ? value : value.toFixed(1)}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-2">{label}</p>
    </div>
  );
}

/** The headline figures: what they taught, and what they were away for. */
export function MonthStats({ month }: { month: TeacherMonthDto }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Classes taken" value={month.classesTaken} />
      <Stat label="Days taught" value={month.daysTaught} />
      <Stat label="Leave days" value={month.leaveDays} />
      <Stat label="Working days" value={month.workingDays} />
      <Stat label="Still to come" value={month.classesUpcoming} />
      <Stat label="Records owed" value={month.recordsOutstanding} tone="warning" />
    </div>
  );
}

const STATUS_TONE: Record<LeaveStatus, 'green' | 'red' | 'muted'> = {
  APPROVED: 'green',
  REJECTED: 'red',
  PENDING: 'muted',
};

/** How the dates read on a slip of paper: "12 Aug", or "12–14 Aug", or a window. */
export function leaveDates(request: TeacherLeaveRequestDto): string {
  const from = formatShortDate(new Date(`${request.fromDate}T00:00:00.000Z`));
  const span =
    request.fromDate === request.toDate
      ? from
      : `${from} – ${formatShortDate(new Date(`${request.toDate}T00:00:00.000Z`))}`;

  if (request.allDay) return span;
  return `${span} · ${formatTime12h(request.startTime!)}–${formatTime12h(request.endTime!)}`;
}

/**
 * One request, as a row. `action` is whatever the viewer is allowed to do about
 * it — approve/reject for an admin, withdraw for the teacher who raised it.
 */
export function LeaveRow({
  request,
  action,
  showTeacher,
}: {
  request: TeacherLeaveRequestDto;
  action?: React.ReactNode;
  showTeacher?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5">
      <div className="min-w-[200px] flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          {showTeacher ? <span>{request.teacherName} ·</span> : null}
          {leaveDates(request)}
          <Pill token={STATUS_TONE[request.status]}>
            {request.status === 'PENDING'
              ? 'Awaiting review'
              : request.status === 'APPROVED'
                ? 'Approved'
                : 'Not approved'}
          </Pill>
        </p>

        <p className="mt-1 text-xs text-ink-2">
          {request.days} {request.days === 1 ? 'day' : 'days'} · {request.reason}
        </p>

        {request.decidedByName ? (
          <p className="mt-1 text-xs text-ink-3">
            {request.status === 'APPROVED' ? 'Approved' : 'Answered'} by {request.decidedByName}
            {request.decisionNote ? ` — ${request.decisionNote}` : ''}
          </p>
        ) : null}

        {request.status !== 'REJECTED' && request.affectedClassCount > 0 ? (
          <p className="mt-1 text-xs text-warning">
            {request.affectedClassCount} class{request.affectedClassCount === 1 ? '' : 'es'} already
            scheduled on {request.affectedClassCount === 1 ? 'this date' : 'these dates'}
            {request.status === 'PENDING' ? ' — approving will need them rescheduled.' : '.'}
          </p>
        ) : null}
      </div>

      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </li>
  );
}

export function LeaveList({
  requests,
  emptyText,
  renderAction,
  showTeacher,
}: {
  requests: TeacherLeaveRequestDto[];
  emptyText: string;
  renderAction?: (request: TeacherLeaveRequestDto) => React.ReactNode;
  showTeacher?: boolean;
}) {
  if (requests.length === 0) return <p className="text-sm text-ink-3">{emptyText}</p>;

  return (
    <ul className="flex flex-col gap-2">
      {requests.map((request) => (
        <LeaveRow
          key={request.id}
          request={request}
          showTeacher={showTeacher}
          action={renderAction?.(request)}
        />
      ))}
    </ul>
  );
}

/** Stats plus the month's leave, the shape both portals show. */
export function TeacherMonthPanel({ month, children }: { month: TeacherMonthDto; children?: React.ReactNode }) {
  return (
    <Card>
      <MonthStats month={month} />

      {month.pendingLeaveDays > 0 ? (
        <p className="mt-3 rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          {month.pendingLeaveDays} {month.pendingLeaveDays === 1 ? 'day' : 'days'} of leave in this month
          is still waiting on a decision, so it is not counted above.
        </p>
      ) : null}

      <div className="mt-4">{children}</div>
    </Card>
  );
}

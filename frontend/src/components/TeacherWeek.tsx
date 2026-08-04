import { ChevronLeft, ChevronRight, Plane } from 'lucide-react';
import type { TeacherWeekDayDto, TeacherWeekDto } from '@vig/shared';
import { addDays, formatTime12h, fromDateKey, toDateKey } from '@vig/shared';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Chip';

/**
 * The running week, with dates on it (F5).
 *
 * The weekly pattern is a repeating shape; this is that shape landed on one real
 * week. Both portals render this same component, because "is Thursday free?"
 * should have one answer regardless of who is asking — and because the answer
 * comes from the server's resolver, not from re-deriving the rules here.
 */

/** Monday of the week containing `dateKey`, matching the server's school week. */
export function weekStartKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return toDateKey(addDays(date, -((date.getUTCDay() + 6) % 7)));
}

export function thisWeekStart(): string {
  return weekStartKey(new Date().toISOString().slice(0, 10));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  return toDateKey(addDays(fromDateKey(weekStart), weeks * 7));
}

/**
 * A day the teacher actually works — hours they could teach in, or a class
 * already sitting on the date. The second half matters: a class booked outside
 * the stated week is still a day they have to be there for, and that is exactly
 * the day worth telling somebody they cannot make.
 */
export function isWorkingDay(day: TeacherWeekDayDto): boolean {
  return day.windows.length > 0 || day.classCount > 0;
}

/**
 * Whether leave can still be asked for on a day.
 *
 * Three ways there is nothing to ask: the day has gone; the day is not one they
 * work, so there is no time to be released from; or leave is already on it,
 * waiting or granted — the API refuses a second request over the same dates, so
 * offering one would only produce an error after the form had been filled in.
 *
 * Defined once because the panel decides what is tappable and the page decides
 * what is asked for, and the two must agree.
 */
export function canRequestLeave(day: TeacherWeekDayDto): boolean {
  return (!day.isPast || day.isToday) && isWorkingDay(day) && day.leaveStatus === null;
}

/** Back a week, forward a week, and a way home to the current one. */
export function WeekPicker({
  weekStart,
  onChange,
  isCurrentWeek,
}: {
  weekStart: string;
  onChange: (weekStart: string) => void;
  isCurrentWeek: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftWeek(weekStart, -1))}
        aria-label="Previous week"
        className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-lavender-2 hover:text-violet"
      >
        <ChevronLeft size={16} />
      </button>

      {!isCurrentWeek ? (
        <button
          type="button"
          onClick={() => onChange(thisWeekStart())}
          className="rounded-[10px] px-2 py-1 text-xs font-medium text-violet hover:underline"
        >
          This week
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => onChange(shiftWeek(weekStart, 1))}
        aria-label="Next week"
        className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-lavender-2 hover:text-violet"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/**
 * What one date came to.
 *
 * A day is read in this order: leave first, because it is why the day is
 * unusual; then the hours that survive it; then what is booked. A day whose
 * hours differ from the regular week says so — an unexplained blank is the thing
 * that sends somebody to ask.
 *
 * Where picking a day does something, the card is a button: choosing the date
 * here is how a teacher says which day the leave request is about, so the date
 * is never typed twice. Today is marked by its border alone — being today is not
 * the same as being the day they have chosen, and the two must not look alike.
 */
function DayCard({
  day,
  selected,
  onSelect,
}: {
  day: TeacherWeekDayDto;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const onLeave = day.leaveStatus !== null;
  const approvedLeave = day.leaveStatus === 'APPROVED';
  const free = day.windows.length === 0;
  const patternDiffers =
    !approvedLeave &&
    day.patternWindows.length > 0 &&
    JSON.stringify(day.windows) !== JSON.stringify(day.patternWindows);

  const className = [
    'flex flex-col gap-1.5 rounded-[12px] border px-3 py-2.5 text-left',
    selected
      ? 'border-violet bg-lavender-2 ring-2 ring-violet'
      : day.isToday
        ? 'border-violet'
        : 'border-line',
    day.isPast && !day.isToday ? 'opacity-60' : '',
    onSelect ? 'cursor-pointer transition-colors hover:border-violet' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{day.dayLabel}</span>
        <span className="text-[11px] text-ink-2">{day.dateLabel}</span>
      </div>

      {day.isToday ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet">Today</span>
      ) : null}

      {onLeave ? (
        <Pill token={approvedLeave ? 'red' : 'muted'}>
          <span className="inline-flex items-center gap-1">
            <Plane size={11} />
            {approvedLeave ? 'On leave' : 'Leave asked'}
          </span>
        </Pill>
      ) : null}

      {free ? (
        <span className="text-xs text-ink-3">{approvedLeave ? 'Away' : 'Not available'}</span>
      ) : (
        <div className="flex flex-col gap-1">
          {day.windows.map((w, index) => (
            <span
              key={index}
              className="rounded-full bg-lavender-2 px-2 py-0.5 text-center text-[11px] font-medium text-ink-2"
            >
              {formatTime12h(w.startTime)} – {formatTime12h(w.endTime)}
            </span>
          ))}
        </div>
      )}

      {patternDiffers ? (
        <span className="text-[10px] leading-tight text-ink-3">Changed for this date</span>
      ) : null}

      {day.classCount > 0 ? (
        <span className="text-[11px] text-ink-2">
          {day.classCount} {day.classCount === 1 ? 'class' : 'classes'}
        </span>
      ) : null}

      {/* A class still booked on approved leave is the case somebody has to
          resolve — approving leave never cancels anything (BR-06). */}
      {approvedLeave && day.classCount > 0 ? (
        <span className="text-[10px] font-medium leading-tight text-warning">Still booked</span>
      ) : null}
    </>
  );

  if (!onSelect) return <div className={className}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected ?? false}
      className={className}
    >
      {body}
    </button>
  );
}

/**
 * The week as seven dated cards, plus what it comes to.
 *
 * `children` is whatever the viewer can do about it — request leave on the
 * teacher's own page, nothing on the admin's.
 */
export function TeacherWeekPanel({
  week,
  selectedDate,
  onSelectDay,
  children,
}: {
  week: TeacherWeekDto;
  /** Only where choosing a day leads somewhere — the teacher's own page. */
  selectedDate?: string | null;
  onSelectDay?: (date: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">{week.label}</p>
        {week.isCurrentWeek ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-violet">
            This week
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {week.days.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            selected={day.date === selectedDate}
            // Days there is nothing to ask about stay statements rather than
            // pretending to be a choice.
            onSelect={
              onSelectDay && canRequestLeave(day) ? () => onSelectDay(day.date) : undefined
            }
          />
        ))}
      </div>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>
          <span className="font-medium text-ink">{week.availableHours}</span> hours available
        </span>
        <span>
          <span className="font-medium text-ink">{week.classCount}</span>{' '}
          {week.classCount === 1 ? 'class' : 'classes'} booked
        </span>
        {week.leaveDays > 0 ? (
          <span>
            <span className="font-medium text-ink">{week.leaveDays}</span>{' '}
            {week.leaveDays === 1 ? 'day' : 'days'} of leave
          </span>
        ) : null}
        {week.pendingLeaveDays > 0 ? (
          <span className="text-warning">
            {week.pendingLeaveDays} {week.pendingLeaveDays === 1 ? 'day' : 'days'} awaiting a decision
          </span>
        ) : null}
      </p>

      {children ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}

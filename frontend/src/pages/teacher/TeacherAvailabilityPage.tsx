import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Plane, Trash2 } from 'lucide-react';
import type {
  TeacherDto,
  TeacherLeaveRequestDto,
  TeacherMonthDto,
  TeacherWeekDto,
} from '@vig/shared';
import { formatShortDate, formatTime12h } from '@vig/shared';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { PageHeader, Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea, Toggle } from '@/components/ui/Field';
import {
  AvailabilityGrid,
  availabilityProblems,
  fromDayRows,
  toDayRows,
  type DayAvailability,
} from '@/components/AvailabilityGrid';
import { LeaveList, MonthPicker, TeacherMonthPanel } from '@/components/TeacherMonth';
import { TeacherWeekPanel, WeekPicker, thisWeekStart } from '@/components/TeacherWeek';

/**
 * A teacher's own time (F5).
 *
 * Three things, in the order they matter: the week they can work, the leave they
 * have asked for, and what the month came to. The week is theirs to state
 * outright; leave is a request, because taking a day out of a week the school
 * schedules against is the school's decision.
 */
export function TeacherAvailabilityPage() {
  const { user } = useAuth();
  const teacherId = user?.teacherId ?? '';
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [weekStart, setWeekStart] = useState(thisWeekStart);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', teacherId],
    queryFn: () => get<TeacherDto>(`/teachers/${teacherId}`),
    enabled: Boolean(teacherId),
  });

  const { data: week } = useQuery({
    queryKey: ['teachers', teacherId, 'week', weekStart],
    queryFn: () => get<TeacherWeekDto>(`/teachers/${teacherId}/week`, { week: weekStart }),
    enabled: Boolean(teacherId),
  });

  const { data: leave } = useQuery({
    queryKey: ['teachers', teacherId, 'leave'],
    queryFn: () => get<TeacherLeaveRequestDto[]>(`/teachers/${teacherId}/leave`),
    enabled: Boolean(teacherId),
  });

  const { data: monthData } = useQuery({
    queryKey: ['teachers', teacherId, 'attendance', month],
    queryFn: () => get<TeacherMonthDto>(`/teachers/${teacherId}/attendance`, { month }),
    enabled: Boolean(teacherId),
  });

  if (!teacherId) {
    return (
      <div>
        <PageHeader title="My time" />
        <Card>
          <p className="text-sm text-ink-2">
            This page is for teaching staff. Your account is not linked to a teaching profile.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) return <LoadingState rows={5} label="Loading your availability" />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        title="My time"
        description="The week you are in, the week you normally teach, the leave you have asked for, and what the month came to."
      />

      <ThisWeek
        week={week}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        teacherId={teacherId}
      />
      <WeeklyPattern teacher={data} weekStart={weekStart} weekLabel={week?.label} />
      <Leave teacherId={teacherId} requests={leave ?? []} />
      <MyMonth month={month} onMonthChange={setMonth} data={monthData} />
      <ExtraHours teacher={data} />
    </div>
  );
}

/**
 * The week they are actually in.
 *
 * The pattern below says "Tuesdays"; this says "Tue 4 Aug", which is the form
 * an emergency arrives in. Tapping a day chooses it, and asking for leave
 * carries that date into the request — so the common case needs no date picking
 * at all, and a day other than today is one tap away.
 */
function ThisWeek({
  week,
  weekStart,
  onWeekChange,
  teacherId,
}: {
  week: TeacherWeekDto | undefined;
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  teacherId: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [askingFrom, setAskingFrom] = useState<string | null>(null);

  // Only days still ahead can be asked about. Deriving the selection from what
  // is on screen — rather than storing it — means paging to another week cannot
  // leave a date chosen that nobody can see.
  const askable = (week?.days ?? []).filter((d) => !d.isPast || d.isToday);
  const selected = askable.find((d) => d.date === picked) ?? askable[0] ?? null;

  return (
    <Section
      title="This week"
      action={
        <WeekPicker
          weekStart={weekStart}
          onChange={onWeekChange}
          isCurrentWeek={week?.isCurrentWeek ?? false}
        />
      }
    >
      {week ? (
        <TeacherWeekPanel
          week={week}
          selectedDate={selected?.date ?? null}
          onSelectDay={setPicked}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plane size={14} />}
              disabled={!selected}
              onClick={() => selected && setAskingFrom(selected.date)}
            >
              Request Leave
            </Button>
            <p className="text-xs text-ink-2">
              {selected ? (
                <>
                  Tap the day you can't make — asking for{' '}
                  <span className="font-medium text-ink">
                    {selected.dayLabel} {selected.dateLabel}
                  </span>
                  . Your administrator answers it, and nothing on the schedule changes until they do.
                </>
              ) : (
                'That week has already been. Move forward to ask for leave.'
              )}
            </p>
          </div>
        </TeacherWeekPanel>
      ) : (
        <LoadingState rows={2} />
      )}

      {askingFrom ? (
        <RequestLeaveModal
          teacherId={teacherId}
          initialDate={askingFrom}
          onClose={() => setAskingFrom(null)}
        />
      ) : null}
    </Section>
  );
}

/**
 * The repeating week.
 *
 * Dated against whichever week is showing above, because "Tuesday" and "Tue 4
 * Aug" are the same row and reading it should not need a calendar. The dates
 * are a reading aid only — saving changes the pattern for every week, which the
 * line under the heading says outright.
 */
function WeeklyPattern({
  teacher,
  weekStart,
  weekLabel,
}: {
  teacher: TeacherDto;
  weekStart: string;
  weekLabel: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DayAvailability[]>(toDayRows(teacher.availability));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(toDayRows(teacher.availability)), [teacher.availability]);

  const save = useMutation({
    mutationFn: () => put(`/teachers/${teacher.id}/availability`, { slots: fromDayRows(rows) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const problems = availabilityProblems(rows);

  return (
    <Section title="My regular week">
      <Card>
        <p className="mb-1.5 text-sm text-ink-2">
          This is your normal repeating week. It is a boundary on when classes may be scheduled — not
          the timetable itself. Add as many times a day as you need.
        </p>

        <p className="mb-4 text-xs text-ink-3">
          {weekLabel ? (
            <>
              Dated against <span className="font-medium text-ink-2">{weekLabel}</span>, the week
              shown above.{' '}
            </>
          ) : null}
          Saving applies to every week, not just this one.
        </p>

        <AvailabilityGrid
          rows={rows}
          weekStart={weekStart}
          onChange={(next) => {
            setRows(next);
            setSaved(false);
          }}
        />

        {problems.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={problem} className="text-xs text-danger">
                {problem}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}

        <div className="mt-4">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || problems.length > 0}
            icon={saved ? <Check size={14} /> : undefined}
          >
            {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </Card>
    </Section>
  );
}

/**
 * Leave: asked for here, answered by an administrator.
 *
 * Nothing moves on the calendar until they answer — a pending request is a
 * question, not a day off. Once approved it becomes unavailability like any
 * other, and the scheduler stops offering those hours.
 */
function Leave({ teacherId, requests }: { teacherId: string; requests: TeacherLeaveRequestDto[] }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);

  const withdraw = useMutation({
    mutationFn: (id: string) => del(`/teachers/leave/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <Section
      title="My leave"
      action={
        <Button variant="secondary" size="sm" icon={<Plane size={14} />} onClick={() => setAsking(true)}>
          Request Leave
        </Button>
      }
    >
      <Card>
        <p className="mb-3 text-sm text-ink-2">
          Something come up on a day you normally teach? Ask here. Your administrator reviews it, and
          nothing changes on the schedule until they approve it.
        </p>

        <LeaveList
          requests={requests}
          emptyText="No leave requested."
          renderAction={(request) =>
            request.status === 'PENDING' ? (
              <button
                type="button"
                onClick={() => withdraw.mutate(request.id)}
                aria-label="Withdraw request"
                className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            ) : null
          }
        />
      </Card>

      {asking ? <RequestLeaveModal teacherId={teacherId} onClose={() => setAsking(false)} /> : null}
    </Section>
  );
}

function RequestLeaveModal({
  teacherId,
  initialDate,
  onClose,
}: {
  teacherId: string;
  /** The date they asked from, when they came here from a day in the week. */
  initialDate?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const start = initialDate ?? new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(start);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      post(`/teachers/${teacherId}/leave`, {
        fromDate,
        // Part-day leave is one date, so the form does not let the two drift.
        toDate: allDay ? toDate : fromDate,
        allDay,
        ...(allDay ? {} : { startTime, endTime }),
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const complete = reason.trim().length > 0 && (allDay ? fromDate <= toDate : startTime < endTime);

  return (
    <Modal
      open
      onClose={onClose}
      title="Request leave"
      description="Your administrator will be notified and will approve or decline it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!complete || create.isPending}>
            {create.isPending ? 'Sending…' : 'Send Request'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Toggle checked={allDay} onChange={setAllDay} label="Whole days" />
          <span className="text-sm text-ink">Whole days</span>
        </div>

        {allDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" htmlFor="leave-from" required>
              <Input
                id="leave-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (e.target.value > toDate) setToDate(e.target.value);
                }}
              />
            </Field>
            <Field label="Last day" htmlFor="leave-to" required hint="Same as the first for one day.">
              <Input
                id="leave-to"
                type="date"
                min={fromDate}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Date" htmlFor="leave-date" required>
              <Input
                id="leave-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Field label="From">
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <Field
          label="Reason"
          htmlFor="leave-reason"
          required
          error={error}
          hint="Your administrator sees this — it is what they answer."
        >
          <Textarea
            id="leave-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Family emergency"
          />
        </Field>

        <p className="rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
          Classes already scheduled on these dates are not cancelled automatically. Your administrator
          will reschedule or reassign them.
        </p>
      </div>
    </Modal>
  );
}

function MyMonth({
  month,
  onMonthChange,
  data,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  data: TeacherMonthDto | undefined;
}) {
  return (
    <Section
      title="My month"
      action={<MonthPicker value={month} onChange={onMonthChange} />}
    >
      {data ? (
        <TeacherMonthPanel month={data}>
          <p className="text-xs text-ink-2">
            Classes taken counts every class of yours that has already run this month. Leave days are
            the ones your administrator approved.
          </p>
        </TeacherMonthPanel>
      ) : (
        <LoadingState rows={2} />
      )}
    </Section>
  );
}

/**
 * Offering hours outside the normal week needs nobody's permission — it is more
 * availability, not less — so it stays an immediate change rather than a request.
 */
function ExtraHours({ teacher }: { teacher: TeacherDto }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const extra = teacher.exceptions.filter((e) => e.isAvailable);

  const remove = useMutation({
    mutationFn: (id: string) => del(`/teachers/exceptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <Section
      title="Extra hours on a date"
      action={
        <Button
          variant="secondary"
          size="sm"
          icon={<CalendarPlus size={14} />}
          onClick={() => setAdding(true)}
        >
          Add Hours
        </Button>
      }
    >
      <Card>
        <p className="mb-3 text-sm text-ink-2">
          Time you can offer on one date beyond your normal week. This takes effect straight away — to
          be away instead, request leave above.
        </p>

        {extra.length === 0 ? (
          <p className="text-sm text-ink-3">None offered.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {extra.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{formatShortDate(new Date(e.date))}</p>
                  <p className="text-xs text-ink-2">
                    {e.allDay
                      ? 'All day'
                      : `${formatTime12h(e.startTime!)}–${formatTime12h(e.endTime!)}`}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(e.id)}
                  aria-label="Remove extra hours"
                  className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding ? <ExtraHoursModal teacherId={teacher.id} onClose={() => setAdding(false)} /> : null}
    </Section>
  );
}

function ExtraHoursModal({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      post(`/teachers/${teacherId}/exceptions`, {
        date,
        isAvailable: true,
        allDay,
        ...(allDay ? {} : { startTime, endTime }),
        reason: reason || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add extra hours"
      description="Time you can teach on one date, on top of your normal week."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add Hours'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Date" htmlFor="extra-date" required error={error}>
          <Input id="extra-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="flex items-center gap-3">
          <Toggle checked={allDay} onChange={setAllDay} label="All day" />
          <span className="text-sm text-ink">All day</span>
        </div>

        {!allDay ? (
          <div className="flex items-end gap-2">
            <Field label="From">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>
        ) : null}

        <Field label="Note" htmlFor="extra-reason" hint="Optional.">
          <Input
            id="extra-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Covering for a colleague"
          />
        </Field>
      </div>
    </Modal>
  );
}

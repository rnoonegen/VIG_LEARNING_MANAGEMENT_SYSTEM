import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Trash2 } from 'lucide-react';
import type { TeacherDto } from '@vig/shared';
import { formatShortDate, formatTime12h } from '@vig/shared';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { useAuth } from '@/app/AuthProvider';
import { PageHeader, Section } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Toggle } from '@/components/ui/Field';
import {
  AvailabilityGrid,
  availabilityProblems,
  fromDayRows,
  toDayRows,
  type DayAvailability,
} from '@/components/AvailabilityGrid';

/**
 * A teacher states their own week (F5).
 *
 * Nobody else can: the admin reads this and schedules inside it, but the hours
 * a teacher is willing to work are theirs to give. A day holds as many windows
 * as they actually have — Monday 9–11 and 12–1 is two, and nothing may be
 * scheduled in the gap.
 */
export function TeacherAvailabilityPage() {
  const { user } = useAuth();
  const teacherId = user?.teacherId ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', teacherId],
    queryFn: () => get<TeacherDto>(`/teachers/${teacherId}`),
    enabled: Boolean(teacherId),
  });

  if (!teacherId) {
    return (
      <div>
        <PageHeader title="My availability" />
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
        title="My availability"
        description="When you can teach. Your administrator schedules classes inside these hours and cannot change them for you."
      />

      <WeeklyPattern teacher={data} />
      <Exceptions teacher={data} />
    </div>
  );
}

function WeeklyPattern({ teacher }: { teacher: TeacherDto }) {
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
        <p className="mb-4 text-sm text-ink-2">
          This is your normal repeating week. It is a boundary on when classes may be scheduled — not
          the timetable itself. Add as many times a day as you need.
        </p>

        <AvailabilityGrid
          rows={rows}
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
 * A dated exception overrides the week on one date only (BR-06). It is how a
 * teacher says "not this Thursday" without rewriting every Thursday.
 */
function Exceptions({ teacher }: { teacher: TeacherDto }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => del(`/teachers/exceptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <Section
      title="One-off changes"
      action={
        <Button
          variant="secondary"
          size="sm"
          icon={<CalendarPlus size={14} />}
          onClick={() => setAdding(true)}
        >
          Add Exception
        </Button>
      }
    >
      <Card>
        <p className="mb-3 text-sm text-ink-2">
          A single date that differs from your normal week — a day off, or extra hours you can offer.
          Your future weeks stay unchanged.
        </p>

        {teacher.exceptions.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing booked. Your normal week applies.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teacher.exceptions.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{formatShortDate(new Date(e.date))}</p>
                  <p className="text-xs text-ink-2">
                    {e.isAvailable ? 'Extra availability' : 'Unavailable'}
                    {e.allDay ? ' · All day' : ` · ${formatTime12h(e.startTime!)}–${formatTime12h(e.endTime!)}`}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(e.id)}
                  aria-label="Remove exception"
                  className="touch-target flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding ? <ExceptionModal teacherId={teacher.id} onClose={() => setAdding(false)} /> : null}
    </Section>
  );
}

function ExceptionModal({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isAvailable, setIsAvailable] = useState(false);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      post(`/teachers/${teacherId}/exceptions`, {
        date,
        isAvailable,
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
      title="Add a one-off change"
      description="A temporary change to your availability on one date."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save Exception'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Date" htmlFor="my-exception-date" required error={error}>
          <Input id="my-exception-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="On this date I am" htmlFor="my-exception-status">
          <Select
            id="my-exception-status"
            value={isAvailable ? 'available' : 'unavailable'}
            onChange={(e) => setIsAvailable(e.target.value === 'available')}
          >
            <option value="unavailable">Unavailable</option>
            <option value="available">Available (extra hours)</option>
          </Select>
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

        <Field label="Reason" htmlFor="my-exception-reason" hint="Optional.">
          <Input
            id="my-exception-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Personal appointment"
          />
        </Field>

        <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          Classes already scheduled on this date are not cancelled. Your administrator sees them as an
          issue to resolve.
        </p>
      </div>
    </Modal>
  );
}

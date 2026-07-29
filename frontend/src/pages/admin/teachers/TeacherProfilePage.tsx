import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Plus, Trash2 } from 'lucide-react';
import type { SubjectDto, TeacherDto } from '@vig/shared';
import { formatShortDate, formatTime12h } from '@vig/shared';
import { del, errorMessage, get, post, put } from '@/lib/api';
import { Avatar, DetailRow, PageHeader, Section, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Toggle } from '@/components/ui/Field';
import { Pill, SubjectBadge } from '@/components/ui/Chip';
import { AvailabilityGrid, fromDayRows, toDayRows, type DayAvailability } from '@/components/AvailabilityGrid';

type Tab = 'overview' | 'teaching' | 'availability';

/**
 * A teacher's profile answers two questions the scheduler needs: what can they
 * teach, and when. Both feed straight into schedule validation (Flow 10).
 */
export function TeacherProfilePage() {
  const { teacherId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', teacherId],
    queryFn: () => get<TeacherDto>(`/teachers/${teacherId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader backTo="/admin/teachers" backLabel="Back to Teachers" title={data.fullName} />

      <div className="mb-6 flex items-center gap-3">
        <Avatar name={data.fullName} size={56} />
        <div>
          <p className="text-sm font-medium text-ink">{data.fullName}</p>
          <p className="text-xs text-ink-2">@{data.username}</p>
        </div>
        <Pill token={data.status === 'ACTIVE' ? 'green' : 'muted'}>{data.status.toLowerCase()}</Pill>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'teaching', label: 'Teaching', count: data.capabilities.length },
          { key: 'availability', label: 'Availability', count: data.availability.length },
        ]}
      />

      {tab === 'overview' ? <Overview teacher={data} /> : null}
      {tab === 'teaching' ? <Capabilities teacher={data} /> : null}
      {tab === 'availability' ? <Availability teacher={data} /> : null}
    </div>
  );
}

function Overview({ teacher }: { teacher: TeacherDto }) {
  const upcoming = teacher.exceptions.filter((e) => new Date(e.date) >= new Date()).slice(0, 5);

  return (
    <>
      <Section title="Teaching">
        <Card>
          {teacher.capabilities.length === 0 ? (
            <p className="text-sm text-ink-2">No subjects assigned yet.</p>
          ) : (
            <dl>
              {teacher.capabilities.map((c) => (
                <DetailRow
                  key={c.id}
                  label={c.subjectName}
                  value={
                    c.minLevelName === c.maxLevelName
                      ? c.minLevelName
                      : `${c.minLevelName} – ${c.maxLevelName}`
                  }
                />
              ))}
            </dl>
          )}
        </Card>
      </Section>

      <Section title="Upcoming exceptions">
        <Card>
          {upcoming.length === 0 ? (
            <p className="text-sm text-ink-2">
              No temporary changes. Their normal weekly availability applies.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{formatShortDate(new Date(e.date))}</span>
                  <Pill token={e.isAvailable ? 'green' : 'red'}>
                    {e.isAvailable ? 'Extra available' : 'Unavailable'}
                    {!e.allDay && e.startTime ? ` · ${formatTime12h(e.startTime)}–${formatTime12h(e.endTime!)}` : ''}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}

/** Capability is a hard scheduling constraint, not a note. */
function Capabilities({ teacher }: { teacher: TeacherDto }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(
    teacher.capabilities.map((c) => ({
      subjectId: c.subjectId,
      minLevelOrder: c.minLevelOrder,
      maxLevelOrder: c.maxLevelOrder,
      isPrimary: c.isPrimary,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: subjects } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });

  const save = useMutation({
    mutationFn: () => put(`/teachers/${teacher.id}/capabilities`, { capabilities: rows }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const addRow = () => {
    const firstUnused = subjects?.find((s) => !rows.some((r) => r.subjectId === s.id));
    if (!firstUnused) return;
    setRows([...rows, { subjectId: firstUnused.id, minLevelOrder: 0, maxLevelOrder: 0, isPrimary: rows.length === 0 }]);
  };

  return (
    <Card>
      <CardHeader
        title="Teaching capabilities"
        description="The subjects and level ranges this teacher can teach. Scheduling only ever offers them classes inside these bounds."
      />

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <CapabilityRow
            key={index}
            row={row}
            subjects={subjects ?? []}
            onChange={(next) => setRows(rows.map((r, i) => (i === index ? next : r)))}
            onRemove={() => setRows(rows.filter((_, i) => i !== index))}
          />
        ))}

        {rows.length === 0 ? (
          <p className="rounded-[12px] bg-lavender-2 px-4 py-3 text-sm text-ink-2">
            No subjects yet. Until a capability is added, this teacher will not appear as an option when
            scheduling.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addRow}>
          Add subject
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          icon={saved ? <Check size={14} /> : undefined}
        >
          {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    </Card>
  );
}

function CapabilityRow({
  row,
  subjects,
  onChange,
  onRemove,
}: {
  row: { subjectId: string; minLevelOrder: number; maxLevelOrder: number; isPrimary: boolean };
  subjects: SubjectDto[];
  onChange: (next: typeof row) => void;
  onRemove: () => void;
}) {
  const { data: subject } = useQuery({
    queryKey: ['curriculum', 'subject', row.subjectId],
    queryFn: () => get<SubjectDto>(`/curriculum/subjects/${row.subjectId}`),
    enabled: Boolean(row.subjectId),
  });

  const levels = subject?.levels ?? [];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[12px] border border-line p-3">
      <div className="min-w-[150px] flex-1">
        <Field label="Subject">
          <Select value={row.subjectId} onChange={(e) => onChange({ ...row, subjectId: e.target.value })}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="min-w-[120px]">
        <Field label="From level">
          <Select
            value={String(row.minLevelOrder)}
            onChange={(e) => onChange({ ...row, minLevelOrder: Number(e.target.value) })}
          >
            {levels.map((l) => (
              <option key={l.id} value={l.displayOrder}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="min-w-[120px]">
        <Field label="To level">
          <Select
            value={String(row.maxLevelOrder)}
            onChange={(e) => onChange({ ...row, maxLevelOrder: Number(e.target.value) })}
          >
            {levels.map((l) => (
              <option key={l.id} value={l.displayOrder}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex items-center gap-2 pb-2">
        <Toggle
          checked={row.isPrimary}
          onChange={(next) => onChange({ ...row, isPrimary: next })}
          label="Primary subject"
        />
        <span className="text-xs text-ink-2">Primary</span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove subject"
        className="touch-target mb-1 flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function Availability({ teacher }: { teacher: TeacherDto }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DayAvailability[]>(toDayRows(teacher.availability));
  const [addingException, setAddingException] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setRows(toDayRows(teacher.availability)), [teacher.availability]);

  const save = useMutation({
    mutationFn: () => put(`/teachers/${teacher.id}/availability`, { slots: fromDayRows(rows) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setSaved(true);
    },
  });

  const removeException = useMutation({
    mutationFn: (id: string) => del(`/teachers/exceptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <>
      <Section title="Regular weekly availability">
        <Card>
          <p className="mb-4 text-sm text-ink-2">
            This is the teacher's normal repeating week. It is a constraint on when classes may be
            scheduled — not the timetable itself.
          </p>

          <AvailabilityGrid rows={rows} onChange={(next) => { setRows(next); setSaved(false); }} />

          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              icon={saved ? <Check size={14} /> : undefined}
            >
              {save.isPending ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
            </Button>
          </div>
        </Card>
      </Section>

      <Section
        title="Temporary exceptions"
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<CalendarPlus size={14} />}
            onClick={() => setAddingException(true)}
          >
            Add Exception
          </Button>
        }
      >
        <Card>
          <p className="mb-3 text-sm text-ink-2">
            An exception overrides the weekly pattern on one date only. Their normal future weeks stay
            unchanged.
          </p>

          {teacher.exceptions.length === 0 ? (
            <p className="text-sm text-ink-3">No exceptions.</p>
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
                    onClick={() => removeException.mutate(e.id)}
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
      </Section>

      {addingException ? (
        <ExceptionModal teacherId={teacher.id} onClose={() => setAddingException(false)} />
      ) : null}
    </>
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
      title="Add exception"
      description="A temporary change to this teacher's availability on one date."
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
        <Field label="Date" htmlFor="exception-date" required error={error}>
          <Input id="exception-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Status">
          <Select
            value={isAvailable ? 'available' : 'unavailable'}
            onChange={(e) => setIsAvailable(e.target.value === 'available')}
          >
            <option value="unavailable">Unavailable</option>
            <option value="available">Available (extra)</option>
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

        <Field label="Reason" htmlFor="exception-reason" hint="Optional.">
          <Input
            id="exception-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Personal appointment"
          />
        </Field>

        <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          Classes already scheduled on this date will appear on Admin Home as a single issue to resolve.
        </p>
      </div>
    </Modal>
  );
}

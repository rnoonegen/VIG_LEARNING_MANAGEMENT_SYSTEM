import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Camera, Check, Pencil, Plus, Trash2, UserCheck, UserMinus } from 'lucide-react';
import type {
  SubjectDto,
  TeacherDto,
  TeacherMonthDto,
  TeacherStatusResultDto,
  TeacherWeekDto,
} from '@vig/shared';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, formatShortDate, formatTime12h } from '@vig/shared';
import { del, errorMessage, get, patch, post, put } from '@/lib/api';
import { Avatar, DetailRow, PageHeader, Section, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea, Toggle } from '@/components/ui/Field';
import { Pill, SubjectBadge } from '@/components/ui/Chip';
import { AvailabilitySummary } from '@/components/AvailabilityGrid';
import { LeaveList, MonthPicker, TeacherMonthPanel } from '@/components/TeacherMonth';
import { TeacherWeekPanel, WeekPicker, thisWeekStart } from '@/components/TeacherWeek';
import { TempPasswordModal } from './TeachersPage';

type Tab = 'overview' | 'teaching' | 'availability' | 'attendance';

/**
 * A teacher's profile answers two questions the scheduler needs: what can they
 * teach, and when. Both feed straight into schedule validation (Flow 10).
 */
export function TeacherProfilePage() {
  const { teacherId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', teacherId],
    queryFn: () => get<TeacherDto>(`/teachers/${teacherId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const active = data.status === 'ACTIVE';

  return (
    <div>
      <PageHeader backTo="/admin/teachers" backLabel="Back to Teachers" title={data.fullName} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarEditor teacher={data} onError={setPhotoError} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">{data.fullName}</p>
            <p className="text-xs text-ink-2">@{data.username}</p>
            <div className="mt-2">
              <Pill token={active ? 'green' : 'muted'}>{active ? 'Active' : 'Inactive'}</Pill>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={13} />}
            onClick={() => setEditing(true)}
          >
            Edit details
          </Button>
        </div>

        {photoError ? <p className="mt-3 text-xs text-danger">{photoError}</p> : null}

        {!active ? (
          <p className="mt-4 rounded-[12px] bg-lavender-2 px-4 py-3 text-xs text-ink-2">
            This teacher cannot sign in and will not be offered new classes. Everything they recorded —
            class notes, learning updates and observations — is kept.
          </p>
        ) : null}
      </Card>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'teaching', label: 'Teaching', count: data.capabilities.length },
          { key: 'availability', label: 'Availability', count: data.availability.length },
          { key: 'attendance', label: 'Attendance' },
        ]}
      />

      {tab === 'overview' ? <Overview teacher={data} /> : null}
      {tab === 'teaching' ? <Capabilities teacher={data} /> : null}
      {tab === 'availability' ? <Availability teacher={data} /> : null}
      {tab === 'attendance' ? <Attendance teacher={data} /> : null}

      {editing ? <EditTeacherModal teacher={data} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

interface UploadTarget {
  path: string;
  uploadUrl: string;
  token: string;
}

/**
 * The photo goes straight from here to the private avatars bucket; the API only
 * ever handles the resulting path (AD-04). Reads come back as signed URLs.
 */
function AvatarEditor({
  teacher,
  onError,
}: {
  teacher: TeacherDto;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['teachers'] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const target = await post<UploadTarget>(`/teachers/${teacher.id}/avatar-upload-url`, {
        fileName: file.name,
        mimeType: file.type,
      });

      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error('The photo did not finish uploading. Please try again.');

      return put(`/teachers/${teacher.id}/avatar`, { storagePath: target.path });
    },
    onSuccess: async () => {
      onError(null);
      await refresh();
    },
    onError: (err) => onError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => del(`/teachers/${teacher.id}/avatar`),
    onSuccess: async () => {
      onError(null);
      await refresh();
    },
    onError: (err) => onError(errorMessage(err)),
  });

  const choose = (file: File | null) => {
    if (!file) return;
    // Checked here as well as in the bucket policy, so the answer arrives before
    // the bytes do.
    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      onError('Use a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      onError('That photo is larger than 5 MB. Choose a smaller one.');
      return;
    }
    upload.mutate(file);
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <Avatar name={teacher.fullName} url={teacher.avatarUrl} size={64} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label={teacher.avatarUrl ? 'Change photo' : 'Add photo'}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-violet transition-colors hover:bg-lavender disabled:text-ink-3"
        >
          <Camera size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            choose(e.target.files?.[0] ?? null);
            // Reset, so choosing the same file twice still fires a change.
            e.target.value = '';
          }}
        />
      </div>

      {upload.isPending ? (
        <span className="text-[11px] text-ink-2">Uploading…</span>
      ) : teacher.avatarUrl ? (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={busy}
          className="text-[11px] text-ink-2 underline hover:text-danger disabled:text-ink-3"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

/**
 * Their details and their username. The username is how they sign in, so
 * changing it changes their login — the form says so rather than letting them
 * find out.
 */
function EditTeacherModal({ teacher, onClose }: { teacher: TeacherDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(teacher.firstName ?? '');
  const [lastName, setLastName] = useState(teacher.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(teacher.dateOfBirth ?? '');
  const [address, setAddress] = useState(teacher.address ?? '');
  const [username, setUsername] = useState(teacher.username);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      patch(`/teachers/${teacher.id}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        address: address.trim(),
        ...(username.trim() !== teacher.username ? { username: username.trim() } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const changed =
    firstName.trim() !== (teacher.firstName ?? '') ||
    lastName.trim() !== (teacher.lastName ?? '') ||
    dateOfBirth !== (teacher.dateOfBirth ?? '') ||
    address.trim() !== (teacher.address ?? '') ||
    username.trim() !== teacher.username;

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit details"
      description="Their name as it appears across VIG, their contact details, and the username they sign in with."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !firstName.trim() || !lastName.trim() || !username.trim() || !changed || save.isPending
            }
          >
            {save.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="teacher-first-name-edit" required>
            <Input
              id="teacher-first-name-edit"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Last name" htmlFor="teacher-last-name-edit" required>
            <Input
              id="teacher-last-name-edit"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Date of birth" htmlFor="teacher-dob-edit" hint="Optional.">
          <Input
            id="teacher-dob-edit"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </Field>

        <Field label="Address" htmlFor="teacher-address-edit" hint="Optional.">
          <Textarea
            id="teacher-address-edit"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>

        <Field
          label="Username"
          htmlFor="teacher-username-edit"
          required
          error={error}
          hint="Lowercase letters, numbers, dot, underscore and hyphen only."
        >
          <Input
            id="teacher-username-edit"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        {username.trim() !== teacher.username ? (
          <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
            They sign in with this username. Tell them the new one — their password does not change.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function Overview({ teacher }: { teacher: TeacherDto }) {
  const upcoming = teacher.exceptions.filter((e) => new Date(e.date) >= new Date()).slice(0, 5);

  return (
    <>
      <Section title="Details">
        <Card>
          <dl>
            <DetailRow label="Name" value={teacher.fullName} />
            <DetailRow
              label="Date of birth"
              value={teacher.dateOfBirth ? formatShortDate(new Date(teacher.dateOfBirth)) : '—'}
            />
            <DetailRow label="Address" value={teacher.address ?? '—'} />
          </dl>
        </Card>
      </Section>

      <Account teacher={teacher} />

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

/**
 * A teacher is never deleted (BR-09). Deactivating ends their access; the work
 * they recorded about a child stays, because that history is the child's, not
 * theirs.
 */
function Account({ teacher }: { teacher: TeacherDto }) {
  const [confirming, setConfirming] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; tempPassword: string } | null>(null);
  const active = teacher.status === 'ACTIVE';

  return (
    <Section title="Account">
      <Card>
        <dl>
          <DetailRow label="Username" value={`@${teacher.username}`} />
          <DetailRow label="Sign-in" value={active ? 'Enabled' : 'Removed'} />
          <DetailRow label="Upcoming classes" value={teacher.upcomingClassCount} />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {active ? (
            <Button
              variant="danger"
              size="sm"
              icon={<UserMinus size={13} />}
              onClick={() => setConfirming(true)}
            >
              Deactivate Teacher
            </Button>
          ) : (
            <Button size="sm" icon={<UserCheck size={13} />} onClick={() => setConfirming(true)}>
              Reactivate Teacher
            </Button>
          )}

          <p className="max-w-md text-xs text-ink-2">
            {active
              ? 'Removes their sign-in and stops them being scheduled. Their class records, learning updates and observations stay.'
              : 'Restores access with a new temporary password, and lets them be scheduled again.'}
          </p>
        </div>
      </Card>

      {confirming ? (
        <StatusModal
          teacher={teacher}
          next={active ? 'INACTIVE' : 'ACTIVE'}
          onClose={() => setConfirming(false)}
          onDone={(issued) => {
            setConfirming(false);
            if (issued) setCredentials(issued);
          }}
        />
      ) : null}

      {credentials ? (
        <TempPasswordModal
          created={credentials}
          title="Access restored"
          onClose={() => setCredentials(null)}
        />
      ) : null}
    </Section>
  );
}

function StatusModal({
  teacher,
  next,
  onClose,
  onDone,
}: {
  teacher: TeacherDto;
  next: 'ACTIVE' | 'INACTIVE';
  onClose: () => void;
  onDone: (credentials: { username: string; tempPassword: string } | null) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const deactivating = next === 'INACTIVE';

  const change = useMutation({
    mutationFn: () => patch<TeacherStatusResultDto>(`/teachers/${teacher.id}/status`, { status: next }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      onDone(result.credentials);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={deactivating ? `Deactivate ${teacher.fullName}?` : `Reactivate ${teacher.fullName}?`}
      description={
        deactivating
          ? 'They lose access straight away. Nothing they recorded is deleted.'
          : 'They can sign in and teach again once you pass on the new password.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={change.isPending}>
            Cancel
          </Button>
          <Button
            variant={deactivating ? 'danger' : 'primary'}
            onClick={() => change.mutate()}
            disabled={change.isPending}
          >
            {change.isPending
              ? deactivating
                ? 'Deactivating…'
                : 'Reactivating…'
              : deactivating
                ? 'Deactivate'
                : 'Reactivate'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        {deactivating ? (
          <>
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>Their username and password stop working immediately.</li>
              <li>They will not be offered as a teacher when scheduling new classes.</li>
              <li>
                Everything they recorded stays: class records, student learning updates, development
                observations and moments.
              </li>
            </ul>

            {teacher.upcomingClassCount > 0 ? (
              <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
                {teacher.upcomingClassCount} upcoming{' '}
                {teacher.upcomingClassCount === 1 ? 'class is' : 'classes are'} still assigned to them.
                Those stay on the schedule — reassign or cancel them from Schedule.
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
            Deactivating removed their password, so a new temporary one is created now. It is shown once —
            pass it to them directly.
          </p>
        )}

        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </Modal>
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

/**
 * What the teacher said about their own week — read-only here (F5).
 *
 * The hours a teacher is willing to work are theirs to state, so this reports
 * them rather than offering a second way to set them. The admin's job is to
 * schedule inside them.
 */
function Availability({ teacher }: { teacher: TeacherDto }) {
  const queryClient = useQueryClient();
  const [addingException, setAddingException] = useState(false);
  const [weekStart, setWeekStart] = useState(thisWeekStart);

  const { data: week } = useQuery({
    queryKey: ['teachers', teacher.id, 'week', weekStart],
    queryFn: () => get<TeacherWeekDto>(`/teachers/${teacher.id}/week`, { week: weekStart }),
  });

  const removeException = useMutation({
    mutationFn: (id: string) => del(`/teachers/exceptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <>
      {/* The dated week first: scheduling happens against real dates, and this is
          where approved leave and one-off exceptions actually show up. */}
      <Section
        title="This week"
        action={
          <WeekPicker
            weekStart={weekStart}
            onChange={setWeekStart}
            isCurrentWeek={week?.isCurrentWeek ?? false}
          />
        }
      >
        {week ? (
          <TeacherWeekPanel week={week}>
            <p className="text-xs text-ink-2">
              What {teacher.fullName.split(' ')[0]} can actually teach on each date — their regular
              week, less approved leave, plus any extra hours they offered. Leave still awaiting your
              decision is marked but has not changed anything yet.
            </p>
          </TeacherWeekPanel>
        ) : (
          <LoadingState rows={2} />
        )}
      </Section>

      <Section title="Regular weekly availability">
        <Card>
          <p className="mb-4 text-sm text-ink-2">
            {teacher.fullName.split(' ')[0]} sets this from their own Availability page. It is a
            constraint on when classes may be scheduled — not the timetable itself.
          </p>

          {teacher.availability.length === 0 ? (
            <p className="rounded-[12px] bg-warning-bg px-4 py-3 text-sm text-ink-2">
              No hours stated yet, so no class can be scheduled for this teacher. Ask them to fill in
              their week from <span className="font-medium">Availability</span> after they sign in.
            </p>
          ) : (
            <AvailabilitySummary slots={teacher.availability} />
          )}
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

/**
 * One teacher's month: what they taught, and what they were away for.
 *
 * Every figure is derived from the calendar and their answered leave (AD-06), so
 * there is no register to keep and nothing here can disagree with the schedule.
 * Leave is reviewed on the Attendance page, where the whole queue is; this tab
 * reports rather than duplicating that.
 */
function Attendance({ teacher }: { teacher: TeacherDto }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['teachers', teacher.id, 'attendance', month],
    queryFn: () => get<TeacherMonthDto>(`/teachers/${teacher.id}/attendance`, { month }),
  });

  return (
    <Section
      title={`${teacher.fullName.split(' ')[0]}'s month`}
      action={<MonthPicker value={month} onChange={setMonth} />}
    >
      {isLoading ? (
        <LoadingState rows={3} />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <TeacherMonthPanel month={data}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-2">
            Leave this month
          </p>
          <LeaveList requests={data.leave} emptyText="No leave in this month." />
        </TeacherMonthPanel>
      )}
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

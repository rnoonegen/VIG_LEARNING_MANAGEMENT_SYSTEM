import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Settings2, UserPlus } from 'lucide-react';
import type {
  JoinableClassDto,
  StudentDto,
  StudentStatus,
  StudentTeachingDto,
  SubjectDto,
} from '@vig/shared';
import { formatShortDate, formatTime12h, SCHOOL_TIMEZONE, WEEKDAY_SHORT } from '@vig/shared';
import { del, errorMessage, get, patch, post, put } from '@/lib/api';
import { Avatar, DetailRow, PageHeader, Section, Tabs } from '@/components/ui/Layout';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Pill, SubjectBadge } from '@/components/ui/Chip';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { LearningMap } from '@/components/LearningMap';
import { DevelopmentPanel } from '@/components/DevelopmentPanel';
import { MomentsGrid } from '@/components/MomentsGrid';
import { AvailabilityGrid, fromDayRows, toDayRows, type DayAvailability } from '@/components/AvailabilityGrid';
import { SubjectLevelEditor, type SubjectLevelDraft } from '@/components/SubjectLevelEditor';
import { TempPasswordModal } from '../admin/teachers/TeachersPage';

type Tab = 'overview' | 'classes' | 'learning' | 'development' | 'moments' | 'history';

/** Credentials are returned once, by whichever action created or reset them. */
type Credentials = { username: string; tempPassword: string };

/**
 * The long-term record for one child.
 *
 * Viewing and editing are kept apart: administrative controls live behind
 * Manage Student so the profile reads as a record, not a form (Flow 09).
 */
export function StudentProfilePage({ basePath, canManage }: { basePath: string; canManage?: boolean }) {
  const { studentId = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [managing, setManaging] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => get<StudentDto>(`/students/${studentId}`),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        backTo={basePath}
        backLabel="Back to Students"
        title={data.fullName}
        action={
          canManage ? (
            <Button variant="secondary" icon={<Settings2 size={15} />} onClick={() => setManaging(true)}>
              Manage Student
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Avatar name={data.fullName} url={data.avatarUrl} size={56} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{data.fullName}</p>
          <p className="text-xs text-ink-2">
            {[data.gradeLabel, data.dateOfBirth ? `Born ${formatShortDate(new Date(data.dateOfBirth))}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Pill token={data.status === 'ACTIVE' ? 'green' : 'muted'}>{data.status.toLowerCase()}</Pill>
        {!data.setupComplete ? <Pill token="orange">Setup incomplete</Pill> : null}
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'classes', label: 'Classes' },
          { key: 'learning', label: 'Learning' },
          { key: 'development', label: 'Development' },
          { key: 'moments', label: 'Moments' },
          { key: 'history', label: 'History' },
        ]}
      />

      {tab === 'overview' ? <Overview student={data} canManage={canManage} /> : null}
      {tab === 'classes' ? <Teaching student={data} canManage={canManage} /> : null}
      {tab === 'learning' ? (
        <LearningMap studentId={studentId} editable canChangeLevel={canManage} />
      ) : null}
      {tab === 'development' ? <DevelopmentPanel studentId={studentId} editable /> : null}
      {tab === 'moments' ? <MomentsGrid endpoint={`/students/${studentId}/moments`} /> : null}
      {tab === 'history' ? <History studentId={studentId} /> : null}

      {managing ? (
        <ManageStudentModal
          student={data}
          onClose={() => setManaging(false)}
          onCredentials={setCredentials}
        />
      ) : null}

      {credentials ? (
        <TempPasswordModal
          created={credentials}
          title="Parent account"
          onClose={() => setCredentials(null)}
        />
      ) : null}
    </div>
  );
}

function Overview({ student, canManage }: { student: StudentDto; canManage?: boolean }) {
  return (
    <>
      <Section title="Subject levels">
        <Card>
          {student.subjectLevels.length === 0 ? (
            <p className="text-sm text-warning">
              No subjects assigned yet. This student cannot be scheduled until they have at least one.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {student.subjectLevels.map((sl) => (
                <div key={sl.subjectId} className="flex items-center justify-between gap-3">
                  <SubjectBadge name={sl.subjectName} colorToken={sl.colorToken} />
                  <span className="text-sm font-medium text-ink">{sl.levelName}</span>
                </div>
              ))}
            </div>
          )}

          {canManage ? (
            <p className="mt-4 text-xs text-ink-2">
              A subject added to the curriculum later can be assigned here from Manage Student → Subjects.
            </p>
          ) : null}
        </Card>
      </Section>

      <Section title="Weekly availability">
        <Card>
          {student.availability.length === 0 ? (
            <p className="text-sm text-warning">No availability set. Scheduling has nothing to work with.</p>
          ) : (
            <dl>
              {student.availability.map((slot) => (
                <DetailRow
                  key={slot.id}
                  label={WEEKDAY_SHORT[slot.weekday]!}
                  value={`${slot.startTime} – ${slot.endTime}`}
                />
              ))}
            </dl>
          )}
        </Card>
      </Section>

      <Section title="Parent access">
        <Card>
          {student.parents.length === 0 ? (
            <p className="text-sm text-ink-2">No parent account linked yet.</p>
          ) : (
            <dl>
              {student.parents.map((p) => (
                <DetailRow
                  key={p.parentId}
                  label={p.relationship ?? 'Parent'}
                  value={
                    <>
                      {p.fullName}
                      {canManage ? <span className="ml-2 text-xs text-ink-2">@{p.username}</span> : null}
                    </>
                  }
                />
              ))}
            </dl>
          )}
        </Card>
      </Section>
    </>
  );
}

/**
 * Who teaches this child.
 *
 * Assigning a subject and putting a child in front of a teacher are two separate
 * acts, and the second one is the step that is easy to forget: until a class
 * exists, the teacher never sees them, no attendance is taken and nothing reaches
 * the parent. So an unassigned subject is shown as an open item with the classes
 * that already run for it, not as an absence.
 */
function Teaching({ student, canManage }: { student: StudentDto; canManage?: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<JoinableClassDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['students', student.id, 'classes'],
    queryFn: () => get<StudentTeachingDto>(`/students/${student.id}/classes`),
  });

  const join = useMutation({
    mutationFn: ({ classId, acceptWarnings }: { classId: string; acceptWarnings: boolean }) =>
      post(`/classes/${classId}/students`, { studentIds: [student.id], acceptWarnings }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      await queryClient.invalidateQueries({ queryKey: ['attention'] });
      setConfirming(null);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const leave = useMutation({
    mutationFn: (classId: string) => del(`/classes/${classId}/students/${student.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['schedule'] });
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;

  return (
    <>
      <Section title="Teachers & classes">
        <Card>
          {data.classes.length === 0 ? (
            <p className="text-sm text-warning">
              No classes yet. Until this child is in a class, no teacher sees them, no attendance is
              taken and nothing reaches their parent.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.classes.map((c) => (
                <li
                  key={c.classId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <SubjectBadge name={c.subjectName} colorToken={c.colorToken} sublabel={c.levelName} />
                    <p className="mt-1 text-xs text-ink-2">
                      {c.teacherName} · {c.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(', ')} ·{' '}
                      {formatTime12h(c.startTime)} · {c.durationMinutes} min
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {c.nextOccurrence
                        ? `Next on ${formatShortDate(new Date(c.nextOccurrence))}`
                        : 'No upcoming classes scheduled'}
                      {` · ${c.studentCount} in the class`}
                    </p>
                  </div>

                  {canManage ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => leave.mutate(c.classId)}
                      disabled={leave.isPending}
                    >
                      Remove from class
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {data.unassigned.length > 0 ? (
        <Section title="Subjects with no teacher yet">
          <div className="flex flex-col gap-3">
            {data.unassigned.map((gap) => (
              <Card key={gap.subjectId} tone="warning">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SubjectBadge name={gap.subjectName} colorToken={gap.colorToken} sublabel={gap.levelName} />
                    <p className="mt-1 text-xs text-ink-2">
                      Assigned to this child, but nobody is teaching it yet.
                    </p>
                  </div>
                  {canManage ? (
                    <ButtonLink to="/admin/schedule/new" variant="secondary" size="sm">
                      Schedule a new class
                    </ButtonLink>
                  ) : null}
                </div>

                {canManage && gap.joinable.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">
                      Existing classes for {gap.levelName}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {gap.joinable.map((c) => (
                        <li
                          key={c.classId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-card px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{c.teacherName}</p>
                            <p className="text-xs text-ink-2">
                              {c.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(', ')} ·{' '}
                              {formatTime12h(c.startTime)} · {c.studentCount} already in it
                            </p>
                            {c.blockers.length > 0 ? (
                              <p className="mt-1 text-xs text-danger">{c.blockers.join(' ')}</p>
                            ) : c.warnings.length > 0 ? (
                              <p className="mt-1 text-xs text-warning">{c.warnings.join(' ')}</p>
                            ) : null}
                          </div>

                          <Button
                            size="sm"
                            icon={<UserPlus size={13} />}
                            disabled={c.blockers.length > 0 || join.isPending}
                            onClick={() =>
                              c.warnings.length > 0
                                ? setConfirming(c)
                                : join.mutate({ classId: c.classId, acceptWarnings: false })
                            }
                          >
                            Add to this class
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : canManage ? (
                  <p className="mt-3 text-xs text-ink-2">
                    No class runs for {gap.subjectName} at {gap.levelName} yet — schedule one to assign a
                    teacher.
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {confirming ? (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title="Add anyway?"
          description={`${confirming.teacherName}'s class does not fit this child's stated availability.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => join.mutate({ classId: confirming.classId, acceptWarnings: true })}
                disabled={join.isPending}
              >
                {join.isPending ? 'Adding…' : 'Add to class'}
              </Button>
            </>
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2">
            {confirming.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-2">
            You can add them regardless — Admin Home will keep flagging the mismatch until their
            availability covers the class or the class moves.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

interface HistoryPayload {
  learning: Array<{ id: string; at: string; subjectName: string; skillName: string; newStatus: string; authorName: string }>;
  development: Array<{ id: string; at: string; areaName: string; observation: string; observerName: string }>;
  levelChanges: Array<{ id: string; at: string; subjectName: string; fromLevel: string; toLevel: string | null }>;
  classRecords: Array<{ id: string; at: string; subjectName: string; levelName: string; note: string }>;
}

/** History preserves what changed, when and by whom — never a destructive overwrite. */
function History({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['students', studentId, 'history'],
    queryFn: () => get<HistoryPayload>(`/students/${studentId}/history`),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (!data) return null;

  return (
    <>
      {data.levelChanges.length > 0 ? (
        <Section title="Level changes">
          <Card>
            <ul className="flex flex-col gap-2">
              {data.levelChanges.map((lc) => (
                <li key={lc.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {lc.subjectName}: {lc.fromLevel} → {lc.toLevel ?? 'stayed'}
                  </span>
                  {/* confirmedAt — a real instant, not a scheduled value. */}
                  <span className="shrink-0 text-xs text-ink-3">
                    {formatShortDate(new Date(lc.at), SCHOOL_TIMEZONE)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Recent class notes">
        <Card>
          {data.classRecords.length === 0 ? (
            <p className="text-sm text-ink-2">No saved class records yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.classRecords.map((r) => (
                <li key={r.id} className="border-l-2 border-lavender pl-3">
                  <p className="text-sm text-ink">{r.note}</p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {r.subjectName} · {r.levelName} · {formatShortDate(new Date(r.at), SCHOOL_TIMEZONE)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Section title="Learning updates">
        <Card>
          {data.learning.length === 0 ? (
            <p className="text-sm text-ink-2">No learning updates yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.learning.slice(0, 20).map((l) => (
                <li key={l.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    {l.subjectName} · {l.skillName}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">
                    {l.newStatus.replace('_', ' ').toLowerCase()} ·{' '}
                    {formatShortDate(new Date(l.at), SCHOOL_TIMEZONE)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Manage Student
// ---------------------------------------------------------------------------

type ManageTab = 'details' | 'subjects' | 'availability' | 'parent' | 'status';

/**
 * Configuration lives here, deliberately separate from the read-only profile.
 *
 * Each panel saves on its own rather than behind one global Save: these are four
 * unrelated decisions, and an admin adding a subject should not have to think
 * about what else the form might be about to write.
 */
function ManageStudentModal({
  student,
  onClose,
  onCredentials,
}: {
  student: StudentDto;
  onClose: () => void;
  onCredentials: (credentials: Credentials) => void;
}) {
  const [tab, setTab] = useState<ManageTab>('details');

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Manage student"
      description={student.fullName}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'details', label: 'Details' },
          { key: 'subjects', label: 'Subjects', count: student.subjectLevels.length },
          { key: 'availability', label: 'Availability', count: student.availability.length },
          { key: 'parent', label: 'Parent', count: student.parents.length },
          { key: 'status', label: 'Status' },
        ]}
      />

      {tab === 'details' ? <DetailsPanel student={student} /> : null}
      {tab === 'subjects' ? <SubjectsPanel student={student} /> : null}
      {tab === 'availability' ? <AvailabilityPanel student={student} /> : null}
      {tab === 'parent' ? <ParentPanel student={student} onCredentials={onCredentials} /> : null}
      {tab === 'status' ? <StatusPanel student={student} /> : null}
    </Modal>
  );
}

/** Refreshes both the profile and any list the change is visible in. */
function useStudentRefresh(studentId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['students'] });
    await queryClient.invalidateQueries({ queryKey: ['learning', studentId] });
    await queryClient.invalidateQueries({ queryKey: ['attention'] });
  };
}

function SaveRow({
  onSave,
  pending,
  saved,
  disabled,
  error,
  label = 'Save Changes',
}: {
  onSave: () => void;
  pending: boolean;
  saved: boolean;
  disabled?: boolean;
  error: string | null;
  label?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={onSave} disabled={pending || disabled}>
        {pending ? 'Saving…' : saved ? 'Saved' : label}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

function DetailsPanel({ student }: { student: StudentDto }) {
  const refresh = useStudentRefresh(student.id);
  const [fullName, setFullName] = useState(student.fullName);
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ?? '');
  const [gradeLabel, setGradeLabel] = useState(student.gradeLabel ?? '');
  const [notes, setNotes] = useState(student.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      patch(`/students/${student.id}`, {
        fullName: fullName.trim(),
        // An emptied optional field is a deliberate clear, so it is sent as null
        // rather than dropped from the payload.
        dateOfBirth: dateOfBirth || null,
        gradeLabel: gradeLabel.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      await refresh();
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      <CardHeader title="Basic details" description="Their name, date of birth and grade." />

      <div className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="student-edit-name" required>
          <Input
            id="student-edit-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
            autoFocus
          />
        </Field>

        <Field label="Date of birth" htmlFor="student-edit-dob">
          <Input
            id="student-edit-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => {
              setDateOfBirth(e.target.value);
              setSaved(false);
            }}
          />
        </Field>

        <Field label="Grade" htmlFor="student-edit-grade" hint="Optional.">
          <Input
            id="student-edit-grade"
            value={gradeLabel}
            onChange={(e) => {
              setGradeLabel(e.target.value);
              setSaved(false);
            }}
            placeholder="5th Grade"
          />
        </Field>

        <Field label="Notes" htmlFor="student-edit-notes" hint="Internal only. Parents never see this.">
          <Textarea
            id="student-edit-notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            placeholder="Anything the school should keep in mind."
          />
        </Field>
      </div>

      <SaveRow
        onSave={() => save.mutate()}
        pending={save.isPending}
        saved={saved}
        disabled={!fullName.trim()}
        error={error}
      />
    </>
  );
}

/**
 * Subjects and levels.
 *
 * The curriculum keeps growing, so this is where a subject created after the
 * child was enrolled gets assigned to them (BR-07). Dropping a subject retires the
 * assignment rather than deleting it — the work already recorded against that
 * level stays in the child's history (BR-08).
 */
function SubjectsPanel({ student }: { student: StudentDto }) {
  const refresh = useStudentRefresh(student.id);
  const [rows, setRows] = useState<SubjectLevelDraft[]>(
    student.subjectLevels.map((sl) => ({ subjectId: sl.subjectId, levelId: sl.levelId })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });

  const save = useMutation({
    mutationFn: () => put(`/students/${student.id}/subject-levels`, { subjectLevels: rows }),
    onSuccess: async () => {
      await refresh();
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const removed = student.subjectLevels.filter((sl) => !rows.some((r) => r.subjectId === sl.subjectId));
  const incomplete = rows.some((r) => !r.levelId);

  return (
    <>
      <CardHeader
        title="Subjects & levels"
        description="What this child studies, and where they are in each subject."
      />

      {isLoading ? (
        <LoadingState rows={3} />
      ) : (
        <SubjectLevelEditor
          subjects={subjects ?? []}
          value={rows}
          onChange={(next) => {
            setRows(next);
            setSaved(false);
          }}
        />
      )}

      {removed.length > 0 ? (
        <p className="mt-3 rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          Removing {removed.map((r) => r.subjectName).join(', ')} stops new classes being scheduled for it.
          Everything already recorded stays in this child's history.
        </p>
      ) : null}

      <p className="mt-3 rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
        Adding a subject does not put this child in front of a teacher on its own. Once saved, use the
        Classes tab to add them to a class for it — that is what makes them appear on a teacher's list,
        gives them attendance, and starts the updates their parent sees.
      </p>

      <SaveRow
        onSave={() => save.mutate()}
        pending={save.isPending}
        saved={saved}
        disabled={incomplete}
        error={error ?? (incomplete ? 'Choose a level for every subject.' : null)}
      />
    </>
  );
}

function AvailabilityPanel({ student }: { student: StudentDto }) {
  const refresh = useStudentRefresh(student.id);
  const [rows, setRows] = useState<DayAvailability[]>(toDayRows(student.availability));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => put(`/students/${student.id}/availability`, { slots: fromDayRows(rows) }),
    onSuccess: async () => {
      await refresh();
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      <CardHeader
        title="Weekly availability"
        description="When this child can attend classes. Scheduling treats anything outside these windows as invalid."
      />

      <AvailabilityGrid
        rows={rows}
        onChange={(next) => {
          setRows(next);
          setSaved(false);
        }}
      />

      <SaveRow onSave={() => save.mutate()} pending={save.isPending} saved={saved} error={error} />
    </>
  );
}

interface AccountRow {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'TEACHER' | 'PARENT';
  status: string;
}

/**
 * Parent access.
 *
 * A parent account is created here with its credentials, or an existing one is
 * linked — a second child of the same family reuses the account rather than
 * getting a duplicate login (Q8). Passwords are shown once and never retrievable
 * (AD-09), so resetting is the only recovery.
 */
function ParentPanel({
  student,
  onCredentials,
}: {
  student: StudentDto;
  onCredentials: (credentials: Credentials) => void;
}) {
  const refresh = useStudentRefresh(student.id);
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [parentUserId, setParentUserId] = useState('');
  const [relationship, setRelationship] = useState('Parent');
  const [error, setError] = useState<string | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => get<AccountRow[]>('/admin/users'),
  });

  const linkedUserIds = student.parents.map((p) => p.userId);
  const availableParents = (accounts ?? []).filter(
    (a) => a.role === 'PARENT' && a.status === 'ACTIVE' && !linkedUserIds.includes(a.id),
  );

  const link = useMutation({
    mutationFn: () =>
      put<{ parentTempPassword: string | null }>(`/students/${student.id}/parent-access`, {
        relationship,
        ...(mode === 'create'
          ? { fullName: fullName.trim(), username: username.trim() }
          : { parentUserId }),
      }),
    onSuccess: async (result) => {
      await refresh();
      setError(null);
      setFullName('');
      setUsername('');
      setParentUserId('');
      if (result.parentTempPassword) {
        onCredentials({ username: username.trim(), tempPassword: result.parentTempPassword });
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const reset = useMutation({
    mutationFn: (userId: string) => post<Credentials>(`/admin/users/${userId}/reset-password`),
    onSuccess: (result) => {
      setError(null);
      onCredentials(result);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const canSubmit =
    mode === 'create' ? Boolean(fullName.trim() && username.trim()) : Boolean(parentUserId);

  return (
    <>
      <CardHeader
        title="Parent access"
        description="Who can see this child's approved updates in the Parent Portal."
      />

      {student.parents.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-2">
          {student.parents.map((p) => (
            <li
              key={p.parentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{p.fullName}</p>
                <p className="text-xs text-ink-2">
                  @{p.username}
                  {p.relationship ? ` · ${p.relationship}` : ''}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<KeyRound size={13} />}
                onClick={() => reset.mutate(p.userId)}
                disabled={reset.isPending}
              >
                Reset password
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          No parent account yet. Until one exists, nobody at home can see this child's updates.
        </p>
      )}

      <div className="rounded-[12px] border border-line p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet">Add a parent</p>

        <div className="mb-4 flex gap-2">
          {(['create', 'link'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={mode === option ? 'primary' : 'secondary'}
              onClick={() => {
                setMode(option);
                setError(null);
              }}
            >
              {option === 'create' ? 'New account' : 'Existing account'}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {mode === 'create' ? (
            <>
              <Field label="Parent full name" htmlFor="add-parent-name" required>
                <Input
                  id="add-parent-name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (!username) {
                      setUsername(e.target.value.trim().toLowerCase().split(' ')[0] ?? '');
                    }
                  }}
                  placeholder="Ananya Sharma"
                />
              </Field>

              <Field
                label="Username"
                htmlFor="add-parent-username"
                required
                hint="They receive a temporary password, shown once, to pass on directly."
              >
                <Input
                  id="add-parent-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="ananya"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </>
          ) : (
            <Field
              label="Parent account"
              htmlFor="add-parent-existing"
              required
              hint="Use this for a sibling, so one login covers both children."
            >
              <Select
                id="add-parent-existing"
                value={parentUserId}
                onChange={(e) => setParentUserId(e.target.value)}
              >
                <option value="">Select…</option>
                {availableParents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} (@{a.username})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Relationship" htmlFor="add-parent-relationship">
            <Select
              id="add-parent-relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            >
              <option>Parent</option>
              <option>Mother</option>
              <option>Father</option>
              <option>Guardian</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => link.mutate()}
            disabled={!canSubmit || link.isPending}
          >
            {link.isPending ? 'Saving…' : mode === 'create' ? 'Create & Link' : 'Link Parent'}
          </Button>
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      </div>
    </>
  );
}

const STATUS_COPY: Record<StudentStatus, { label: string; description: string }> = {
  ACTIVE: {
    label: 'Active',
    description: 'Attending classes. Appears everywhere they are expected.',
  },
  INACTIVE: {
    label: 'Inactive',
    description: 'Paused — a break or a term away. Nothing is removed, and they can be set back to active.',
  },
  ARCHIVED: {
    label: 'Archived',
    description: 'Left the school. Removed from lists and scheduling; their whole record is kept (BR-17).',
  },
};

/** A student is never deleted — their record is the school's history of a child. */
function StatusPanel({ student }: { student: StudentDto }) {
  const refresh = useStudentRefresh(student.id);
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (status: StudentStatus) => patch(`/students/${student.id}/status`, { status }),
    onSuccess: async () => {
      await refresh();
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      <CardHeader
        title="Enrolment status"
        description="Nothing here deletes anything. A child's learning history is kept whatever their status."
      />

      <div className="flex flex-col gap-2">
        {(Object.keys(STATUS_COPY) as StudentStatus[]).map((status) => {
          const current = student.status === status;
          return (
            <div
              key={status}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 ${
                current ? 'border-violet bg-lavender' : 'border-line'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{STATUS_COPY[status].label}</p>
                <p className="text-xs text-ink-2">{STATUS_COPY[status].description}</p>
              </div>

              {current ? (
                <Pill token="violet">Current</Pill>
              ) : (
                <Button
                  variant={status === 'ARCHIVED' ? 'danger' : 'secondary'}
                  size="sm"
                  onClick={() => change.mutate(status)}
                  disabled={change.isPending}
                >
                  Set {STATUS_COPY[status].label.toLowerCase()}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
    </>
  );
}

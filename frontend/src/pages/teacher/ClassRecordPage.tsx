import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, Plus, X } from 'lucide-react';
import type { AttendanceStatus, ClassContextDto, SkillStatus } from '@vig/shared';
import {
  ATTENDANCE_META,
  ATTENDANCE_STATUSES,
  COVERED_STATUS,
  formatInstantTime,
  formatShortDate,
  NOT_COVERED_STATUS,
} from '@vig/shared';
import { errorMessage, get, post, put } from '@/lib/api';
import { Avatar } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { AttendanceChip } from '@/components/ui/Chip';
import { CoverageGrid, coverageKey, toTickedSet } from '@/components/CoverageGrid';
import { cn } from '@/lib/ui';

const STEPS = ['Attendance', 'Class Note', 'Coverage', 'Review'] as const;
type Step = (typeof STEPS)[number];

interface LearningDraft {
  studentId: string;
  skillId: string;
  newStatus: SkillStatus;
}

interface DevelopmentDraft {
  studentId: string;
  areaId: string;
  observation: string;
}

/**
 * Only the boxes whose value actually changed become history.
 *
 * The grid opens showing what a child has already been taken through, so most of
 * it is untouched on any given day; writing all of it back would bury the real
 * change under a page of noise.
 */
function coverageDiff(
  before: Set<string>,
  after: Set<string>,
  students: Array<{ id: string }>,
  headings: ClassContextDto['headings'],
): LearningDraft[] {
  const updates: LearningDraft[] = [];

  for (const student of students) {
    for (const heading of headings) {
      for (const sub of heading.subHeadings) {
        const key = coverageKey(student.id, sub.id);
        if (before.has(key) === after.has(key)) continue;
        updates.push({
          studentId: student.id,
          skillId: sub.id,
          newStatus: after.has(key) ? COVERED_STATUS : NOT_COVERED_STATUS,
        });
      }
    }
  }

  return updates;
}

/**
 * The teacher's post-class flow (Flow 07/16).
 *
 * Attendance → Class Note → Optional Updates → Final Review → one atomic save.
 * Learning, development and media updates are all optional; the overall class
 * note never is (BR-02). Nothing is committed to a child's record until Save.
 *
 * TODO(AI-PHASE-2): a RecordSourceStep slot sits between Attendance and Class
 * Note, rendering nothing this week. Phase 2 mounts the recorder and the
 * "Processing your voice note…" screen there, and the typed fields below become
 * the AI's reviewable draft instead of the teacher's blank page.
 * See docs/DEFERRED-AI.md §2.4.
 */
export function ClassRecordPage() {
  const { occurrenceId = '' } = useParams();
  const navigate = useNavigate();

  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>('Attendance');
  const [saved, setSaved] = useState<{ learningUpdates: number; developmentObservations: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [overallClassNote, setOverallClassNote] = useState('');
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [developmentUpdates, setDevelopmentUpdates] = useState<DevelopmentDraft[]>([]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['class-context', occurrenceId],
    queryFn: () => get<ClassContextDto>(`/occurrences/${occurrenceId}/context`),
  });

  // What was already covered before today — both the grid's starting state and
  // the baseline the save diffs against.
  const alreadyCovered = useMemo(() => toTickedSet(data?.covered ?? {}), [data]);
  useEffect(() => setTicked(new Set(alreadyCovered)), [alreadyCovered]);

  const present = useMemo(
    () => (data?.students ?? []).filter((s) => attendance[s.id] !== 'ABSENT'),
    [data, attendance],
  );

  const learningUpdates = useMemo(
    () => coverageDiff(alreadyCovered, ticked, present, data?.headings ?? []),
    [alreadyCovered, ticked, present, data],
  );

  const save = useMutation({
    mutationFn: async () => {
      // Attendance is written first so the server knows who was actually there
      // before it filters observations and updates (BR-15).
      await put(`/occurrences/${occurrenceId}/attendance`, {
        entries: (data?.students ?? []).map((s) => ({
          studentId: s.id,
          status: attendance[s.id] ?? 'PRESENT',
        })),
      });

      const record = await post<{ id: string }>(`/occurrences/${occurrenceId}/record`);

      return post<{ updated: { learningUpdates: number; developmentObservations: number } }>(
        `/class-records/${record.id}/save`,
        {
          overallClassNote,
          studentObservations: Object.entries(observations)
            .filter(([, text]) => text.trim())
            .map(([studentId, observation]) => ({ studentId, observation, isAiGenerated: false })),
          proposedLearningUpdates: learningUpdates,
          proposedDevelopmentObservations: developmentUpdates.filter((d) => d.observation.trim()),
          momentIds: [],
        },
      );
    },
    onSuccess: (result) => setSaved(result.updated),
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <FullScreen><LoadingState rows={5} label="Loading class" /></FullScreen>;
  if (isError || !data) return <FullScreen><ErrorState onRetry={() => void refetch()} /></FullScreen>;

  // --- Saved confirmation ---------------------------------------------------
  if (saved) {
    return (
      <FullScreen>
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check size={30} strokeWidth={3} />
          </div>
          <h2>Class Record Saved</h2>
          <p className="text-sm text-ink-2">
            All updates have been recorded and stored in the right places.
          </p>

          <Card tone="lavender" className="mt-3 w-full text-left">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">
              What happens next
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-ink-2">
              <li>✓ Class note saved to this class's history</li>
              {saved.learningUpdates > 0 ? (
                <li>✓ {saved.learningUpdates} learning update(s) applied to the Learning Map</li>
              ) : null}
              {saved.developmentObservations > 0 ? (
                <li>✓ {saved.developmentObservations} development observation(s) added</li>
              ) : null}
              <li>✓ Parents will see this in their next weekly update</li>
            </ul>
          </Card>

          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/teacher')}>
              Back to Classes
            </Button>
          </div>
        </Card>
      </FullScreen>
    );
  }

  // --- Before class ---------------------------------------------------------
  if (!started) {
    return (
      <FullScreen>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
        >
          <ChevronLeft size={14} />
          Back to Today
        </button>

        <h1 className="mb-1">{data.occurrence.subjectName}</h1>
        <p className="mb-6 text-sm text-ink-2">
          {data.occurrence.levelName} · {formatInstantTime(new Date(data.occurrence.scheduledStart))} –{' '}
          {formatInstantTime(new Date(data.occurrence.scheduledEnd))}
        </p>

        <Card className="mb-4">
          <CardHeader title={`Students (${data.students.length})`} />
          <ul className="flex flex-col gap-2.5">
            {data.students.map((student) => (
              <li key={student.id} className="flex items-center gap-3">
                <Avatar name={student.fullName} url={student.avatarUrl} size={36} />
                <span className="text-sm text-ink">{student.fullName}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Continuity: what was covered last time, without digging through history. */}
        <Card className="mb-6" tone="lavender">
          <CardHeader title="Last class with this group" />
          {data.previousRecord ? (
            <>
              <p className="text-sm text-ink">{data.previousRecord.overallClassNote}</p>
              <p className="mt-2 text-[11px] text-ink-3">
                {formatShortDate(new Date(data.previousRecord.occurrenceDate))}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-2">This is the first recorded class with this group.</p>
          )}
        </Card>

        <Button fullWidth onClick={() => setStarted(true)}>
          Start Class
        </Button>
      </FullScreen>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const canContinue =
    step === 'Attendance'
      ? data.students.every((s) => attendance[s.id])
      : step === 'Class Note'
        ? overallClassNote.trim().length > 0
        : true;

  return (
    <FullScreen>
      <header className="mb-5">
        <button
          type="button"
          onClick={() => (stepIndex === 0 ? setStarted(false) : setStep(STEPS[stepIndex - 1]!))}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-violet hover:underline"
        >
          <ChevronLeft size={14} />
          Back
        </button>

        <h1 className="text-[22px]">{data.occurrence.subjectName}</h1>
        <p className="text-sm text-ink-2">
          {data.occurrence.levelName} · {formatInstantTime(new Date(data.occurrence.scheduledStart))}
        </p>
      </header>

      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold',
                index < stepIndex
                  ? 'bg-success text-white'
                  : index === stepIndex
                    ? 'bg-violet text-white'
                    : 'bg-lavender text-violet',
              )}
            >
              {index < stepIndex ? <Check size={13} strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn('text-[10px] font-medium', index === stepIndex ? 'text-violet' : 'text-ink-3')}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {/* TODO(AI-PHASE-2): RecordSourceStep mounts here — recorder + processing
          screen. Renders nothing this week. See docs/DEFERRED-AI.md §2.4. */}
      <RecordSourceStep />

      {step === 'Attendance' ? (
        <Card>
          <CardHeader
            title="Mark attendance"
            description="Nothing can be recorded about a child who was not there."
          />
          <ul className="flex flex-col gap-2.5">
            {data.students.map((student) => (
              <li
                key={student.id}
                className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line px-3 py-2.5"
              >
                <Avatar name={student.fullName} url={student.avatarUrl} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{student.fullName}</span>

                <div className="flex gap-1.5">
                  {ATTENDANCE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setAttendance({ ...attendance, [student.id]: status })}
                      aria-pressed={attendance[student.id] === status}
                      className={cn(
                        'touch-target flex w-11 items-center justify-center rounded-[10px] border text-xs font-semibold transition-colors',
                        attendance[student.id] === status
                          ? 'border-violet bg-lavender text-violet'
                          : 'border-line bg-card text-ink-3',
                      )}
                    >
                      {ATTENDANCE_META[status].short}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-4 text-xs text-ink-2">
            {ATTENDANCE_STATUSES.map((status) => (
              <span key={status}>
                {ATTENDANCE_META[status].short} · {ATTENDANCE_META[status].label}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {step === 'Class Note' ? (
        <>
          <Card className="mb-4">
            <CardHeader
              title="Overall class note"
              description="What was covered and how the group responded. This is always saved."
            />
            <Textarea
              value={overallClassNote}
              onChange={(e) => setOverallClassNote(e.target.value)}
              placeholder="Worked on adding unlike fractions using visual models, followed by independent practice."
              className="min-h-[120px]"
              autoFocus
            />
          </Card>

          <Card>
            <CardHeader
              title="Student observations"
              description="Optional. One per student who was present."
            />
            <div className="flex flex-col gap-4">
              {present.map((student) => (
                <div key={student.id}>
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <Avatar name={student.fullName} url={student.avatarUrl} size={28} />
                    <span className="text-sm font-medium text-ink">{student.fullName}</span>
                  </div>
                  <Textarea
                    value={observations[student.id] ?? ''}
                    onChange={(e) => setObservations({ ...observations, [student.id]: e.target.value })}
                    placeholder={`How did ${student.fullName.split(' ')[0]} get on?`}
                    className="min-h-[72px]"
                  />
                </div>
              ))}

              {present.length === 0 ? (
                <p className="text-sm text-ink-2">No students were present in this class.</p>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      {step === 'Coverage' ? (
        <OptionalUpdates
          context={data}
          present={present}
          ticked={ticked}
          onToggle={(studentId, skillId) => {
            const key = coverageKey(studentId, skillId);
            const next = new Set(ticked);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setTicked(next);
          }}
          developmentUpdates={developmentUpdates}
          setDevelopmentUpdates={setDevelopmentUpdates}
        />
      ) : null}

      {step === 'Review' ? (
        <Card>
          <CardHeader title="Final review" description="Check everything before saving." />

          <div className="flex flex-col gap-4">
            <ReviewBlock title="Attendance">
              <div className="flex flex-wrap gap-2">
                {data.students.map((student) => (
                  <span key={student.id} className="flex items-center gap-1.5 text-xs">
                    {student.fullName.split(' ')[0]}
                    <AttendanceChip status={attendance[student.id] ?? 'PRESENT'} />
                  </span>
                ))}
              </div>
            </ReviewBlock>

            <ReviewBlock title="Overall class note">
              <p className="text-sm text-ink">{overallClassNote}</p>
            </ReviewBlock>

            <ReviewBlock title={`Student observations (${Object.values(observations).filter((v) => v.trim()).length})`}>
              {present
                .filter((s) => observations[s.id]?.trim())
                .map((s) => (
                  <p key={s.id} className="text-sm text-ink">
                    <span className="font-medium">{s.fullName}:</span> {observations[s.id]}
                  </p>
                ))}
              {Object.values(observations).filter((v) => v.trim()).length === 0 ? (
                <p className="text-sm text-ink-3">None added.</p>
              ) : null}
            </ReviewBlock>

            <ReviewBlock title={`Coverage changes (${learningUpdates.length})`}>
              {learningUpdates.length === 0 ? (
                <p className="text-sm text-ink-3">Nothing newly ticked.</p>
              ) : (
                learningUpdates.map((u, i) => {
                  const student = data.students.find((s) => s.id === u.studentId);
                  const sub = data.headings
                    .flatMap((h) => h.subHeadings)
                    .find((s) => s.id === u.skillId);
                  return (
                    <p key={i} className="text-sm text-ink">
                      {student?.fullName} · {sub?.name}{' '}
                      {u.newStatus === COVERED_STATUS ? '→ covered' : '→ removed'}
                    </p>
                  );
                })
              )}
            </ReviewBlock>

            <ReviewBlock title={`Development observations (${developmentUpdates.length})`}>
              {developmentUpdates.length === 0 ? (
                <p className="text-sm text-ink-3">None added.</p>
              ) : (
                developmentUpdates.map((d, i) => {
                  const student = data.students.find((s) => s.id === d.studentId);
                  const area = data.developmentAreas.find((a) => a.id === d.areaId);
                  return (
                    <p key={i} className="text-sm text-ink">
                      <span className="font-medium">
                        {student?.fullName} · {area?.name}:
                      </span>{' '}
                      {d.observation}
                    </p>
                  );
                })
              )}
            </ReviewBlock>
          </div>

          {error ? <p className="mt-4 text-xs text-danger">{error}</p> : null}
        </Card>
      ) : null}

      <div className="sticky bottom-0 mt-6 flex gap-2 border-t border-line bg-canvas py-4">
        {step === 'Review' ? (
          <Button fullWidth onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Class Record'}
          </Button>
        ) : (
          <Button fullWidth onClick={() => setStep(STEPS[stepIndex + 1]!)} disabled={!canContinue}>
            Continue
          </Button>
        )}
      </div>
    </FullScreen>
  );
}

/**
 * Phase-2 placeholder. Mounted so the stepper's shape does not change when the
 * recorder arrives; renders nothing today.
 */
function RecordSourceStep() {
  // TODO(AI-PHASE-2): mount the voice recorder and processing screen here.
  return null;
}

function OptionalUpdates({
  context,
  present,
  ticked,
  onToggle,
  developmentUpdates,
  setDevelopmentUpdates,
}: {
  context: ClassContextDto;
  present: ClassContextDto['students'];
  ticked: Set<string>;
  onToggle: (studentId: string, skillId: string) => void;
  developmentUpdates: DevelopmentDraft[];
  setDevelopmentUpdates: (next: DevelopmentDraft[]) => void;
}) {
  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="What was covered"
          description="Tick each student against what you took them through today. Boxes already ticked were covered in an earlier class."
        />

        <CoverageGrid
          students={present}
          headings={context.headings}
          ticked={ticked}
          onToggle={onToggle}
          emptyHint="This level has no sub-headings yet. Add them under Curriculum and they will appear here."
        />
      </Card>

      <Card>
        <CardHeader
          title="Development observations"
          description="Optional. A single class does not have to generate development data."
        />

        <div className="flex flex-col gap-3">
          {developmentUpdates.map((update, index) => (
            <div key={index} className="rounded-[12px] border border-line p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[130px] flex-1">
                  <Field label="Student">
                    <Select
                      value={update.studentId}
                      onChange={(e) =>
                        setDevelopmentUpdates(
                          developmentUpdates.map((u, i) =>
                            i === index ? { ...u, studentId: e.target.value } : u,
                          ),
                        )
                      }
                    >
                      {present.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="min-w-[150px] flex-1">
                  <Field label="Area">
                    <Select
                      value={update.areaId}
                      onChange={(e) =>
                        setDevelopmentUpdates(
                          developmentUpdates.map((u, i) =>
                            i === index ? { ...u, areaId: e.target.value } : u,
                          ),
                        )
                      }
                    >
                      {context.developmentAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() => setDevelopmentUpdates(developmentUpdates.filter((_, i) => i !== index))}
                  aria-label="Remove development observation"
                  className="touch-target mb-1 flex items-center justify-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"
                >
                  <X size={15} />
                </button>
              </div>

              <Textarea
                value={update.observation}
                onChange={(e) =>
                  setDevelopmentUpdates(
                    developmentUpdates.map((u, i) =>
                      i === index ? { ...u, observation: e.target.value } : u,
                    ),
                  )
                }
                placeholder="Volunteered to explain their method to the group without prompting."
                className="mt-2 min-h-[72px]"
              />
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          className="mt-3"
          disabled={present.length === 0 || context.developmentAreas.length === 0}
          onClick={() =>
            setDevelopmentUpdates([
              ...developmentUpdates,
              {
                studentId: present[0]!.id,
                areaId: context.developmentAreas[0]!.id,
                observation: '',
              },
            ])
          }
        >
          Add Development Observation
        </Button>
      </Card>
    </>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-line p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-6 md:py-10">{children}</div>
    </div>
  );
}

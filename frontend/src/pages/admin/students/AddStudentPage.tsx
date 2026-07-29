import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { StudentDto, SubjectDto } from '@vig/shared';
import { WEEKDAY_LABELS } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/States';
import { AvailabilityGrid, fromDayRows, toDayRows, type DayAvailability } from '@/components/AvailabilityGrid';
import { TempPasswordModal } from '../teachers/TeachersPage';
import { cn } from '@/lib/ui';

const STEPS = ['Basics', 'Subjects', 'Availability', 'Parent', 'Review'] as const;
type Step = (typeof STEPS)[number];

interface SubjectLevelDraft {
  subjectId: string;
  levelId: string;
}

/**
 * Adding a student is more than entering a name (F6): VIG needs subjects, a level
 * per subject, weekly availability and parent access before the child is
 * teachable and schedulable. The wizard collects exactly that, then shows a
 * review so mistakes are caught before creation.
 */
export function AddStudentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('Basics');

  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gradeLabel, setGradeLabel] = useState('');
  const [subjectLevels, setSubjectLevels] = useState<SubjectLevelDraft[]>([]);
  const [availability, setAvailability] = useState<DayAvailability[]>(
    toDayRows([1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '09:00', endTime: '15:00' }))),
  );
  const [parentName, setParentName] = useState('');
  const [parentUsername, setParentUsername] = useState('');
  const [relationship, setRelationship] = useState('Parent');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });

  const create = useMutation({
    mutationFn: () =>
      post<{ student: StudentDto; parentTempPassword: string | null }>('/students', {
        fullName: fullName.trim(),
        dateOfBirth: dateOfBirth || undefined,
        gradeLabel: gradeLabel || undefined,
        subjectLevels,
        availability: fromDayRows(availability),
        parent:
          parentName && parentUsername
            ? { fullName: parentName.trim(), username: parentUsername.trim(), relationship }
            : undefined,
      }),
    onSuccess: (result) => {
      if (result.parentTempPassword) {
        setCreated({ username: parentUsername, tempPassword: result.parentTempPassword });
      } else {
        navigate(`/admin/students/${result.student.id}`, { replace: true });
      }
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const stepIndex = STEPS.indexOf(step);
  const canContinue = useMemo(() => {
    if (step === 'Basics') return fullName.trim().length > 0;
    if (step === 'Subjects') return subjectLevels.length > 0 && subjectLevels.every((sl) => sl.levelId);
    if (step === 'Availability') return availability.some((a) => a.enabled);
    return true;
  }, [step, fullName, subjectLevels, availability]);

  if (isLoading) return <LoadingState rows={5} />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader backTo="/admin/students" backLabel="Back to Students" title="Add Student" />

      {/* Step indicator */}
      <ol className="mb-6 flex items-center gap-1.5">
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
              className={cn(
                'hidden text-[10px] font-medium sm:block',
                index === stepIndex ? 'text-violet' : 'text-ink-3',
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <Card>
        {step === 'Basics' ? (
          <>
            <CardHeader title="Basic details" description="Name, date of birth, grade and so on." />
            <div className="flex flex-col gap-4">
              <Field label="Full name" htmlFor="student-name" required>
                <Input
                  id="student-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Sharma"
                  autoFocus
                />
              </Field>
              <Field label="Date of birth" htmlFor="student-dob">
                <Input
                  id="student-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </Field>
              <Field label="Grade" htmlFor="student-grade" hint="Optional.">
                <Input
                  id="student-grade"
                  value={gradeLabel}
                  onChange={(e) => setGradeLabel(e.target.value)}
                  placeholder="5th Grade"
                />
              </Field>
            </div>
          </>
        ) : null}

        {step === 'Subjects' ? (
          <>
            <CardHeader
              title="Subjects & levels"
              description="Select the subjects this child studies and set their current level in each."
            />
            <SubjectLevelEditor
              subjects={subjects ?? []}
              value={subjectLevels}
              onChange={setSubjectLevels}
            />
          </>
        ) : null}

        {step === 'Availability' ? (
          <>
            <CardHeader
              title="Weekly availability"
              description="When is this child typically available for classes? This is the boundary of possible times, not the timetable."
            />
            <AvailabilityGrid rows={availability} onChange={setAvailability} />
            <p className="mt-3 rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
              You can add temporary changes later from the student's profile.
            </p>
          </>
        ) : null}

        {step === 'Parent' ? (
          <>
            <CardHeader
              title="Parent access"
              description="Create the parent's account so they can see approved updates. You can skip this and add it later."
            />
            <div className="flex flex-col gap-4">
              <Field label="Parent full name" htmlFor="parent-name">
                <Input
                  id="parent-name"
                  value={parentName}
                  onChange={(e) => {
                    setParentName(e.target.value);
                    if (!parentUsername) {
                      setParentUsername(e.target.value.trim().toLowerCase().split(' ')[0] ?? '');
                    }
                  }}
                  placeholder="Ananya Sharma"
                />
              </Field>
              <Field
                label="Parent username"
                htmlFor="parent-username"
                hint="They'll receive a temporary password to share out of band."
              >
                <Input
                  id="parent-username"
                  value={parentUsername}
                  onChange={(e) => setParentUsername(e.target.value.toLowerCase())}
                  placeholder="ananya"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label="Relationship" htmlFor="parent-relationship">
                <Select
                  id="parent-relationship"
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
          </>
        ) : null}

        {step === 'Review' ? (
          <>
            <CardHeader title="Review & create" description="Check everything before creating this profile." />
            <dl className="flex flex-col gap-4 text-sm">
              <ReviewBlock title="Basic details">
                <ReviewLine label="Name" value={fullName} />
                <ReviewLine label="Date of birth" value={dateOfBirth || '—'} />
                <ReviewLine label="Grade" value={gradeLabel || '—'} />
              </ReviewBlock>

              <ReviewBlock title="Subject levels">
                {subjectLevels.map((sl) => {
                  const subject = subjects?.find((s) => s.id === sl.subjectId);
                  const level = subject?.levels?.find((l) => l.id === sl.levelId);
                  return (
                    <ReviewLine key={sl.subjectId} label={subject?.name ?? ''} value={level?.name ?? '—'} />
                  );
                })}
              </ReviewBlock>

              <ReviewBlock title="Weekly availability">
                {fromDayRows(availability).map((slot) => (
                  <ReviewLine
                    key={slot.weekday}
                    label={WEEKDAY_LABELS[slot.weekday]}
                    value={`${slot.startTime} – ${slot.endTime}`}
                  />
                ))}
              </ReviewBlock>

              <ReviewBlock title="Parent access">
                <ReviewLine label="Parent" value={parentName || 'Not set up yet'} />
              </ReviewBlock>
            </dl>

            {error ? <p className="mt-4 text-xs text-danger">{error}</p> : null}
          </>
        ) : null}

        <div className="mt-6 flex justify-between gap-2 border-t border-line pt-5">
          <Button
            variant="secondary"
            onClick={() =>
              stepIndex === 0 ? navigate('/admin/students') : setStep(STEPS[stepIndex - 1]!)
            }
          >
            Back
          </Button>

          {step === 'Review' ? (
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create Student'}
            </Button>
          ) : (
            <Button onClick={() => setStep(STEPS[stepIndex + 1]!)} disabled={!canContinue}>
              Next
            </Button>
          )}
        </div>
      </Card>

      {created ? (
        <TempPasswordModal
          created={created}
          title="Parent account created"
          onClose={() => navigate('/admin/students', { replace: true })}
        />
      ) : null}
    </div>
  );
}

function SubjectLevelEditor({
  subjects,
  value,
  onChange,
}: {
  subjects: SubjectDto[];
  value: SubjectLevelDraft[];
  onChange: (next: SubjectLevelDraft[]) => void;
}) {
  const unused = subjects.filter((s) => !value.some((v) => v.subjectId === s.id));

  return (
    <div className="flex flex-col gap-3">
      {value.map((row, index) => (
        <SubjectLevelRow
          key={row.subjectId}
          row={row}
          onChange={(next) => onChange(value.map((v, i) => (i === index ? next : v)))}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        />
      ))}

      {unused.length > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => onChange([...value, { subjectId: unused[0]!.id, levelId: '' }])}
        >
          Add subject
        </Button>
      ) : null}

      {value.length === 0 ? (
        <p className="rounded-[12px] bg-warning-bg px-3 py-2.5 text-xs text-ink-2">
          A student needs at least one subject before they can be scheduled.
        </p>
      ) : null}
    </div>
  );
}

function SubjectLevelRow({
  row,
  onChange,
  onRemove,
}: {
  row: SubjectLevelDraft;
  onChange: (next: SubjectLevelDraft) => void;
  onRemove: () => void;
}) {
  const { data: subject } = useQuery({
    queryKey: ['curriculum', 'subject', row.subjectId],
    queryFn: () => get<SubjectDto>(`/curriculum/subjects/${row.subjectId}`),
  });

  return (
    <div className="flex items-end gap-3 rounded-[12px] border border-line p-3">
      <div className="min-w-0 flex-1">
        <Field label="Subject">
          <Input value={subject?.name ?? '…'} readOnly disabled className="bg-lavender-2" />
        </Field>
      </div>

      <div className="min-w-[140px]">
        <Field label="Current level">
          <Select value={row.levelId} onChange={(e) => onChange({ ...row, levelId: e.target.value })}>
            <option value="">Select…</option>
            {subject?.levels?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
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

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-line p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

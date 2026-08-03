import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { StudentDto, SubjectDto } from '@vig/shared';
import { accountUsername } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/States';
import { PhotoPicker } from '@/components/PhotoPicker';
import { SubjectLevelEditor, type SubjectLevelDraft } from '@/components/SubjectLevelEditor';
import { cn } from '@/lib/ui';

const STEPS = ['Basics', 'Subjects'] as const;
type Step = (typeof STEPS)[number];

/**
 * Enrolling a child (F6): who they are, then what they study.
 *
 * Weekly availability and parent access were once steps here. They are set from
 * the student's profile and the Parents page instead, so enrolment stays short —
 * anything still missing is reported on Admin Home rather than blocking the
 * admin at the point of adding a child.
 */
export function AddStudentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('Basics');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gradeLabel, setGradeLabel] = useState('');
  const [photo, setPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [subjectLevels, setSubjectLevels] = useState<SubjectLevelDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });

  // A preview of the roll name. The API issues the real one — only it can see
  // that another Aarav Sharma enrolled this year.
  const username = accountUsername('S', firstName, lastName);

  const create = useMutation({
    mutationFn: () =>
      post<{ student: StudentDto }>('/students', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth || undefined,
        gradeLabel: gradeLabel || undefined,
        avatarPath: photo?.path,
        subjectLevels,
      }),
    onSuccess: (result) => navigate(`/admin/students/${result.student.id}`, { replace: true }),
    onError: (err) => setError(errorMessage(err)),
  });

  const stepIndex = STEPS.indexOf(step);
  const canContinue = useMemo(() => {
    if (step === 'Basics') return firstName.trim().length > 0 && lastName.trim().length > 0;
    return subjectLevels.length > 0 && subjectLevels.every((sl) => sl.levelId);
  }, [step, firstName, lastName, subjectLevels]);

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
                'text-[10px] font-medium',
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
            <CardHeader title="Basic details" description="Name, date of birth, grade and a photo." />
            <div className="flex flex-col gap-4">
              <PhotoPicker
                name={`${firstName} ${lastName}`.trim()}
                uploadUrlEndpoint="/students/avatar-upload-url"
                value={photo}
                onChange={setPhoto}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" htmlFor="student-first-name" required>
                  <Input
                    id="student-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Aarav"
                    autoFocus
                  />
                </Field>
                <Field label="Last name" htmlFor="student-last-name" required>
                  <Input
                    id="student-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Sharma"
                  />
                </Field>
              </div>

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

              <UsernamePreview
                username={username}
                caption="This child's roll name, issued by VIG. Children do not sign in — it identifies them on paperwork."
              />
            </div>
          </>
        ) : (
          <>
            <CardHeader
              title="Subjects & levels"
              description="Select the subjects this child studies and set their current level in each."
            />
            <SubjectLevelEditor subjects={subjects ?? []} value={subjectLevels} onChange={setSubjectLevels} />

            <p className="mt-4 rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
              Weekly availability and parent access are set afterwards — availability from this child's
              profile, parent access from the Parents page.
            </p>

            {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
          </>
        )}

        <div className="mt-6 flex justify-between gap-2 border-t border-line pt-5">
          <Button
            variant="secondary"
            onClick={() =>
              stepIndex === 0 ? navigate('/admin/students') : setStep(STEPS[stepIndex - 1]!)
            }
          >
            Back
          </Button>

          {step === 'Subjects' ? (
            <Button onClick={() => create.mutate()} disabled={!canContinue || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create Student'}
            </Button>
          ) : (
            <Button onClick={() => setStep(STEPS[stepIndex + 1]!)} disabled={!canContinue}>
              Next
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Shown while the name is being typed so the account name is never a surprise
 * after the fact. It is a preview: the API decides the final value.
 */
export function UsernamePreview({ username, caption }: { username: string; caption: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-lavender-2 px-4 py-3">
      <p className="text-xs text-ink-2">Username</p>
      <p className="mt-0.5 font-mono text-sm font-medium text-ink">
        {username || <span className="font-sans text-ink-3">Enter a first and last name</span>}
      </p>
      <p className="mt-1.5 text-xs text-ink-3">{caption}</p>
    </div>
  );
}

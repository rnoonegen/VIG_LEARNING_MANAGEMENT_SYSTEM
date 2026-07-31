import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarCheck, Check, Sparkles } from 'lucide-react';
import type { SlotOptionDto, StudentSummaryDto, SubjectDto, TeacherSummaryDto } from '@vig/shared';
import { formatTime12h, WEEKDAY_SHORT } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { Field, Input, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Chip';
import { cn } from '@/lib/ui';

type Option = SlotOptionDto & { teacherId: string; teacherName: string };
type Stage = 'request' | 'options' | 'confirmed';

/**
 * Structured request → valid options → review → confirm.
 *
 * The AI that Phase 2 adds only ever parsed the sentence into these fields; the
 * constraint engine that produces the options is deterministic and ships now.
 * The form *is* the structured request, already reviewable and editable, so the
 * "we understood your request" screen is not rendered (docs/DEFERRED-AI.md AI-7/AI-8).
 */
export function AddClassPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('request');
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Option | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [timesPerWeek, setTimesPerWeek] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [timePreference, setTimePreference] = useState<'MORNING' | 'AFTERNOON' | 'ANY'>('MORNING');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: students } = useQuery({
    queryKey: ['students'],
    queryFn: () => get<StudentSummaryDto[]>('/students'),
  });
  const { data: subjects } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });
  const { data: teachers } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => get<TeacherSummaryDto[]>('/teachers'),
  });
  const { data: subject } = useQuery({
    queryKey: ['curriculum', 'subject', subjectId],
    queryFn: () => get<SubjectDto>(`/curriculum/subjects/${subjectId}`),
    enabled: Boolean(subjectId),
  });

  const findOptions = useMutation({
    mutationFn: () =>
      post<{ options: Option[] }>('/schedule/options', {
        studentIds,
        subjectId,
        levelId,
        teacherId: teacherId || undefined,
        timesPerWeek,
        durationMinutes,
        timePreference,
        startDate,
      }),
    onSuccess: (result) => {
      setOptions(result.options);
      setSelected(result.options.find((o) => o.isBestMatch) ?? result.options[0] ?? null);
      setStage('options');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const confirm = useMutation({
    mutationFn: () =>
      post('/schedule/confirm', {
        studentIds,
        subjectId,
        levelId,
        teacherId: selected!.teacherId,
        daysOfWeek: selected!.daysOfWeek,
        startTime: selected!.startTime,
        durationMinutes: selected!.durationMinutes,
        startDate,
      }),
    onSuccess: () => setStage('confirmed'),
    onError: (err) => setError(errorMessage(err)),
  });

  // A student's assigned level in this subject is the sensible default.
  const suggestedLevelId = useMemo(() => {
    if (!subjectId || studentIds.length === 0) return '';
    const student = students?.find((s) => s.id === studentIds[0]);
    return student?.subjectLevels.find((sl) => sl.subjectId === subjectId)?.levelId ?? '';
  }, [subjectId, studentIds, students]);

  const canSearch = studentIds.length > 0 && subjectId && (levelId || suggestedLevelId);

  if (stage === 'confirmed') {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check size={30} strokeWidth={3} />
          </div>
          <h2>Class scheduled</h2>
          <p className="max-w-sm text-sm text-ink-2">
            {subject?.name} with {selected?.teacherName} has been added to the schedule.
          </p>

          <Card tone="lavender" className="mt-3 w-full text-left">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-violet">
              What happens next
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-ink-2">
              <li>· The class now appears on the schedule for everyone involved.</li>
              <li>· {selected?.teacherName} has been notified.</li>
              <li>· Availability has been validated; you can cancel or move classes any time.</li>
            </ul>
          </Card>

          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/schedule')}>
              View Schedule
            </Button>
            <Button onClick={() => window.location.reload()}>Schedule Another</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backTo="/admin/schedule"
        backLabel="Back to Schedule"
        title="Schedule a class"
        description="Describe the class you need. VIG will only offer times that work for everyone."
      />

      <Card className="mb-4">
        <CardHeader
          title="What would you like to schedule?"
          description="Every option returned respects teaching capability, both availabilities and existing classes."
        />

        <div className="flex flex-col gap-4">
          <Field label="Students" required>
            <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-[12px] border border-line p-2">
              {students?.map((student) => (
                <label
                  key={student.id}
                  className="touch-target flex cursor-pointer items-center gap-3 rounded-[10px] px-2 hover:bg-lavender-2"
                >
                  <input
                    type="checkbox"
                    checked={studentIds.includes(student.id)}
                    onChange={(e) =>
                      setStudentIds(
                        e.target.checked
                          ? [...studentIds, student.id]
                          : studentIds.filter((id) => id !== student.id),
                      )
                    }
                    className="h-4 w-4 accent-[var(--color-violet)]"
                  />
                  <span className="text-sm text-ink">{student.fullName}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject" required>
              <Select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setLevelId('');
                }}
              >
                <option value="">Select…</option>
                {subjects?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Level" required hint={suggestedLevelId ? "Defaults to the student's current level." : undefined}>
              <Select value={levelId || suggestedLevelId} onChange={(e) => setLevelId(e.target.value)}>
                <option value="">Select…</option>
                {subject?.levels?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Teacher" hint="Leave blank to let VIG suggest any capable teacher.">
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Any capable teacher</option>
                {/* Deactivated teachers cannot take a class, so they are not offered one. */}
                {teachers?.filter((t) => t.status === 'ACTIVE').map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Times per week">
              <Select value={String(timesPerWeek)} onChange={(e) => setTimesPerWeek(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'time' : 'times'} per week
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Duration">
              <Select
                value={String(durationMinutes)}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              >
                {[30, 45, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Time preference">
              <Select
                value={timePreference}
                onChange={(e) => setTimePreference(e.target.value as typeof timePreference)}
              >
                <option value="MORNING">Morning</option>
                <option value="AFTERNOON">Afternoon</option>
                <option value="ANY">Any time</option>
              </Select>
            </Field>

            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <Button
            onClick={() => {
              if (!levelId && suggestedLevelId) setLevelId(suggestedLevelId);
              findOptions.mutate();
            }}
            disabled={!canSearch || findOptions.isPending}
            fullWidth
          >
            {findOptions.isPending ? 'Finding options…' : 'Find Options'}
          </Button>
        </div>
      </Card>

      {stage === 'options' ? (
        findOptions.isPending ? (
          <LoadingState rows={3} label="Checking availability" />
        ) : options.length === 0 ? (
          <EmptyState
            title="No valid times found"
            description="No slot satisfies the teacher's capability, both availabilities and the existing schedule. Try a different duration, fewer times per week, or widen availability."
          />
        ) : (
          <Card>
            <CardHeader
              title="Here are valid time options"
              description="All options match availability and current schedules."
            />

            <div className="flex flex-col gap-2.5">
              {options.map((option, index) => (
                <button
                  key={`${option.teacherId}-${option.startTime}-${index}`}
                  type="button"
                  onClick={() => setSelected(option)}
                  className={cn(
                    'rounded-[12px] border p-4 text-left transition-colors',
                    selected === option ? 'border-violet bg-lavender' : 'border-line bg-card hover:bg-lavender-2',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Option {index + 1}
                    </span>
                    {option.isBestMatch ? (
                      <Pill token="green">
                        <Sparkles size={11} /> Best match
                      </Pill>
                    ) : null}
                  </div>

                  <p className="text-sm font-semibold text-ink">
                    {option.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(' & ')} ·{' '}
                    {formatTime12h(option.startTime)} – {formatTime12h(option.endTime)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2">{option.teacherName}</p>

                  <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                    {option.checks.map((check) => (
                      <li key={check.label} className="flex items-center gap-1 text-[11px] text-success">
                        <Check size={11} strokeWidth={3} />
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
              <Button
                onClick={() => confirm.mutate()}
                disabled={!selected || confirm.isPending}
                icon={<CalendarCheck size={16} />}
                fullWidth
              >
                {confirm.isPending ? 'Saving…' : 'Confirm & Save'}
              </Button>
              <Button variant="tertiary" onClick={() => setStage('request')} fullWidth>
                Choose a different option
              </Button>
            </div>
          </Card>
        )
      ) : null}
    </div>
  );
}

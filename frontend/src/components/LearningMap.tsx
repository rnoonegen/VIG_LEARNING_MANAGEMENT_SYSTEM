import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import type { LevelChangePreviewDto, SkillStatus, SubjectLearningDto } from '@vig/shared';
import { COVERED_STATUS, isCovered, NOT_COVERED_STATUS, SKILL_STATUS_META } from '@vig/shared';
import { errorMessage, get, patch, post } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { SkillStatusChip, SubjectBadge } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Layout';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';

/**
 * The Learning Map. Read-only for parents; editable for staff.
 *
 * Status belongs to the student, not the curriculum (BR-07) — this view shows
 * where one child is against the structure the school defined.
 */
export function LearningMap({
  studentId,
  editable,
  canChangeLevel,
  endpoint = `/students/${'{id}'}/learning`,
}: {
  studentId: string;
  editable?: boolean;
  canChangeLevel?: boolean;
  /** Parents read through /parent/students/:id/learning instead. */
  endpoint?: string;
}) {
  const url = endpoint.replace('{id}', studentId);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<{ id: string; name: string; status: SkillStatus } | null>(
    null,
  );
  const [levelChangeSubject, setLevelChangeSubject] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['learning', studentId, url],
    queryFn: () => get<SubjectLearningDto[]>(url),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <EmptyState
        title="No learning history yet"
        description="Once classes begin, learning updates will appear here."
      />
    );
  }

  const current = data.find((s) => s.subjectId === activeSubject) ?? data[0]!;

  return (
    <>
      <Tabs
        active={current.subjectId}
        onChange={setActiveSubject}
        tabs={data.map((s) => ({ key: s.subjectId, label: s.subjectName }))}
      />

      <Card className="mb-4">
        <CardHeader
          title={<SubjectBadge name={current.subjectName} colorToken={current.colorToken} />}
          description={`Current level: ${current.levelName}`}
          action={
            canChangeLevel ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowUpRight size={14} />}
                onClick={() => setLevelChangeSubject(current.subjectId)}
              >
                Change Level
              </Button>
            ) : undefined
          }
        />

        <CoverageSummary counts={current.counts} />
      </Card>

      <div className="flex flex-col gap-3">
        {current.topics.map((topic) => (
          <Card key={topic.topicId} padded={false}>
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-medium text-ink">{topic.topicName}</p>
              <p className="text-xs text-ink-2">
                {topic.skills.filter((s) => isCovered(s.status)).length} of {topic.skills.length} covered
              </p>
            </div>

            <ul>
              {topic.skills.map((skill) => (
                <li key={skill.skillId} className="border-b border-line last:border-0">
                  {editable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingSkill({ id: skill.skillId, name: skill.skillName, status: skill.status })
                      }
                      className="touch-target flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-lavender-2"
                    >
                      <span className="min-w-0 truncate text-sm text-ink">{skill.skillName}</span>
                      <SkillStatusChip status={skill.status} />
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0 truncate text-sm text-ink">{skill.skillName}</span>
                      <SkillStatusChip status={skill.status} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {editingSkill ? (
        <SkillEditor studentId={studentId} skill={editingSkill} onClose={() => setEditingSkill(null)} />
      ) : null}

      {levelChangeSubject ? (
        <LevelChangeModal
          studentId={studentId}
          subjectId={levelChangeSubject}
          onClose={() => setLevelChangeSubject(null)}
        />
      ) : null}
    </>
  );
}

/**
 * How much of the level this child has been taken through.
 *
 * Coverage is a two-state question, so this is one bar and two numbers rather
 * than a distribution across shades of nearly-there.
 */
function CoverageSummary({ counts }: { counts: Record<SkillStatus, number> }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;

  const covered = counts[COVERED_STATUS];
  const remaining = total - covered;

  return (
    <div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-lavender-2">
        {covered > 0 ? (
          <span
            className={cn('h-full', TOKEN_STYLES[asToken(SKILL_STATUS_META[COVERED_STATUS].color)].bar)}
            style={{ width: `${(covered / total) * 100}%` }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              TOKEN_STYLES[asToken(SKILL_STATUS_META[COVERED_STATUS].color)].bar,
            )}
          />
          <span className="font-semibold text-ink">{covered}</span>
          covered
        </span>
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              TOKEN_STYLES[asToken(SKILL_STATUS_META[NOT_COVERED_STATUS].color)].bar,
            )}
          />
          <span className="font-semibold text-ink">{remaining}</span>
          not yet
        </span>
      </div>
    </div>
  );
}

function SkillEditor({
  studentId,
  skill,
  onClose,
}: {
  studentId: string;
  skill: { id: string; name: string; status: SkillStatus };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SkillStatus>(skill.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => patch(`/students/${studentId}/skills/${skill.id}`, { status, note: note || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning', studentId] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Update coverage"
      description={skill.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Has this been covered?" required error={error}>
          <div className="grid grid-cols-2 gap-2">
            {[COVERED_STATUS, NOT_COVERED_STATUS].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={cn(
                  'touch-target flex items-center justify-center rounded-[12px] border px-3 py-2.5 text-sm font-medium transition-colors',
                  status === option ? 'border-violet bg-lavender text-violet' : 'border-line bg-card text-ink-2',
                )}
              >
                {SKILL_STATUS_META[option].label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Note" htmlFor="skill-note" hint="Optional. Recorded with your name and the date.">
          <Textarea
            id="skill-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Understands the concept with similar denominators; needs more practice with different denominators."
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Level progression must not erase the journey (BR-08). The preview names what
 * is unfinished so the school decides explicitly what carries forward.
 */
function LevelChangeModal({
  studentId,
  subjectId,
  onClose,
}: {
  studentId: string;
  subjectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [carried, setCarried] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['level-change', studentId, subjectId],
    queryFn: () =>
      get<LevelChangePreviewDto>(`/students/${studentId}/level-change/preview`, { subjectId }),
  });

  const apply = useMutation({
    mutationFn: (toLevelId?: string) =>
      post(`/students/${studentId}/level-change`, {
        subjectId,
        toLevelId,
        carriedForwardSkillIds: carried,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['learning', studentId] });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={data?.nextLevelName ? `Move to ${data.nextLevelName}` : 'Change level'}
      description="Review the impact of this change."
      footer={
        <>
          <Button variant="secondary" onClick={() => apply.mutate(undefined)} disabled={apply.isPending}>
            Stay on {data?.currentLevelName}
          </Button>
          <Button
            onClick={() => apply.mutate(data?.nextLevelId ?? undefined)}
            disabled={!data?.nextLevelId || apply.isPending}
          >
            {apply.isPending ? 'Applying…' : 'Confirm & Move'}
          </Button>
        </>
      }
    >
      {isLoading || !data ? (
        <LoadingState rows={3} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-[12px] bg-lavender px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {data.currentLevelName} is {data.unfinishedSkills.length === 0 ? 'complete' : 'not yet complete'}
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {data.nextLevelName
                ? `Students will move to ${data.nextLevelName}. ${data.currentLevelName} stays in history.`
                : 'There is no further level in this subject yet.'}
            </p>
          </div>

          <CoverageSummary counts={data.counts} />

          {data.unfinishedSkills.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-ink-2">
                Carry forward (optional) — {data.unfinishedSkills.length} not yet covered
              </p>
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {data.unfinishedSkills.map((skill) => (
                  <li key={skill.id}>
                    <label className="touch-target flex cursor-pointer items-center gap-3 rounded-[12px] border border-line px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={carried.includes(skill.id)}
                        onChange={(e) =>
                          setCarried(
                            e.target.checked
                              ? [...carried, skill.id]
                              : carried.filter((id) => id !== skill.id),
                          )
                        }
                        className="h-4 w-4 accent-[var(--color-violet)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{skill.name}</span>
                      <SkillStatusChip status={skill.status} />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}

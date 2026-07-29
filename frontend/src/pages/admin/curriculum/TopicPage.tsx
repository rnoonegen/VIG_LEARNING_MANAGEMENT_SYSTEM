import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { SkillDto, TopicDto } from '@vig/shared';
import { errorMessage, get, patch, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';

type TopicDetail = TopicDto & {
  levelId: string;
  levelName: string;
  subjectId: string;
  subjectName: string;
};

/**
 * Skills are the smallest unit of progress — the thing a student is actually
 * assessed against. Everything above them is structure.
 */
export function TopicPage() {
  const { topicId = '' } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SkillDto | 'new' | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curriculum', 'topic', topicId],
    queryFn: () => get<TopicDetail>(`/curriculum/topics/${topicId}`),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        backTo={`/admin/curriculum/levels/${data.levelId}`}
        backLabel={`Back to ${data.levelName}`}
        eyebrow={`${data.subjectName} · ${data.levelName}`}
        title={data.name}
        description={`${data.skillCount} ${data.skillCount === 1 ? 'skill' : 'skills'}`}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Add Skill
          </Button>
        }
      />

      {data.skills && data.skills.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.skills.map((skill, index) => (
            <Card key={skill.id} padded={false}>
              <button
                type="button"
                onClick={() => setEditing(skill)}
                className="touch-target flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-lavender-2"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lavender text-[11px] font-semibold text-violet">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{skill.name}</span>
                  {skill.learningGoal ? (
                    <span className="mt-0.5 block text-xs text-ink-2">{skill.learningGoal}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-medium text-violet">Edit</span>
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No skills yet"
          description="A skill is the smallest thing you can track a student's progress against."
          action={
            <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add the first skill
            </Button>
          }
        />
      )}

      {editing ? (
        <SkillEditor
          topicId={topicId}
          skill={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SkillEditor({
  topicId,
  skill,
  onClose,
  onSaved,
}: {
  topicId: string;
  skill: SkillDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [learningGoal, setLearningGoal] = useState(skill?.learningGoal ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description, learningGoal };
      return skill ? patch(`/curriculum/skills/${skill.id}`, body) : post(`/curriculum/topics/${topicId}/skills`, body);
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  const archive = useMutation({
    mutationFn: () => post(`/curriculum/skills/${skill!.id}/archive`),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={skill ? 'Edit skill' : 'Add skill'}
      description="Skills are what a student's progress is tracked against."
      footer={
        <>
          {skill ? (
            // Archive rather than delete — a skill that has been assessed must
            // stay queryable (BR-17).
            <Button variant="secondary" onClick={() => archive.mutate()} disabled={archive.isPending}>
              Archive
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Skill name" htmlFor="skill-name" required error={error}>
          <Input
            id="skill-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adding unlike fractions"
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="skill-description" hint="Optional.">
          <Textarea
            id="skill-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Understand and generate equivalent fractions using visual models and reasoning."
          />
        </Field>

        <Field label="Learning goal" htmlFor="skill-goal" hint="Optional. What success looks like.">
          <Textarea
            id="skill-goal"
            value={learningGoal}
            onChange={(e) => setLearningGoal(e.target.value)}
            placeholder="Students can identify and create equivalent fractions using multiplication and division."
          />
        </Field>
      </div>
    </Modal>
  );
}

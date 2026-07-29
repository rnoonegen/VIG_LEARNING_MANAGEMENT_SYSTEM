import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import type { LevelDto, SubjectDto } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Field';

/** Topics inside a level. A topic groups the skills that can be tracked. */
export function LevelPage() {
  const { levelId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curriculum', 'level', levelId],
    queryFn: () => get<LevelDto & { subject: SubjectDto }>(`/curriculum/levels/${levelId}`),
  });

  const createTopic = useMutation({
    mutationFn: (topicName: string) => post(`/curriculum/levels/${levelId}/topics`, { name: topicName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      setAdding(false);
      setName('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <LoadingState rows={4} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        backTo={`/admin/curriculum/subjects/${data.subject.id}`}
        backLabel={`Back to ${data.subject.name}`}
        eyebrow={data.subject.name}
        title={data.name}
        description={`${data.topicCount} topics · ${data.skillCount} skills`}
        action={
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            Add Topic
          </Button>
        }
      />

      {data.topics && data.topics.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.topics.map((topic) => (
            <Card key={topic.id} padded={false}>
              <button
                type="button"
                onClick={() => navigate(`/admin/curriculum/topics/${topic.id}`)}
                className="touch-target flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-lavender-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{topic.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    {topic.skillCount} {topic.skillCount === 1 ? 'skill' : 'skills'}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No topics yet"
          description="Topics group the trackable skills inside this level, such as Fractions or Geometry."
          action={
            <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              Add the first topic
            </Button>
          }
        />
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add topic"
        description={`A group of skills inside ${data.name}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => createTopic.mutate(name.trim())} disabled={!name.trim() || createTopic.isPending}>
              {createTopic.isPending ? 'Adding…' : 'Add Topic'}
            </Button>
          </>
        }
      >
        <Field label="Topic name" htmlFor="topic-name" required error={error} hint="For example: Fractions.">
          <Input
            id="topic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fractions"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}

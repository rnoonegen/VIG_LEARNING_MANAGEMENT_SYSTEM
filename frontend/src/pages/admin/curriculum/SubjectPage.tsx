import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus } from 'lucide-react';
import type { SubjectDto } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Field';

/** Levels inside a subject — the progression a student moves through. */
export function SubjectPage() {
  const { subjectId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curriculum', 'subject', subjectId],
    queryFn: () => get<SubjectDto>(`/curriculum/subjects/${subjectId}`),
  });

  const createLevel = useMutation({
    mutationFn: (levelName: string) =>
      post(`/curriculum/subjects/${subjectId}/levels`, { name: levelName }),
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

  const nextLevelName = `Level ${(data.levels?.length ?? 0) + 1}`;

  return (
    <div>
      <PageHeader
        backTo="/admin/curriculum"
        backLabel="Back to Curriculum"
        title={data.name}
        description={`${data.levelCount} ${data.levelCount === 1 ? 'level' : 'levels'}`}
        action={
          <Button
            icon={<Plus size={16} />}
            onClick={() => {
              setName(nextLevelName);
              setAdding(true);
            }}
          >
            Add Level
          </Button>
        }
      />

      {data.levels && data.levels.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.levels.map((level) => (
            <Card key={level.id} padded={false}>
              <button
                type="button"
                onClick={() => navigate(`/admin/curriculum/levels/${level.id}`)}
                className="touch-target flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-lavender-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{level.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    {level.topicCount} {level.topicCount === 1 ? 'topic' : 'topics'} · {level.skillCount}{' '}
                    {level.skillCount === 1 ? 'skill' : 'skills'}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No levels yet"
          description="Levels represent the progression a student moves through in this subject."
          action={
            <Button
              icon={<Plus size={16} />}
              onClick={() => {
                setName(nextLevelName);
                setAdding(true);
              }}
            >
              Add the first level
            </Button>
          }
        />
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add level"
        description={`A new stage of progression in ${data.name}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => createLevel.mutate(name.trim())} disabled={!name.trim() || createLevel.isPending}>
              {createLevel.isPending ? 'Adding…' : 'Add Level'}
            </Button>
          </>
        }
      >
        <Field label="Level name" htmlFor="level-name" required error={error}>
          <Input id="level-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}

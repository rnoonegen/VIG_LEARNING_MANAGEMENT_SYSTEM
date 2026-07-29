import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronRight, Plus } from 'lucide-react';
import type { SubjectDto } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Field';
import { SubjectBadge } from '@/components/ui/Chip';

/**
 * Curriculum home. The hierarchy is Subject → Level → Topic → Skill, and each
 * page drills one layer deeper (Flow 03).
 */
export function CurriculumPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['curriculum', 'subjects'],
    queryFn: () => get<SubjectDto[]>('/curriculum/subjects'),
  });

  const createSubject = useMutation({
    mutationFn: (subjectName: string) => post<SubjectDto>('/curriculum/subjects', { name: subjectName }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['curriculum'] });
      setAdding(false);
      setName('');
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Curriculum"
        description="Organise what students learn across subjects and levels."
        action={
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            Add Subject
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} />}
          title="Build your curriculum"
          description="Add subjects and levels to define what your students will learn. Everything else — teaching capabilities, student levels, scheduling — builds on this."
          action={
            <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              Add Your First Subject
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.map((subject) => (
            <Card key={subject.id} className="transition-colors hover:border-violet">
              <button
                type="button"
                onClick={() => navigate(`/admin/curriculum/subjects/${subject.id}`)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <SubjectBadge name={subject.name} colorToken={subject.colorToken} />
                  <span className="mt-1.5 block text-xs text-ink-2">
                    {subject.levelCount} {subject.levelCount === 1 ? 'level' : 'levels'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-violet">
                  Open
                  <ChevronRight size={14} />
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add subject"
        description="Subjects are the broad areas your school teaches."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createSubject.mutate(name.trim())}
              disabled={!name.trim() || createSubject.isPending}
            >
              {createSubject.isPending ? 'Adding…' : 'Add Subject'}
            </Button>
          </>
        }
      >
        <Field
          label="Subject name"
          htmlFor="subject-name"
          required
          error={error}
          hint="For example: Mathematics, English, Science, Telugu."
        >
          <Input
            id="subject-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mathematics"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}

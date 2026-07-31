import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import type { CoverageDto } from '@vig/shared';
import { formatInstantTime, formatShortDate } from '@vig/shared';
import { errorMessage, get, put } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { CoverageGrid, coverageKey, toEntries, toTickedSet } from '@/components/CoverageGrid';

/**
 * Ticking off a class after the fact.
 *
 * The same grid as the class-record flow, reachable on its own — a teacher who
 * finished a class and moved straight into the next one still needs somewhere to
 * record what was covered without reopening the whole wizard.
 */
export function ClassProgressPage() {
  const { occurrenceId = '' } = useParams();
  const queryClient = useQueryClient();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['coverage', occurrenceId],
    queryFn: () => get<CoverageDto>(`/occurrences/${occurrenceId}/coverage`),
  });

  // Server state seeds the grid; local edits win until they are saved.
  useEffect(() => {
    if (data && !dirty) setTicked(toTickedSet(data.covered));
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: () =>
      put<CoverageDto>(`/occurrences/${occurrenceId}/coverage`, {
        entries: toEntries(data?.students ?? [], data?.headings ?? [], ticked),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coverage', occurrenceId] });
      await queryClient.invalidateQueries({ queryKey: ['learning'] });
      setDirty(false);
      setSaved(true);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const toggle = (studentId: string, skillId: string) => {
    const key = coverageKey(studentId, skillId);
    const next = new Set(ticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicked(next);
    setDirty(true);
    setSaved(false);
  };

  const start = new Date(data.scheduledStart);

  return (
    <div>
      <PageHeader
        backTo="/teacher/schedule"
        backLabel="Back to Schedule"
        eyebrow={`${formatShortDate(start)} · ${formatInstantTime(start)}`}
        title={`${data.subjectName} · ${data.levelName}`}
        description="Tick what each student was taken through in this class."
      />

      <Card>
        <CardHeader
          title="Coverage"
          description="Boxes already ticked were covered in an earlier class. Untick one if it was recorded by mistake."
        />

        <CoverageGrid
          students={data.students}
          headings={data.headings}
          ticked={ticked}
          onToggle={toggle}
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            icon={saved && !dirty ? <Check size={14} /> : undefined}
          >
            {save.isPending ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save Progress'}
          </Button>
          {error ? <span className="text-xs text-danger">{error}</span> : null}
        </div>
      </Card>
    </div>
  );
}

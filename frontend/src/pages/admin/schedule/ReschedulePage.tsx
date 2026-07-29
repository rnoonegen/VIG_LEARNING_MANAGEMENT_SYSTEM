import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { formatInstantTime, formatShortDate } from '@vig/shared';
import { errorMessage, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, LoadingState } from '@/components/ui/States';

interface ProposedMove {
  occurrenceId: string;
  label: string;
  currentStart: string;
  proposedStart: string | null;
  reason: string | null;
}

/**
 * Rescheduling after a teacher becomes unavailable.
 *
 * Proposed moves are never applied invisibly: the administrator sees every old
 * and new time and confirms the whole set. The engine revalidates each move
 * again at apply time, so a proposal that has since become invalid is dropped
 * rather than forced through.
 *
 * TODO(AI-PHASE-2): Phase 2 adds a "Describe the change" entry point that selects
 * the affected classes from a sentence — see docs/DEFERRED-AI.md §1 AI-9. The
 * review and apply steps below are unchanged.
 */
export function ReschedulePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [moves, setMoves] = useState<ProposedMove[]>([]);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const occurrenceIds = (params.get('occurrences') ?? '').split(',').filter(Boolean);

  const propose = useMutation({
    mutationFn: () => post<ProposedMove[]>('/schedule/change/propose', { occurrenceIds }),
    onSuccess: setMoves,
    onError: (err) => setError(errorMessage(err)),
  });

  const apply = useMutation({
    mutationFn: () =>
      post<{ applied: number }>('/schedule/change/apply', {
        moves: moves
          .filter((m) => m.proposedStart)
          .map((m) => ({ occurrenceId: m.occurrenceId, newStart: m.proposedStart })),
      }),
    onSuccess: (result) => setApplied(result.applied),
    onError: (err) => setError(errorMessage(err)),
  });

  useEffect(() => {
    if (occurrenceIds.length > 0) propose.mutate();
    // Runs once for the ids in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('occurrences')]);

  if (occurrenceIds.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader backTo="/admin/schedule" backLabel="Back to Schedule" title="Reschedule classes" />
        <EmptyState
          title="No classes selected"
          description="Open a Needs Attention issue on Home and choose Resolve to reschedule the affected classes."
        />
      </div>
    );
  }

  if (applied !== null) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check size={30} strokeWidth={3} />
          </div>
          <h2>Schedule updated</h2>
          <p className="text-sm text-ink-2">
            {applied} {applied === 1 ? 'class has' : 'classes have'} been moved. Teachers have been notified.
          </p>
          <Button onClick={() => navigate('/admin')}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  const movable = moves.filter((m) => m.proposedStart);
  const stuck = moves.filter((m) => !m.proposedStart);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        backTo="/admin"
        backLabel="Back to Home"
        title="Proposed changes"
        description="Review every move before anything is applied."
      />

      {propose.isPending ? (
        <LoadingState rows={4} label="Finding valid alternatives" />
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader
              title={`${moves.length} ${moves.length === 1 ? 'class' : 'classes'} affected`}
              description="VIG checked teacher capability, both availabilities and existing bookings for every suggestion."
            />

            <ul className="flex flex-col gap-2.5">
              {movable.map((move) => (
                <li key={move.occurrenceId} className="rounded-[12px] border border-line p-3.5">
                  <p className="text-sm font-medium text-ink">{move.label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-danger-bg px-2.5 py-1 text-ink-2 line-through">
                      {formatShortDate(new Date(move.currentStart))} ·{' '}
                      {formatInstantTime(new Date(move.currentStart))}
                    </span>
                    <ArrowRight size={13} className="text-ink-3" />
                    <span className="rounded-full bg-success-bg px-2.5 py-1 font-medium text-success">
                      {formatShortDate(new Date(move.proposedStart!))} ·{' '}
                      {formatInstantTime(new Date(move.proposedStart!))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {stuck.length > 0 ? (
              <div className="mt-4 rounded-[12px] bg-warning-bg p-3.5">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <TriangleAlert size={15} className="text-warning" />
                  {stuck.length} {stuck.length === 1 ? 'class needs' : 'classes need'} manual attention
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {stuck.map((move) => (
                    <li key={move.occurrenceId} className="text-xs text-ink-2">
                      {move.label} — {move.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/admin')}>
              Cancel
            </Button>
            <Button onClick={() => apply.mutate()} disabled={movable.length === 0 || apply.isPending}>
              {apply.isPending ? 'Applying…' : `Confirm & Apply (${movable.length})`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

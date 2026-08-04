import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { asToken, cn, TOKEN_STYLES } from '@/lib/ui';
import { MomentCard } from './MomentCard';
import { MomentFormModal } from './MomentFormModal';
import { useMoments } from './momentsApi';

/**
 * Moments — the staff view.
 *
 * An admin sees every moment in the school; a teacher sees the ones they opened
 * themselves. That split is decided by the API, so this page renders whatever
 * comes back and only changes its wording.
 */
export function MomentsPage({ basePath }: { basePath: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useMoments();
  const isAdmin = user?.role === 'ADMIN';

  // The filter offers the subjects actually present in the list, not the whole
  // curriculum — a chip that returns nothing is noise.
  const subjects = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; colorToken: string; count: number }>();
    for (const moment of data ?? []) {
      const existing = seen.get(moment.subject.id);
      if (existing) existing.count += 1;
      else seen.set(moment.subject.id, { ...moment.subject, count: 1 });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const visible = subjectId ? (data ?? []).filter((m) => m.subject.id === subjectId) : (data ?? []);

  const newMomentButton = (
    <Button icon={<Sparkles size={16} />} onClick={() => setCreating(true)}>
      New Moment
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Moments"
        description={
          isAdmin
            ? 'Every moment created across the school. Open one to see the children inside it.'
            : 'The moments you have created. Open one to add the children who were part of it.'
        }
        action={newMomentButton}
      />

      {isLoading ? (
        <LoadingState rows={4} label="Loading moments" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={26} />}
          title="No moments yet"
          description="A moment is a heading, a stretch of dates and a subject — then one entry for each child who was part of it."
          action={newMomentButton}
        />
      ) : (
        <>
          {subjects.length > 1 ? (
            <div className="scroll-x mb-5 flex gap-2 pb-1">
              <FilterChip active={subjectId === null} onClick={() => setSubjectId(null)}>
                All
                <span className="text-ink-3">{data.length}</span>
              </FilterChip>
              {subjects.map((subject) => (
                <FilterChip
                  key={subject.id}
                  active={subjectId === subject.id}
                  token={subject.colorToken}
                  onClick={() => setSubjectId(subjectId === subject.id ? null : subject.id)}
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      TOKEN_STYLES[asToken(subject.colorToken)].dot,
                    )}
                  />
                  {subject.name}
                  <span className="text-ink-3">{subject.count}</span>
                </FilterChip>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((moment) => (
              <MomentCard key={moment.id} moment={moment} to={`${basePath}/${moment.id}`} />
            ))}
          </div>
        </>
      )}

      {creating ? (
        <MomentFormModal
          onClose={() => setCreating(false)}
          // Straight into the new moment, because the next thing anyone wants is
          // to start adding children to it.
          onCreated={(id) => navigate(`${basePath}/${id}`)}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  token,
  onClick,
  children,
}: {
  active: boolean;
  token?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors',
        active
          ? token
            ? TOKEN_STYLES[asToken(token)].chip
            : 'border-violet bg-lavender text-violet'
          : 'border-line bg-card text-ink-2 hover:bg-lavender-2',
      )}
    >
      {children}
    </button>
  );
}

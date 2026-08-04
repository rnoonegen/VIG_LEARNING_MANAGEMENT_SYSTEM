import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/Layout';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { MomentCard } from '@/pages/moments/MomentCard';
import { useMoments } from '@/pages/moments/momentsApi';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/**
 * The moments a parent's own child appears in.
 *
 * The child is passed to the API rather than filtered here, and the API returns
 * only that child's entries inside each moment — a parent never learns which
 * other children were part of it (BR-13).
 */
export function ParentMomentsPage() {
  const { children, child, isLoading: loadingChildren, select } = useSelectedChild();

  if (loadingChildren) return <LoadingState rows={3} />;
  if (!child) return null;

  return (
    <div>
      <PageHeader
        title="Moments"
        description={`What ${child.fullName.split(' ')[0]} has been part of, as their teachers recorded it.`}
      />
      <ChildSwitcher children={children} selectedId={child.id} onSelect={select} />
      <ChildMoments key={child.id} studentId={child.id} childName={child.fullName} />
    </div>
  );
}

function ChildMoments({ studentId, childName }: { studentId: string; childName: string }) {
  const { data, isLoading, isError, refetch } = useMoments({ studentId });

  if (isLoading) return <LoadingState rows={3} label="Loading moments" />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={26} />}
        title="No moments yet"
        description={`When ${childName.split(' ')[0]}'s teachers write up a moment, it will appear here with their photos and notes.`}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((moment) => (
        <MomentCard key={moment.id} moment={moment} to={`/parent/moments/${moment.id}`} />
      ))}
    </div>
  );
}

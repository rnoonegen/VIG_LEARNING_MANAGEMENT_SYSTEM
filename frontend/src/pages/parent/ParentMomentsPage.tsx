import { PageHeader } from '@/components/ui/Layout';
import { MomentsGrid } from '@/components/MomentsGrid';
import { LoadingState } from '@/components/ui/States';
import { useChildren } from './useChild';

/** A visual history of the child's experiences, scoped to the linked child only. */
export function ParentMomentsPage() {
  const { data: children, isLoading } = useChildren();

  if (isLoading) return <LoadingState rows={3} />;
  const child = children?.[0];
  if (!child) return null;

  return (
    <div>
      <PageHeader title="Moments" description={`${child.fullName}'s learning moments.`} />
      <MomentsGrid
        endpoint={`/parent/students/${child.id}/moments`}
        emptyTitle="No moments yet"
        emptyDescription="Photos and videos from your child's classes will appear here."
      />
    </div>
  );
}

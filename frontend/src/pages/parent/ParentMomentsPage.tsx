import { PageHeader } from '@/components/ui/Layout';
import { MomentsGrid } from '@/components/MomentsGrid';
import { LoadingState } from '@/components/ui/States';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/** A visual history of the child's experiences, scoped to the linked child only. */
export function ParentMomentsPage() {
  const { children, child, isLoading, select } = useSelectedChild();

  if (isLoading) return <LoadingState rows={3} />;
  if (!child) return null;

  return (
    <div>
      <PageHeader title="Moments" description={`${child.fullName}'s learning moments.`} />
      <ChildSwitcher children={children} selectedId={child.id} onSelect={select} />
      <MomentsGrid
        key={child.id}
        endpoint={`/parent/students/${child.id}/moments`}
        emptyTitle="No moments yet"
        emptyDescription="Photos and videos from your child's classes will appear here."
      />
    </div>
  );
}

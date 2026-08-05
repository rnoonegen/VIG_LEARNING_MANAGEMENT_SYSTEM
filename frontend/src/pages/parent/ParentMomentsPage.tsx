import { PageHeader } from '@/components/ui/Layout';
import { LoadingState } from '@/components/ui/States';
import { MomentFolderGrid } from '@/pages/moments/MomentFolderGrid';
import { MomentFolderPage } from '@/pages/moments/MomentFolderPage';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/**
 * The moments a parent's own child appears in, filed the way the school files
 * them: one folder per subject.
 *
 * The child is passed to the API rather than filtered here, and the API returns
 * only that child's entries inside each moment — a parent never learns which
 * other children were part of it (BR-13). Folders their child has nothing in do
 * not appear at all, and neither does the school's own "Others" folder.
 */
export function ParentMomentsPage() {
  const { children, child, isLoading, select } = useSelectedChild();

  if (isLoading) return <LoadingState rows={3} />;
  if (!child) return null;

  const firstName = child.fullName.split(' ')[0];

  return (
    <div>
      <PageHeader
        title="Moments"
        description={`What ${firstName} has been part of, as their teachers recorded it.`}
      />
      <ChildSwitcher children={children} selectedId={child.id} onSelect={select} />
      <MomentFolderGrid
        key={child.id}
        basePath="/parent/moments"
        studentId={child.id}
        emptyTitle="No moments yet"
        emptyDescription={`When ${firstName}'s teachers write up a moment, it will appear here with their photos and notes.`}
      />
    </div>
  );
}

/** One subject's folder, narrowed to the child the parent is looking at. */
export function ParentMomentFolderPage() {
  const { child, isLoading } = useSelectedChild();

  if (isLoading) return <LoadingState rows={3} />;
  if (!child) return null;

  return (
    <MomentFolderPage
      key={child.id}
      basePath="/parent/moments"
      studentId={child.id}
      canCreate={false}
    />
  );
}

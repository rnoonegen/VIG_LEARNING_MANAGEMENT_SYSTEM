import { PageHeader } from '@/components/ui/Layout';
import { LearningMap } from '@/components/LearningMap';
import { LoadingState } from '@/components/ui/States';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/**
 * Read-only academic progress for the linked child.
 *
 * Same component the school uses, with editing switched off and the parent-scoped
 * endpoint — one Learning Map, not two implementations that can drift apart.
 */
export function ParentLearningPage() {
  const { children, child, isLoading, select } = useSelectedChild();

  if (isLoading) return <LoadingState rows={4} />;
  if (!child) return null;

  return (
    <div>
      <PageHeader title="Learning" description={`${child.fullName}'s academic progress.`} />
      <ChildSwitcher children={children} selectedId={child.id} onSelect={select} />
      {/* Keyed so switching child resets the subject tab rather than carrying
          the previous child's selection across. */}
      <LearningMap key={child.id} studentId={child.id} endpoint={`/parent/students/${'{id}'}/learning`} />
    </div>
  );
}

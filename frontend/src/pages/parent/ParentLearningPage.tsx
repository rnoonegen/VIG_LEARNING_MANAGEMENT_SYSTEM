import { PageHeader } from '@/components/ui/Layout';
import { LearningMap } from '@/components/LearningMap';
import { LoadingState } from '@/components/ui/States';
import { useChildren } from './useChild';

/**
 * Read-only academic progress for the linked child.
 *
 * Same component the school uses, with editing switched off and the parent-scoped
 * endpoint — one Learning Map, not two implementations that can drift apart.
 */
export function ParentLearningPage() {
  const { data: children, isLoading } = useChildren();

  if (isLoading) return <LoadingState rows={4} />;
  const child = children?.[0];
  if (!child) return null;

  return (
    <div>
      <PageHeader title="Learning" description={`${child.fullName}'s academic progress.`} />
      <LearningMap studentId={child.id} endpoint={`/parent/students/${'{id}'}/learning`} />
    </div>
  );
}

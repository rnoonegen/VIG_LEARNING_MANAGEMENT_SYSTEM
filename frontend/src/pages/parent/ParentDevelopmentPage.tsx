import { PageHeader } from '@/components/ui/Layout';
import { DevelopmentPanel } from '@/components/DevelopmentPanel';
import { LoadingState } from '@/components/ui/States';
import { useChildren } from './useChild';

/**
 * Development for parents: the current picture plus the real teacher evidence
 * behind it. Read-only — stages are the school's judgement to make.
 */
export function ParentDevelopmentPage() {
  const { data: children, isLoading } = useChildren();

  if (isLoading) return <LoadingState rows={4} />;
  const child = children?.[0];
  if (!child) return null;

  return (
    <div>
      <PageHeader
        title="Development"
        description={`${child.fullName}'s personal, emotional and physical growth.`}
      />
      <DevelopmentPanel studentId={child.id} basePath={`/parent/students/${'{id}'}/development`} />
    </div>
  );
}

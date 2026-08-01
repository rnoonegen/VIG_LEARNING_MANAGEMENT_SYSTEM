import { PageHeader } from '@/components/ui/Layout';
import { DevelopmentPanel } from '@/components/DevelopmentPanel';
import { LoadingState } from '@/components/ui/States';
import { useSelectedChild } from './useChild';
import { ChildSwitcher } from './ChildSwitcher';

/**
 * Development for parents: the current picture plus the real teacher evidence
 * behind it. Read-only — stages are the school's judgement to make.
 */
export function ParentDevelopmentPage() {
  const { children, child, isLoading, select } = useSelectedChild();

  if (isLoading) return <LoadingState rows={4} />;
  if (!child) return null;

  return (
    <div>
      <PageHeader
        title="Development"
        description={`${child.fullName}'s personal, emotional and physical growth.`}
      />
      <ChildSwitcher children={children} selectedId={child.id} onSelect={select} />
      <DevelopmentPanel
        key={child.id}
        studentId={child.id}
        basePath={`/parent/students/${'{id}'}/development`}
      />
    </div>
  );
}

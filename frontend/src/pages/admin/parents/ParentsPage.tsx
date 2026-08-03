import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Users } from 'lucide-react';
import type { ParentSummaryDto } from '@vig/shared';
import { get } from '@/lib/api';
import { Avatar, PageHeader } from '@/components/ui/Layout';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Pill } from '@/components/ui/Chip';

/**
 * The families the school has given an account to.
 *
 * A parent is only ever shown alongside their children — the children are what
 * the account is for (BR-13), so a row that did not name them would say nothing
 * useful.
 */
export function ParentsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['parents'],
    queryFn: () => get<ParentSummaryDto[]>('/parents'),
  });

  return (
    <div>
      <PageHeader
        title="Parents"
        description="Accounts that let a family follow their own children."
        action={
          <ButtonLink to="/admin/parents/new" icon={<Plus size={16} />}>
            Add Parent
          </ButtonLink>
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Users size={26} />}
          title="Add your first parent"
          description="A parent account shows one family the approved updates about their own children — nothing else."
          action={
            <ButtonLink to="/admin/parents/new" icon={<Plus size={16} />}>
              Add Parent
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((parent) => (
            <Card key={parent.id} padded={false}>
              <Link
                to={`/admin/parents/${parent.id}`}
                className="touch-target flex items-center gap-3 px-4 py-3.5 hover:bg-lavender-2"
              >
                <Avatar name={parent.fullName} url={parent.avatarUrl} size={40} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{parent.fullName}</p>
                  <p className="text-xs text-ink-2">
                    <span className="font-mono">{parent.username}</span>
                    {parent.mobileNumber ? ` · ${parent.mobileNumber}` : ''}
                  </p>
                  <p className="mt-1 truncate text-xs text-ink-2">
                    {parent.children.length === 0
                      ? 'No children linked yet'
                      : parent.children
                          .map((c) => (c.relationship ? `${c.fullName} (${c.relationship})` : c.fullName))
                          .join(' · ')}
                  </p>
                </div>

                <Pill token={parent.status === 'ACTIVE' ? 'green' : 'muted'}>
                  {parent.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Pill>
                <ChevronRight size={16} className="shrink-0 text-ink-3" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

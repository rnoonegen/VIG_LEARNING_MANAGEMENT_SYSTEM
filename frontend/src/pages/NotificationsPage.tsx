import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationDto } from '@vig/shared';
import { NOTIFICATION_LABELS } from '@vig/shared';
import { get, patch, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Pill } from '@/components/ui/Chip';
import { cn } from '@/lib/ui';

/**
 * The in-app notification centre — the launch channel while web push stays
 * behind FEATURE_WEB_PUSH (D3).
 *
 * Volume is governed server-side (BR-14): parents receive exactly one per week,
 * teachers only scheduling and class-record items, admins operational issues.
 */
export function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<NotificationDto[]>('/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        action={
          unread > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck size={14} />}
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && data.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} />}
          title="Nothing new"
          description="You'll be notified when something needs your attention."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((notification) => {
            const target = linkFor(notification);
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{notification.title}</p>
                  {!notification.readAt ? <Pill token="violet">New</Pill> : null}
                </div>
                <p className="mt-1 text-xs text-ink-2">{notification.body}</p>
                <p className="mt-1.5 text-[11px] text-ink-3">
                  {NOTIFICATION_LABELS[notification.type]} ·{' '}
                  {new Date(notification.createdAt).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </>
            );

            return (
              <Card
                key={notification.id}
                padded={false}
                className={cn('p-4', !notification.readAt && 'border-violet/40 bg-lavender-2')}
              >
                {target ? (
                  <Link to={target} onClick={() => markRead.mutate(notification.id)} className="block">
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => markRead.mutate(notification.id)}
                    className="block w-full text-left"
                  >
                    {body}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tapping a notification should land on the thing it is about. */
function linkFor(notification: NotificationDto): string | null {
  const payload = notification.payload ?? {};
  if (notification.type === 'WEEKLY_UPDATE_READY' && payload.weeklyUpdateId) {
    return `/parent/weekly-updates/${payload.weeklyUpdateId}`;
  }
  if (notification.type === 'CLASS_RECORD_DUE' && payload.occurrenceId) {
    return `/teacher/class/${payload.occurrenceId}`;
  }
  if (notification.type === 'PASSWORD_RESET_REQUEST' && payload.userId) {
    return `/settings/accounts?reset=${payload.userId}`;
  }
  // Both ends of a leave request land where it can be acted on: the admin on the
  // review queue, the teacher on their own record of it.
  if (notification.type === 'LEAVE_REQUESTED') return '/admin/teachers/attendance';
  if (notification.type === 'LEAVE_DECIDED') return '/teacher/availability';
  if (notification.type === 'SCHEDULE_CHANGED') return '/teacher/schedule';
  return null;
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { Pill } from '@/components/ui/Chip';
import { TempPasswordModal } from './teachers/TeachersPage';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  status: string;
  mustChangePassword: boolean;
}

/**
 * Account administration, including the admin-mediated password reset (D2).
 *
 * There is no email or SMS channel: the admin resets, sees the temporary
 * password once, and passes it to the person directly.
 */
export function UsersPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [reset, setReset] = useState<{ username: string; tempPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => get<UserRow[]>('/admin/users'),
  });

  const resetPassword = useMutation({
    mutationFn: (userId: string) =>
      post<{ username: string; tempPassword: string }>(`/admin/users/${userId}/reset-password`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setReset(result);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Arriving from a password-reset notification highlights that account.
  const highlighted = params.get('reset');

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Sign-in accounts for administrators, teachers and parents."
      />

      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((user) => (
            <Card
              key={user.id}
              padded={false}
              className={highlighted === user.id ? 'border-violet bg-lavender' : undefined}
            >
              <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
                  <p className="text-xs text-ink-2">@{user.username}</p>
                </div>

                <Pill token="violet">{ROLE_LABELS[user.role]}</Pill>
                {user.mustChangePassword ? <Pill token="orange">Password pending</Pill> : null}
                <Pill token={user.status === 'ACTIVE' ? 'green' : 'muted'}>{user.status.toLowerCase()}</Pill>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<KeyRound size={13} />}
                  onClick={() => resetPassword.mutate(user.id)}
                  disabled={resetPassword.isPending}
                >
                  Reset password
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {reset ? (
        <TempPasswordModal created={reset} title="Password reset" onClose={() => setReset(null)} />
      ) : null}
    </div>
  );
}

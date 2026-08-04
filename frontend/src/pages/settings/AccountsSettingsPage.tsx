import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Search } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@vig/shared';
import { errorMessage, get, post } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Layout';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Pill } from '@/components/ui/Chip';
import { TempPasswordModal } from '../admin/teachers/TeachersPage';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  status: string;
  mustChangePassword: boolean;
}

/**
 * Every sign-in account, and the admin-mediated password reset (D2).
 *
 * This is where a forgotten password ends up. Somebody who cannot get in asks
 * from the sign-in screen; that raises a notification for every administrator,
 * and the notification links straight here with the account highlighted. The
 * admin resets it, reads the temporary password once, and hands it over
 * directly — there is no email or SMS channel to send it down.
 */
export function AccountsSettingsPage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
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
      // Resetting clears the outstanding request, so the badge goes with it.
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['attention'] });
      await refetch();
      setReset(result);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Arriving from a password-reset notification highlights that account.
  const highlighted = params.get('reset');

  const needle = query.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (user) =>
      !needle ||
      user.fullName.toLowerCase().includes(needle) ||
      user.username.toLowerCase().includes(needle),
  );

  return (
    <Section title="Accounts">
      <p className="mb-4 text-sm text-ink-2">
        Sign-in accounts for administrators, teachers and parents. Resetting shows a temporary
        password once — pass it to them directly, and they replace it when they next sign in.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <Search size={15} className="shrink-0 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
          aria-label="Search accounts"
        />
      </div>

      {error ? <p className="mb-3 text-xs text-danger">{error}</p> : null}

      {isLoading ? (
        <LoadingState rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={24} />}
          title="No matching accounts"
          description="Try a different name or username."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((user) => (
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
                <Pill token={user.status === 'ACTIVE' ? 'green' : 'muted'}>
                  {user.status.toLowerCase()}
                </Pill>

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
    </Section>
  );
}

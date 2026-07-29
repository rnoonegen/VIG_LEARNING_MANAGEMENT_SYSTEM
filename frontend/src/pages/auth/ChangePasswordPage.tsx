import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ShieldCheck, X } from 'lucide-react';
import type { SessionUser } from '@vig/shared';
import { homeRouteFor, useAuth } from '@/app/AuthProvider';
import { errorMessage, post } from '@/lib/api';
import { AuthLayout } from './AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { cn } from '@/lib/ui';

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'Contains a letter', test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: 'Contains a number', test: (v: string) => /[0-9]/.test(v) },
];

/**
 * First login forces a password replacement (F1). Every other route is blocked
 * server-side until this succeeds, so this screen is genuinely a gate, not a
 * suggestion.
 */
export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passed = useMemo(() => RULES.map((r) => r.test(newPassword)), [newPassword]);
  const allPassed = passed.every(Boolean);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  if (!user) return <Navigate to="/login" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await post<SessionUser>('/auth/change-password', {
        newPassword,
        confirmPassword,
      });
      setUser(updated);
      navigate(homeRouteFor(updated), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create a new password"
      subtitle={
        user.mustChangePassword
          ? 'For your security, please create your own password before continuing.'
          : 'Choose a new password for your account.'
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Username">
          <Input value={user.username} readOnly disabled className="bg-lavender-2" />
        </Field>

        <Field label="New password" htmlFor="newPassword" required>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <ul className="flex flex-col gap-1.5">
          {RULES.map((rule, i) => (
            <li
              key={rule.label}
              className={cn('flex items-center gap-2 text-xs', passed[i] ? 'text-success' : 'text-ink-3')}
            >
              {passed[i] ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
              {rule.label}
            </li>
          ))}
        </ul>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          required
          error={confirmPassword && !matches ? 'Passwords do not match' : null}
        >
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            invalid={Boolean(confirmPassword) && !matches}
            required
          />
        </Field>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth disabled={submitting || !allPassed || !matches}>
          {submitting ? 'Updating…' : 'Update Password'}
        </Button>

        <p className="flex items-start gap-2 rounded-[12px] bg-lavender-2 px-3 py-2.5 text-xs text-ink-2">
          <ShieldCheck size={15} className="mt-px shrink-0 text-violet" />
          Use at least 8 characters with a mix of letters and numbers.
        </p>
      </form>
    </AuthLayout>
  );
}

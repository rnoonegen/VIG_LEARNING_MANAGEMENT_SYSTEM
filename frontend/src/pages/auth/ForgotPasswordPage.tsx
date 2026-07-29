import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { post } from '@/lib/api';
import { AuthLayout } from './AuthLayout';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/**
 * Forgot password is an operational issue, not an auth channel (D2).
 *
 * There is no email or SMS: the request raises a notification to every admin,
 * who resets the password and passes the temporary one on out of band. The
 * confirmation is identical whether or not the username exists.
 */
export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await post('/auth/forgot-password', { username: username.trim() });
    } catch {
      // The confirmation is deliberately unconditional.
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Request sent" subtitle="Your administrator will be in touch">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
            <CheckCircle2 size={26} />
          </div>
          <p className="text-sm text-ink-2">
            If that account exists, your school administrator has been notified. They will reset your
            password and share a new temporary one with you directly.
          </p>
          <ButtonLink to="/login" variant="secondary" fullWidth>
            Back to sign in
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Need help signing in?"
      subtitle="Tell us your username and we'll notify your administrator"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Username"
          htmlFor="username"
          required
          hint="Your school administrator will reset the password and pass it to you directly."
        >
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="priya"
            required
          />
        </Field>

        <Button type="submit" fullWidth disabled={submitting || !username}>
          {submitting ? 'Sending…' : 'Request a reset'}
        </Button>

        <Link to="/login" className="text-center text-xs font-medium text-violet hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}

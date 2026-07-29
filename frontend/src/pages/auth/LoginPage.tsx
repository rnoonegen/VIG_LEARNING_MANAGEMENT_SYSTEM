import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, HelpCircle, User } from 'lucide-react';
import { homeRouteFor, useAuth } from '@/app/AuthProvider';
import { errorMessage } from '@/lib/api';
import { AuthLayout } from './AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/**
 * Username and password, no OTP (Flow 08).
 *
 * The failure message is deliberately generic — it never reveals whether the
 * username exists, which is the same guarantee the API makes server-side.
 */
export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeRouteFor(user)} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await signIn(username.trim(), password);
      navigate(homeRouteFor(signedIn), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Username or password is incorrect.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to Valmiki LMS"
      footer={
        <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-card px-4 py-3">
          <HelpCircle size={16} className="mt-0.5 shrink-0 text-violet" />
          <p className="text-xs text-ink-2">
            <Link to="/forgot-password" className="font-medium text-violet hover:underline">
              Need help accessing your account?
            </Link>
            <br />
            Contact your school administrator.
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Username" htmlFor="username" required>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="priya"
              invalid={Boolean(error)}
              className="pl-9"
              required
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              invalid={Boolean(error)}
              className="pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:bg-lavender"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        ) : null}

        <Button type="submit" fullWidth disabled={submitting || !username || !password}>
          {submitting ? 'Signing in…' : error ? 'Try Again' : 'Log In'}
        </Button>
      </form>
    </AuthLayout>
  );
}

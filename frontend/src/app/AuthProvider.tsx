import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginResult, SessionUser } from '@vig/shared';
import { get, post, tokens } from '@/lib/api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<SessionUser>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: SessionUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on boot. A stale token simply resolves to signed-out.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!tokens.access) {
        setLoading(false);
        return;
      }
      try {
        const me = await get<SessionUser>('/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        tokens.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await post<LoginResult>('/auth/login', { username, password });
    tokens.set(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await post('/auth/logout');
    } catch {
      // Signing out locally must succeed even if the server call does not.
    }
    tokens.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await get<SessionUser>('/auth/me'));
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refreshUser, setUser }),
    [user, loading, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The landing route for each role after sign-in. */
export function homeRouteFor(user: SessionUser): string {
  if (user.mustChangePassword) return '/change-password';
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'TEACHER') return '/teacher';
  return '/parent';
}

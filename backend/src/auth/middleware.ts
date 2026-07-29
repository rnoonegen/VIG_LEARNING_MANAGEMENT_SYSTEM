import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@vig/shared';
import { prisma } from '../prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { AuthContext } from '../types/express.js';

/**
 * Token → Supabase user id, cached briefly.
 *
 * Verifying with Supabase is a network call, so the *identity* half is cached for
 * a minute. The role/status half is always re-read from our own database
 * (AD-03), which is what makes disabling a user take effect on their next
 * request rather than at token expiry.
 */
const identityCache = new Map<string, { userId: string; expiresAt: number }>();
const IDENTITY_TTL_MS = 60_000;

async function resolveUserId(accessToken: string): Promise<string> {
  const cached = identityCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) return cached.userId;

  const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
  if (error || !data.user) throw unauthorized('Your session has expired. Please sign in again.');

  identityCache.set(accessToken, { userId: data.user.id, expiresAt: Date.now() + IDENTITY_TTL_MS });
  // Keep the cache from growing without bound in a long-lived process.
  if (identityCache.size > 500) {
    for (const [k, v] of identityCache) if (v.expiresAt <= Date.now()) identityCache.delete(k);
  }
  return data.user.id;
}

export function forgetToken(accessToken: string): void {
  identityCache.delete(accessToken);
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Populates `req.auth`. Rejects missing tokens and non-active users. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = bearerFrom(req);
    if (!token) return next(unauthorized());

    const userId = await resolveUserId(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        status: true,
        mustChangePassword: true,
        teacher: { select: { id: true } },
        parent: { select: { id: true } },
      },
    });

    if (!user) return next(unauthorized('This account is no longer available.'));
    if (user.status !== 'ACTIVE') return next(forbidden('This account has been deactivated.'));

    const auth: AuthContext = {
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as Role,
      mustChangePassword: user.mustChangePassword,
      teacherId: user.teacher?.id ?? null,
      parentId: user.parent?.id ?? null,
    };
    req.auth = auth;
    next();
  })().catch(next);
};

/**
 * Blocks every route until a temporary password has been replaced (F1).
 * Mounted after requireAuth and before the feature routers; the auth router
 * mounts ahead of it so change-password and logout stay reachable.
 */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword) {
    return next(
      forbidden('Please create a new password before continuing.'),
    );
  }
  next();
};

/** Server-side role authorization. The client's claimed role is never consulted. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(forbidden('Your role does not have access to this area.'));
    }
    next();
  };
}

/** Convenience accessor for handlers that run behind requireAuth. */
export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

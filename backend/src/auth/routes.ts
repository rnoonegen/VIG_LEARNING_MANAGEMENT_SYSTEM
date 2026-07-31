import { Router } from 'express';
import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  updateSettingsSchema,
  USER_STATUSES,
} from '@vig/shared';
import { z } from 'zod';
import { handler, ok, validateBody } from '../lib/http.js';
import { rateLimit } from '../lib/rateLimit.js';
import { prisma } from '../prisma.js';
import { auth, forgetToken, requireAuth, requireRole } from './middleware.js';
import * as service from './service.js';

export const authRouter = Router();

/**
 * These routes sit ahead of the forced-password-change gate on purpose: a user
 * who must replace a temporary password still needs to sign in, read /me and
 * post the new password.
 */

authRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 30, message: 'Too many sign-in attempts. Try again shortly.' }),
  validateBody(loginSchema),
  handler(async (req, res) => {
    const result = await service.login(req.body.username, req.body.password);
    return ok(res, result);
  }),
);

authRouter.post(
  '/refresh',
  validateBody(z.object({ refreshToken: z.string().min(1) })),
  handler(async (req, res) => ok(res, await service.refresh(req.body.refreshToken))),
);

authRouter.post(
  '/logout',
  handler(async (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) forgetToken(header.slice(7).trim());
    return ok(res, { ok: true });
  }),
);

authRouter.post(
  '/forgot-password',
  rateLimit({ windowMs: 60 * 60_000, max: 5 }),
  validateBody(forgotPasswordSchema),
  handler(async (req, res) => {
    await service.requestPasswordReset(req.body.username);
    // Always the same answer, whether or not the username exists (AD-09).
    return ok(res, {
      message: 'If that account exists, your school administrator has been notified.',
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => ok(res, await service.toSessionUser(auth(req).userId))),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  handler(async (req, res) => {
    await service.changePassword(auth(req).userId, req.body.newPassword);
    return ok(res, await service.toSessionUser(auth(req).userId));
  }),
);

authRouter.patch(
  '/settings',
  requireAuth,
  validateBody(updateSettingsSchema),
  handler(async (req, res) => {
    await prisma.user.update({ where: { id: auth(req).userId }, data: req.body });
    return ok(res, await service.toSessionUser(auth(req).userId));
  }),
);

// ---------------------------------------------------------------------------
// Admin user administration
// ---------------------------------------------------------------------------

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireRole('ADMIN'));

adminUsersRouter.get(
  '/',
  handler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });
    return ok(res, users);
  }),
);

adminUsersRouter.post(
  '/',
  validateBody(createUserSchema),
  handler(async (req, res) => {
    const { user, tempPassword } = await service.createUser({
      username: req.body.username,
      fullName: req.body.fullName,
      role: req.body.role,
      actorId: auth(req).userId,
    });
    // The temporary password appears here and nowhere else.
    return ok(
      res,
      { id: user.id, username: user.username, fullName: user.fullName, role: user.role, tempPassword },
      undefined,
      201,
    );
  }),
);

adminUsersRouter.patch(
  '/:id/status',
  validateBody(z.object({ status: z.enum(USER_STATUSES) })),
  handler(async (req, res) => {
    const result = await service.setUserStatus(req.params.id, req.body.status, auth(req).userId);
    // `credentials` is present only when an account was switched back on, and is
    // the only time that password is ever visible.
    return ok(res, { id: result.user.id, status: result.user.status, credentials: result.credentials });
  }),
);

adminUsersRouter.post(
  '/:id/reset-password',
  handler(async (req, res) => ok(res, await service.resetPassword(req.params.id, auth(req).userId))),
);

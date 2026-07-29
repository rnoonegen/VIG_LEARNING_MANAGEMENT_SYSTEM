import { Router } from 'express';
import { handler, ok } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './service.js';
import { computeAttention } from './attention.js';

export const homeRouter = Router();

homeRouter.get(
  '/admin',
  requireRole('ADMIN'),
  handler(async (req, res) => ok(res, await service.getAdminHome(auth(req).fullName))),
);

homeRouter.get(
  '/teacher',
  requireRole('TEACHER', 'ADMIN'),
  handler(async (req, res) => {
    const ctx = auth(req);
    const teacherId = ctx.teacherId ?? (req.query.teacherId as string | undefined);
    if (!teacherId) throw forbidden('No teaching profile is linked to this account.');
    return ok(res, await service.getTeacherHome(teacherId, ctx.fullName));
  }),
);

export const attentionRouter = Router();

attentionRouter.get(
  '/',
  requireRole('ADMIN'),
  handler(async (_req, res) => ok(res, await computeAttention())),
);

export const setupRouter = Router();

setupRouter.get(
  '/progress',
  requireRole('ADMIN'),
  handler(async (_req, res) => ok(res, await service.getSetupProgress())),
);

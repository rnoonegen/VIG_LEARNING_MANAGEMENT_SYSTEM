import { Router } from 'express';
import { z } from 'zod';
import {
  createExceptionSchema,
  createTeacherSchema,
  putAvailabilitySchema,
  putCapabilitiesSchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './service.js';

export const teachersRouter = Router();

/** A teacher may read and edit their own record; only admins may touch others. */
function assertSelfOrAdmin(req: Parameters<typeof auth>[0], teacherId: string): void {
  const ctx = auth(req);
  if (ctx.role === 'ADMIN') return;
  if (ctx.role === 'TEACHER' && ctx.teacherId === teacherId) return;
  throw forbidden('You can only manage your own teaching profile.');
}

teachersRouter.get(
  '/',
  requireRole('ADMIN'),
  handler(async (_req, res) => ok(res, await service.listTeachers())),
);

teachersRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createTeacherSchema),
  handler(async (req, res) =>
    ok(res, await service.createTeacher(req.body, auth(req).userId), undefined, 201),
  ),
);

teachersRouter.get(
  '/:id',
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    return ok(res, await service.getTeacher(req.params.id));
  }),
);

teachersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(z.object({ fullName: z.string().min(1).optional(), notes: z.string().optional() })),
  handler(async (req, res) => ok(res, await service.updateTeacher(req.params.id, req.body))),
);

teachersRouter.put(
  '/:id/capabilities',
  requireRole('ADMIN'),
  validateBody(putCapabilitiesSchema),
  handler(async (req, res) =>
    ok(res, await service.putCapabilities(req.params.id, req.body.capabilities, auth(req).userId)),
  ),
);

teachersRouter.put(
  '/:id/availability',
  validateBody(putAvailabilitySchema),
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    return ok(res, await service.putAvailability(req.params.id, req.body.slots, auth(req).userId));
  }),
);

teachersRouter.post(
  '/:id/exceptions',
  validateBody(createExceptionSchema),
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    return ok(res, await service.addException(req.params.id, req.body, auth(req).userId), undefined, 201);
  }),
);

teachersRouter.delete(
  '/exceptions/:exceptionId',
  requireRole('ADMIN', 'TEACHER'),
  handler(async (req, res) => ok(res, await service.removeException(req.params.exceptionId))),
);

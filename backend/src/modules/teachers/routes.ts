import { Router } from 'express';
import {
  avatarUploadUrlSchema,
  createExceptionSchema,
  createTeacherSchema,
  putAvailabilitySchema,
  putCapabilitiesSchema,
  setAvatarSchema,
  setTeacherStatusSchema,
  updateTeacherSchema,
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

/**
 * The weekly pattern is the teacher's own statement of when they can work (F5),
 * so only they may write it. An admin reads it — and schedules inside it.
 */
function assertSelf(req: Parameters<typeof auth>[0], teacherId: string): void {
  const ctx = auth(req);
  if (ctx.role === 'TEACHER' && ctx.teacherId === teacherId) return;
  throw forbidden('Teachers set their own weekly availability.');
}

teachersRouter.get(
  '/',
  requireRole('ADMIN'),
  handler(async (_req, res) => ok(res, await service.listTeachers())),
);

/** Declared before POST '/' so a photo can be chosen before the account exists. */
teachersRouter.post(
  '/avatar-upload-url',
  requireRole('ADMIN'),
  validateBody(avatarUploadUrlSchema),
  handler(async (req, res) =>
    ok(res, await service.createAvatarUploadUrl(req.body.fileName, req.body.mimeType)),
  ),
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
  validateBody(updateTeacherSchema),
  handler(async (req, res) => ok(res, await service.updateTeacher(req.params.id, req.body, auth(req).userId))),
);

/**
 * Profile photo. The browser uploads to the signed URL directly and posts back
 * only the path; the bucket stays private and every read is a signed URL.
 */
teachersRouter.post(
  '/:id/avatar-upload-url',
  requireRole('ADMIN'),
  validateBody(avatarUploadUrlSchema),
  handler(async (req, res) =>
    ok(res, await service.createAvatarUploadUrl(req.body.fileName, req.body.mimeType, req.params.id)),
  ),
);

teachersRouter.put(
  '/:id/avatar',
  requireRole('ADMIN'),
  validateBody(setAvatarSchema),
  handler(async (req, res) =>
    ok(res, await service.setAvatar(req.params.id, req.body.storagePath, auth(req).userId)),
  ),
);

teachersRouter.delete(
  '/:id/avatar',
  requireRole('ADMIN'),
  handler(async (req, res) => ok(res, await service.removeAvatar(req.params.id, auth(req).userId))),
);

/** Deactivate or reactivate. There is no delete — see service.setTeacherStatus. */
teachersRouter.patch(
  '/:id/status',
  requireRole('ADMIN'),
  validateBody(setTeacherStatusSchema),
  handler(async (req, res) =>
    ok(res, await service.setTeacherStatus(req.params.id, req.body.status, auth(req).userId)),
  ),
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
    assertSelf(req, req.params.id);
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

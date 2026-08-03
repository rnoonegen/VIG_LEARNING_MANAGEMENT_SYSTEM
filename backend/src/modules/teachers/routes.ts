import { Router } from 'express';
import {
  avatarUploadUrlSchema,
  createExceptionSchema,
  createLeaveRequestSchema,
  createTeacherSchema,
  decideLeaveRequestSchema,
  leaveQuerySchema,
  monthKey,
  putAvailabilitySchema,
  putCapabilitiesSchema,
  setAvatarSchema,
  setTeacherStatusSchema,
  updateTeacherSchema,
  weekQuerySchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import * as service from './service.js';
import * as leave from './leave.js';
import * as attendance from './attendance.js';
import * as week from './week.js';

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
 * so only they may write it. An admin reads it — and schedules inside it. The
 * same applies to raising leave against it.
 */
function assertSelf(
  req: Parameters<typeof auth>[0],
  teacherId: string,
  message = 'Teachers set their own weekly availability.',
): void {
  const ctx = auth(req);
  if (ctx.role === 'TEACHER' && ctx.teacherId === teacherId) return;
  throw forbidden(message);
}

/**
 * The month being asked for, defaulting to the current one.
 *
 * Wall-clock months, like every other date in the school (BR-20).
 */
function askedMonth(value: unknown): string {
  if (value === undefined) return new Date().toISOString().slice(0, 7);
  const parsed = monthKey.safeParse(value);
  if (!parsed.success) throw badRequest('Expected a month in YYYY-MM form.');
  return parsed.data;
}

// --- Leave and attendance ---------------------------------------------------
//
// Declared before '/:id' so "leave" and "attendance" are never read as a
// teacher id.

/** Every teacher's leave, for the admin's review queue. */
teachersRouter.get(
  '/leave',
  requireRole('ADMIN'),
  handler(async (req, res) => {
    const query = leaveQuerySchema.parse(req.query);
    return ok(res, await leave.listLeave({ status: query.status }));
  }),
);

teachersRouter.patch(
  '/leave/:requestId',
  requireRole('ADMIN'),
  validateBody(decideLeaveRequestSchema),
  handler(async (req, res) =>
    ok(
      res,
      await leave.decideLeaveRequest(
        req.params.requestId,
        req.body.status,
        req.body.decisionNote,
        auth(req).userId,
      ),
    ),
  ),
);

/** A teacher withdraws their own pending request; an admin may revoke any. */
teachersRouter.delete(
  '/leave/:requestId',
  requireRole('ADMIN', 'TEACHER'),
  handler(async (req, res) => {
    const ctx = auth(req);
    return ok(
      res,
      await leave.deleteLeaveRequest(req.params.requestId, {
        role: ctx.role as 'ADMIN' | 'TEACHER',
        teacherId: ctx.teacherId,
        userId: ctx.userId,
      }),
    );
  }),
);

/** Every teacher's month, for the admin's attendance table. */
teachersRouter.get(
  '/attendance',
  requireRole('ADMIN'),
  handler(async (req, res) =>
    ok(res, await attendance.getMonthForAllTeachers(askedMonth(req.query.month))),
  ),
);

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

/**
 * Asking to be away. The teacher raises it; only an admin can answer it, which
 * is the whole difference between leave and the weekly pattern above.
 */
teachersRouter.post(
  '/:id/leave',
  validateBody(createLeaveRequestSchema),
  handler(async (req, res) => {
    assertSelf(req, req.params.id, 'Teachers request their own leave.');
    return ok(res, await leave.createLeaveRequest(req.params.id, req.body, auth(req).userId), undefined, 201);
  }),
);

teachersRouter.get(
  '/:id/leave',
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    return ok(res, await leave.listLeave({ teacherId: req.params.id }));
  }),
);

/**
 * The running week, dated. Both portals read the same one — the teacher
 * deciding whether to ask for leave, and the admin answering it.
 */
teachersRouter.get(
  '/:id/week',
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    const query = weekQuerySchema.safeParse(req.query);
    if (!query.success) throw badRequest('Expected a date in YYYY-MM-DD form.');
    return ok(res, await week.getTeacherWeek(req.params.id, query.data.week));
  }),
);

/** The month a teacher sees for themselves, and the admin sees for anybody. */
teachersRouter.get(
  '/:id/attendance',
  handler(async (req, res) => {
    assertSelfOrAdmin(req, req.params.id);
    return ok(res, await attendance.getTeacherMonth(req.params.id, askedMonth(req.query.month)));
  }),
);

teachersRouter.delete(
  '/exceptions/:exceptionId',
  requireRole('ADMIN', 'TEACHER'),
  handler(async (req, res) => ok(res, await service.removeException(req.params.exceptionId))),
);

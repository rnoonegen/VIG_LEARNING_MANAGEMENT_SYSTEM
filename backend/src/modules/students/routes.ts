import { Router } from 'express';
import {
  avatarUploadUrlSchema,
  createStudentSchema,
  putAvailabilitySchema,
  putParentAccessSchema,
  putSubjectLevelsSchema,
  setAvatarSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent } from '../../auth/guards.js';
import { getStudentTeaching } from '../scheduling/service.js';
import * as service from './service.js';

export const studentsRouter = Router();

const adminOnly = requireRole('ADMIN');

/**
 * Reads are scoped in the repository query, not filtered after the fact:
 * a teacher sees students in their classes, a parent sees linked children only.
 */
studentsRouter.get(
  '/',
  handler(async (req, res) => ok(res, await service.listStudents(auth(req)))),
);

studentsRouter.get(
  '/:id',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getStudent(req.params.id));
  }),
);

studentsRouter.get(
  '/:id/history',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getHistory(req.params.id));
  }),
);

/** Who teaches this child, and which of their subjects nobody is teaching yet. */
studentsRouter.get(
  '/:id/classes',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await getStudentTeaching(req.params.id));
  }),
);

/**
 * Profile photo. The browser uploads to the signed URL directly and posts back
 * only the path; the bucket stays private and every read is a signed URL.
 *
 * Declared before POST '/' so a photo can be attached while enrolling, before
 * the child has an id.
 */
studentsRouter.post(
  '/avatar-upload-url',
  adminOnly,
  validateBody(avatarUploadUrlSchema),
  handler(async (req, res) =>
    ok(res, await service.createAvatarUploadUrl(req.body.fileName, req.body.mimeType)),
  ),
);

studentsRouter.post(
  '/',
  adminOnly,
  validateBody(createStudentSchema),
  handler(async (req, res) => ok(res, await service.createStudent(req.body, auth(req).userId), undefined, 201)),
);

studentsRouter.put(
  '/:id/avatar',
  adminOnly,
  validateBody(setAvatarSchema),
  handler(async (req, res) =>
    ok(res, await service.setAvatar(req.params.id, req.body.storagePath, auth(req).userId)),
  ),
);

studentsRouter.delete(
  '/:id/avatar',
  adminOnly,
  handler(async (req, res) => ok(res, await service.removeAvatar(req.params.id, auth(req).userId))),
);

studentsRouter.patch(
  '/:id',
  adminOnly,
  validateBody(updateStudentSchema),
  handler(async (req, res) => ok(res, await service.updateStudent(req.params.id, req.body, auth(req).userId))),
);

studentsRouter.put(
  '/:id/subject-levels',
  adminOnly,
  validateBody(putSubjectLevelsSchema),
  handler(async (req, res) =>
    ok(res, await service.putSubjectLevels(req.params.id, req.body.subjectLevels, auth(req).userId)),
  ),
);

studentsRouter.put(
  '/:id/availability',
  adminOnly,
  validateBody(putAvailabilitySchema),
  handler(async (req, res) =>
    ok(res, await service.putAvailability(req.params.id, req.body.slots, auth(req).userId)),
  ),
);

studentsRouter.put(
  '/:id/parent-access',
  adminOnly,
  validateBody(putParentAccessSchema),
  handler(async (req, res) =>
    ok(res, await service.putParentAccess(req.params.id, req.body, auth(req).userId)),
  ),
);

studentsRouter.patch(
  '/:id/status',
  adminOnly,
  validateBody(updateStudentStatusSchema),
  handler(async (req, res) => ok(res, await service.setStatus(req.params.id, req.body.status, auth(req).userId))),
);

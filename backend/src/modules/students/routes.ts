import { Router } from 'express';
import {
  createStudentSchema,
  putAvailabilitySchema,
  putParentAccessSchema,
  putSubjectLevelsSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent, readableStudentIds } from '../../auth/guards.js';
import * as service from './service.js';

export const studentsRouter = Router();

const adminOnly = requireRole('ADMIN');

/**
 * Reads are scoped in the repository query, not filtered after the fact:
 * a teacher sees students in their classes, a parent sees linked children only.
 */
studentsRouter.get(
  '/',
  handler(async (req, res) => {
    const scope = await readableStudentIds(auth(req));
    return ok(res, await service.listStudents(scope));
  }),
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

studentsRouter.post(
  '/',
  adminOnly,
  validateBody(createStudentSchema),
  handler(async (req, res) => ok(res, await service.createStudent(req.body, auth(req).userId), undefined, 201)),
);

studentsRouter.patch(
  '/:id',
  adminOnly,
  validateBody(updateStudentSchema),
  handler(async (req, res) => ok(res, await service.updateStudent(req.params.id, req.body))),
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

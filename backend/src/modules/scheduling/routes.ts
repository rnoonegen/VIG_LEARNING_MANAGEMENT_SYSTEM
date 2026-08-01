import { Router } from 'express';
import {
  addClassStudentsSchema,
  applyMovesSchema,
  cancelOccurrenceSchema,
  confirmScheduleSchema,
  proposeMovesSchema,
  scheduleOptionsSchema,
  scheduleQuerySchema,
} from '@vig/shared';
import { handler, ok, validateBody, validateQuery } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import * as service from './service.js';

export const scheduleRouter = Router();

const adminOnly = requireRole('ADMIN');

/** Teachers see their own timetable; admins see the school's. */
scheduleRouter.get(
  '/',
  validateQuery(scheduleQuerySchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    const { from, to } = res.locals.query as { from: string; to: string };
    const teacherId = ctx.role === 'TEACHER' ? (ctx.teacherId ?? undefined) : undefined;
    return ok(res, await service.getSchedule(from, to, teacherId));
  }),
);

scheduleRouter.post(
  '/options',
  adminOnly,
  validateBody(scheduleOptionsSchema),
  handler(async (req, res) => ok(res, await service.findOptions(req.body, auth(req).userId))),
);

scheduleRouter.post(
  '/confirm',
  adminOnly,
  validateBody(confirmScheduleSchema),
  handler(async (req, res) => ok(res, await service.confirmSchedule(req.body, auth(req).userId), undefined, 201)),
);

scheduleRouter.post(
  '/change/propose',
  adminOnly,
  validateBody(proposeMovesSchema),
  handler(async (req, res) => ok(res, await service.proposeMoves(req.body.occurrenceIds))),
);

scheduleRouter.post(
  '/change/apply',
  adminOnly,
  validateBody(applyMovesSchema),
  handler(async (req, res) => ok(res, await service.applyMoves(req.body.moves, auth(req).userId))),
);

// --- Classes & occurrences --------------------------------------------------

export const classesRouter = Router();

classesRouter.get(
  '/:id',
  handler(async (req, res) => ok(res, await service.getClass(req.params.id))),
);

/**
 * Joining an existing class, rather than creating a second one for the same
 * subject, level and teacher. This is how a child assigned a new subject ends up
 * in front of the teacher who already teaches it.
 */
classesRouter.post(
  '/:id/students',
  adminOnly,
  validateBody(addClassStudentsSchema),
  handler(async (req, res) => ok(res, await service.addClassStudents(req.params.id, req.body, auth(req).userId))),
);

classesRouter.delete(
  '/:id/students/:studentId',
  adminOnly,
  handler(async (req, res) =>
    ok(res, await service.removeClassStudent(req.params.id, req.params.studentId, auth(req).userId)),
  ),
);

export const occurrencesRouter = Router();

occurrencesRouter.get(
  '/:id',
  handler(async (req, res) => ok(res, await service.getOccurrence(req.params.id))),
);

occurrencesRouter.post(
  '/:id/cancel',
  adminOnly,
  validateBody(cancelOccurrenceSchema),
  handler(async (req, res) =>
    ok(res, await service.cancelOccurrence(req.params.id, req.body.reason, auth(req).userId)),
  ),
);

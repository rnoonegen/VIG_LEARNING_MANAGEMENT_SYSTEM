import { Router } from 'express';
import { generateWeeklyUpdateSchema, publishWeeklyUpdateSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import * as service from './service.js';

export const weeklyRouter = Router();

/** Admin-facing: generate, review and publish. Parents read via /parent. */
weeklyRouter.use(requireRole('ADMIN'));

weeklyRouter.get(
  '/current-week',
  handler(async (_req, res) => ok(res, { weekStart: service.currentWeekStart() })),
);

weeklyRouter.get(
  '/students/:id',
  handler(async (req, res) => ok(res, await service.listForStudent(req.params.id, false))),
);

weeklyRouter.post(
  '/generate',
  validateBody(generateWeeklyUpdateSchema),
  handler(async (req, res) => ok(res, await service.generate(req.body.studentId, req.body.weekStart))),
);

weeklyRouter.post(
  '/generate-all',
  handler(async (req, res) => {
    const weekStart = (req.query.weekStart as string | undefined) ?? service.currentWeekStart();
    const results = await service.generateAll(weekStart);
    return ok(res, { generated: results.length, weekStart });
  }),
);

weeklyRouter.get(
  '/:id',
  handler(async (req, res) => ok(res, await service.getUpdate(req.params.id, { includeDrafts: true }))),
);

weeklyRouter.post(
  '/:id/publish',
  validateBody(publishWeeklyUpdateSchema),
  handler(async (req, res) =>
    ok(res, await service.publish(req.params.id, req.body.teacherNote, auth(req).userId)),
  ),
);

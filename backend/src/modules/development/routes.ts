import { Router } from 'express';
import { createDevelopmentAreaSchema, createObservationSchema, updateStageSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent } from '../../auth/guards.js';
import * as service from './service.js';

/** The school-wide catalogue of areas. */
export const developmentAreasRouter = Router();

developmentAreasRouter.get(
  '/areas',
  handler(async (_req, res) => ok(res, await service.listAreas())),
);

developmentAreasRouter.post(
  '/areas',
  requireRole('ADMIN'),
  validateBody(createDevelopmentAreaSchema),
  handler(async (req, res) => ok(res, await service.createArea(req.body), undefined, 201)),
);

/** Per-student development, mounted under /students/:id. */
export const studentDevelopmentRouter = Router();

studentDevelopmentRouter.get(
  '/:id/development',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getStudentDevelopment(req.params.id));
  }),
);

studentDevelopmentRouter.get(
  '/:id/development/:areaId',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getAreaEvidence(req.params.id, req.params.areaId));
  }),
);

studentDevelopmentRouter.post(
  '/:id/development/:areaId/observations',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(createObservationSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanReadStudent(ctx, req.params.id);
    const source = ctx.role === 'ADMIN' ? 'ADMIN_MANUAL' : 'TEACHER_MANUAL';
    return ok(
      res,
      await service.addObservation(req.params.id, req.params.areaId, req.body, ctx.userId, source),
      undefined,
      201,
    );
  }),
);

studentDevelopmentRouter.patch(
  '/:id/development/:areaId/stage',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(updateStageSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanReadStudent(ctx, req.params.id);
    return ok(res, await service.updateStage(req.params.id, req.params.areaId, req.body, ctx.userId));
  }),
);

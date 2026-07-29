import { Router } from 'express';
import { levelChangeSchema, updateSkillStatusSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent } from '../../auth/guards.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './service.js';

export const learningRouter = Router();

/** Mounted under /students/:id — reads are scoped, writes are staff-only. */

learningRouter.get(
  '/:id/learning',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getLearning(req.params.id));
  }),
);

learningRouter.get(
  '/:id/learning/history',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getLearningHistory(req.params.id));
  }),
);

learningRouter.get(
  '/:id/learning/:subjectId',
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    return ok(res, await service.getSubjectLearning(req.params.id, req.params.subjectId));
  }),
);

learningRouter.patch(
  '/:id/skills/:skillId',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(updateSkillStatusSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanReadStudent(ctx, req.params.id);
    const source = ctx.role === 'ADMIN' ? 'ADMIN_MANUAL' : 'TEACHER_MANUAL';
    return ok(
      res,
      await service.updateSkillStatus(req.params.id, req.params.skillId, req.body, ctx.userId, source),
    );
  }),
);

learningRouter.get(
  '/:id/level-change/preview',
  requireRole('ADMIN', 'TEACHER'),
  handler(async (req, res) => {
    await assertCanReadStudent(auth(req), req.params.id);
    const subjectId = String(req.query.subjectId ?? '');
    return ok(res, await service.levelChangePreview(req.params.id, subjectId));
  }),
);

/**
 * Level progression is a structural decision, so it stays with Admin (Q12).
 * Teachers move skill statuses; they do not move a child between levels.
 */
learningRouter.post(
  '/:id/level-change',
  requireRole('ADMIN'),
  validateBody(levelChangeSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    if (ctx.role !== 'ADMIN') throw forbidden('Only an administrator can change a student’s level.');
    return ok(res, await service.applyLevelChange(req.params.id, req.body, ctx.userId));
  }),
);

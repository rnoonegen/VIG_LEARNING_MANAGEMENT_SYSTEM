import { Router } from 'express';
import { z } from 'zod';
import { createMomentSchema, momentUploadUrlSchema, momentsQuerySchema } from '@vig/shared';
import { handler, ok, validateBody, validateQuery } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent, readableStudentIds } from '../../auth/guards.js';
import * as service from './service.js';

export const momentsRouter = Router();

momentsRouter.get(
  '/',
  validateQuery(momentsQuerySchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    const query = res.locals.query as { studentId?: string; subjectId?: string; mediaType: 'all' | 'photo' | 'video' };
    if (query.studentId) await assertCanReadStudent(ctx, query.studentId);

    const scope = await readableStudentIds(ctx);
    return ok(res, await service.listMoments({ scope, ...query }));
  }),
);

momentsRouter.post(
  '/upload-url',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(momentUploadUrlSchema),
  handler(async (req, res) => ok(res, await service.createUploadUrl(req.body.fileName, req.body.mimeType))),
);

momentsRouter.post(
  '/',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(createMomentSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    // A teacher may only tag students they actually teach.
    for (const studentId of req.body.studentIds) await assertCanReadStudent(ctx, studentId);
    return ok(res, await service.createMoment(req.body, ctx.userId), undefined, 201);
  }),
);

momentsRouter.get(
  '/:id',
  handler(async (req, res) => {
    const moment = await service.getMoment(req.params.id);
    // Reading a moment implies access to at least one tagged student.
    const ctx = auth(req);
    if (ctx.role !== 'ADMIN') {
      const scope = await readableStudentIds(ctx);
      const allowed = scope === 'ALL' || moment.students.some((s) => (scope as string[]).includes(s.id));
      if (!allowed) return ok(res, null, undefined, 403);
    }
    return ok(res, moment);
  }),
);

momentsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(
    z.object({
      title: z.string().min(1).optional(),
      caption: z.string().optional(),
      studentIds: z.array(z.string().uuid()).optional(),
    }),
  ),
  handler(async (req, res) => ok(res, await service.updateMoment(req.params.id, req.body))),
);

/** Per-student gallery, mounted under /students/:id. */
export const studentMomentsRouter = Router();

studentMomentsRouter.get(
  '/:id/moments',
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanReadStudent(ctx, req.params.id);
    const scope = await readableStudentIds(ctx);
    return ok(res, await service.listMoments({ scope, studentId: req.params.id }));
  }),
);

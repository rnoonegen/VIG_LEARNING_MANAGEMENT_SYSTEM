import { Router } from 'express';
import { z } from 'zod';
import { classRecordDraftSchema, dateKey, putAttendanceSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertTeacherOwnsOccurrence } from '../../auth/guards.js';
import { prisma } from '../../prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import * as service from './service.js';

export const occurrenceRecordRouter = Router();
export const classRecordsRouter = Router();
export const teacherRouter = Router();

/** Resolves the occurrence behind a record id, then applies the ownership check. */
async function assertOwnsRecord(req: Parameters<typeof auth>[0], recordId: string): Promise<void> {
  const record = await prisma.classRecord.findUnique({
    where: { id: recordId },
    select: { occurrenceId: true },
  });
  if (!record) throw notFound('Class record');
  await assertTeacherOwnsOccurrence(auth(req), record.occurrenceId);
}

// --- Occurrence-scoped -------------------------------------------------------

occurrenceRecordRouter.get(
  '/:id/context',
  handler(async (req, res) => {
    await assertTeacherOwnsOccurrence(auth(req), req.params.id);
    return ok(res, await service.getContext(req.params.id));
  }),
);

occurrenceRecordRouter.get(
  '/:id/attendance',
  handler(async (req, res) => {
    await assertTeacherOwnsOccurrence(auth(req), req.params.id);
    return ok(res, await service.getAttendance(req.params.id));
  }),
);

occurrenceRecordRouter.put(
  '/:id/attendance',
  requireRole('TEACHER', 'ADMIN'),
  validateBody(putAttendanceSchema),
  handler(async (req, res) => {
    await assertTeacherOwnsOccurrence(auth(req), req.params.id);
    return ok(res, await service.putAttendance(req.params.id, req.body.entries));
  }),
);

occurrenceRecordRouter.post(
  '/:id/record',
  requireRole('TEACHER', 'ADMIN'),
  handler(async (req, res) => {
    await assertTeacherOwnsOccurrence(auth(req), req.params.id);
    return ok(res, await service.openDraft(req.params.id, auth(req).userId), undefined, 201);
  }),
);

/**
 * Builds the reviewable draft.
 *
 * TODO(AI-PHASE-2): the same route serves the model-produced draft once
 * IClassNoteExtractor is swapped in container.ts — see docs/DEFERRED-AI.md §2.1.
 */
occurrenceRecordRouter.post(
  '/:id/record/draft',
  requireRole('TEACHER', 'ADMIN'),
  validateBody(classRecordDraftSchema),
  handler(async (req, res) => {
    await assertTeacherOwnsOccurrence(auth(req), req.params.id);
    return ok(res, await service.buildDraft(req.params.id, req.body));
  }),
);

// --- Record-scoped -----------------------------------------------------------

classRecordsRouter.get(
  '/:id',
  handler(async (req, res) => {
    await assertOwnsRecord(req, req.params.id);
    return ok(res, await service.getRecord(req.params.id));
  }),
);

classRecordsRouter.patch(
  '/:id',
  requireRole('TEACHER', 'ADMIN'),
  validateBody(classRecordDraftSchema.partial()),
  handler(async (req, res) => {
    await assertOwnsRecord(req, req.params.id);
    return ok(res, await service.patchDraft(req.params.id, req.body));
  }),
);

classRecordsRouter.post(
  '/:id/save',
  requireRole('TEACHER', 'ADMIN'),
  validateBody(classRecordDraftSchema),
  handler(async (req, res) => {
    await assertOwnsRecord(req, req.params.id);
    return ok(res, await service.saveRecord(req.params.id, req.body, auth(req).userId));
  }),
);

// --- Teacher queue -----------------------------------------------------------

teacherRouter.get(
  '/occurrences',
  requireRole('TEACHER', 'ADMIN'),
  handler(async (req, res) => {
    const ctx = auth(req);
    const parsed = z.object({ date: dateKey }).safeParse(req.query);
    const date = parsed.success ? parsed.data.date : new Date().toISOString().slice(0, 10);

    const teacherId = ctx.role === 'TEACHER' ? ctx.teacherId : (req.query.teacherId as string | undefined);
    if (!teacherId) throw forbidden('No teacher selected.');

    return ok(res, await service.teacherOccurrences(teacherId, date));
  }),
);

import { Router } from 'express';
import {
  createMomentCollectionSchema,
  createMomentEntrySchema,
  momentCollectionsQuerySchema,
  momentFoldersQuerySchema,
  momentUploadUrlSchema,
  updateMomentCollectionSchema,
  updateMomentEntrySchema,
} from '@vig/shared';
import { handler, ok, validateBody, validateQuery } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertCanReadStudent } from '../../auth/guards.js';
import * as service from './collections.service.js';

/**
 * Moments as a collection: a heading with one entry per child.
 *
 * Mounted on its own path rather than under /moments, which still serves the
 * flat class-record gallery. Reads are open to any signed-in role and scoped
 * inside the service; writes are the admin's and the teacher's.
 */
export const momentCollectionsRouter = Router();

const staffOnly = requireRole('ADMIN', 'TEACHER');

// --- Options behind the forms ------------------------------------------------
// Registered ahead of /:id so Express does not read "subjects" as an id.

momentCollectionsRouter.get(
  '/subjects',
  staffOnly,
  handler(async (req, res) => ok(res, await service.listSubjectOptions(auth(req)))),
);

momentCollectionsRouter.post(
  '/upload-url',
  staffOnly,
  validateBody(momentUploadUrlSchema),
  handler(async (req, res) =>
    ok(res, await service.createUploadUrl(req.body.fileName, req.body.mimeType)),
  ),
);

/**
 * The folders the Moments page opens on — one per subject, plus Others for the
 * admin. Open to every signed-in role; what is counted inside each is scoped in
 * the service, exactly as the list below it is.
 */
momentCollectionsRouter.get(
  '/folders',
  validateQuery(momentFoldersQuerySchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    const query = res.locals.query as { studentId?: string };
    if (query.studentId) await assertCanReadStudent(ctx, query.studentId);
    return ok(res, await service.listFolders(ctx, query));
  }),
);

// --- Collections -------------------------------------------------------------

momentCollectionsRouter.get(
  '/',
  validateQuery(momentCollectionsQuerySchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    const query = res.locals.query as {
      studentId?: string;
      subjectId?: string;
      from?: string;
      to?: string;
    };
    // Narrowing to a child is only allowed for a child the caller may read.
    if (query.studentId) await assertCanReadStudent(ctx, query.studentId);
    return ok(res, await service.listCollections(ctx, query));
  }),
);

momentCollectionsRouter.post(
  '/',
  staffOnly,
  validateBody(createMomentCollectionSchema),
  handler(async (req, res) =>
    ok(res, await service.createCollection(auth(req), req.body), undefined, 201),
  ),
);

momentCollectionsRouter.get(
  '/:id',
  handler(async (req, res) => ok(res, await service.getCollection(auth(req), req.params.id))),
);

momentCollectionsRouter.patch(
  '/:id',
  staffOnly,
  validateBody(updateMomentCollectionSchema),
  handler(async (req, res) =>
    ok(res, await service.updateCollection(auth(req), req.params.id, req.body)),
  ),
);

momentCollectionsRouter.delete(
  '/:id',
  staffOnly,
  handler(async (req, res) => {
    await service.deleteCollection(auth(req), req.params.id);
    return ok(res, { id: req.params.id });
  }),
);

/** Who is still free to add, and who is already in — the add form's list. */
momentCollectionsRouter.get(
  '/:id/students',
  staffOnly,
  handler(async (req, res) => ok(res, await service.listStudentOptions(auth(req), req.params.id))),
);

// --- Entries -----------------------------------------------------------------

/**
 * One filled-in form: an entry for each child it was written for, or one shared
 * entry naming them all — `kind` decides which (024).
 */
momentCollectionsRouter.post(
  '/:id/entries',
  staffOnly,
  validateBody(createMomentEntrySchema),
  handler(async (req, res) =>
    ok(res, await service.addEntries(auth(req), req.params.id, req.body), undefined, 201),
  ),
);

momentCollectionsRouter.patch(
  '/:id/entries/:entryId',
  staffOnly,
  validateBody(updateMomentEntrySchema),
  handler(async (req, res) =>
    ok(res, await service.updateEntry(auth(req), req.params.id, req.params.entryId, req.body)),
  ),
);

momentCollectionsRouter.delete(
  '/:id/entries/:entryId',
  staffOnly,
  handler(async (req, res) =>
    ok(res, await service.deleteEntry(auth(req), req.params.id, req.params.entryId)),
  ),
);

/**
 * One child's own entries, for their profile — mounted under /students, where
 * the rest of a child's record already lives.
 *
 * Open to every signed-in role, as the lists above are: `assertCanReadStudent`
 * settles whether this caller may look at this child at all, and the service
 * settles what they see once inside.
 */
export const studentMomentEntriesRouter = Router();

studentMomentEntriesRouter.get(
  '/:id/moment-entries',
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanReadStudent(ctx, req.params.id);
    return ok(res, await service.listStudentEntries(ctx, req.params.id));
  }),
);

import { Router } from 'express';
import { handler, ok } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import { assertParentLinkedToStudent } from '../../auth/guards.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './service.js';
import * as weekly from '../weekly/service.js';
import { getLearning, getSubjectLearning } from '../learning/service.js';
import { getAreaEvidence, getStudentDevelopment } from '../development/service.js';
import { listMoments } from '../moments/service.js';

export const parentRouter = Router();

parentRouter.use(requireRole('PARENT'));

/** Every route below re-checks the link; the role alone grants nothing. */
function parentId(req: Parameters<typeof auth>[0]): string {
  const id = auth(req).parentId;
  if (!id) throw forbidden('This account is not linked to a parent record.');
  return id;
}

parentRouter.get(
  '/children',
  handler(async (req, res) => ok(res, await service.listChildren(parentId(req)))),
);

parentRouter.get(
  '/home',
  handler(async (req, res) =>
    ok(res, await service.getHome(parentId(req), req.query.childId as string | undefined)),
  ),
);

parentRouter.get(
  '/students/:id/learning',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    return ok(res, await getLearning(req.params.id));
  }),
);

parentRouter.get(
  '/students/:id/learning/:subjectId',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    return ok(res, await getSubjectLearning(req.params.id, req.params.subjectId));
  }),
);

parentRouter.get(
  '/students/:id/development',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    return ok(res, await getStudentDevelopment(req.params.id));
  }),
);

parentRouter.get(
  '/students/:id/development/:areaId',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    return ok(res, await getAreaEvidence(req.params.id, req.params.areaId));
  }),
);

parentRouter.get(
  '/students/:id/moments',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    return ok(res, await listMoments({ scope: [req.params.id], studentId: req.params.id }));
  }),
);

// --- Weekly updates ---------------------------------------------------------

parentRouter.get(
  '/students/:id/weekly-updates',
  handler(async (req, res) => {
    await assertParentLinkedToStudent(auth(req), req.params.id);
    // Published only — a parent never sees a draft.
    return ok(res, await weekly.listForStudent(req.params.id, true));
  }),
);

parentRouter.get(
  '/weekly-updates/:id',
  handler(async (req, res) => {
    const update = await weekly.getUpdate(req.params.id);
    await assertParentLinkedToStudent(auth(req), update.studentId);
    return ok(res, update);
  }),
);

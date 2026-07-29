import { Router } from 'express';
import {
  createLevelSchema,
  createSkillSchema,
  createSubjectSchema,
  createTopicSchema,
  reorderSchema,
  updateCurriculumNodeSchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { requireRole } from '../../auth/middleware.js';
import * as service from './service.js';

export const curriculumRouter = Router();

// Teachers read the curriculum to pick skills during a class record; only admins
// shape it (§2 permission matrix).
const adminOnly = requireRole('ADMIN');

// --- Subjects ---------------------------------------------------------------

curriculumRouter.get(
  '/subjects',
  handler(async (req, res) => ok(res, await service.listSubjects(req.query.includeArchived === 'true'))),
);

curriculumRouter.get(
  '/subjects/:id',
  handler(async (req, res) => ok(res, await service.getSubject(req.params.id))),
);

curriculumRouter.post(
  '/subjects',
  adminOnly,
  validateBody(createSubjectSchema),
  handler(async (req, res) => ok(res, await service.createSubject(req.body), undefined, 201)),
);

curriculumRouter.patch(
  '/subjects/:id',
  adminOnly,
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => ok(res, await service.updateNode('subjects', req.params.id, req.body))),
);

// --- Levels -----------------------------------------------------------------

curriculumRouter.post(
  '/subjects/:id/levels',
  adminOnly,
  validateBody(createLevelSchema),
  handler(async (req, res) =>
    ok(res, await service.createLevel(req.params.id, req.body.name), undefined, 201),
  ),
);

curriculumRouter.get(
  '/levels/:id',
  handler(async (req, res) => ok(res, await service.getLevel(req.params.id))),
);

curriculumRouter.get(
  '/levels/:id/skills',
  handler(async (req, res) => ok(res, await service.skillsForLevel(req.params.id))),
);

curriculumRouter.patch(
  '/levels/:id',
  adminOnly,
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => ok(res, await service.updateNode('levels', req.params.id, req.body))),
);

// --- Topics -----------------------------------------------------------------

curriculumRouter.post(
  '/levels/:id/topics',
  adminOnly,
  validateBody(createTopicSchema),
  handler(async (req, res) =>
    ok(res, await service.createTopic(req.params.id, req.body.name), undefined, 201),
  ),
);

curriculumRouter.get(
  '/topics/:id',
  handler(async (req, res) => ok(res, await service.getTopic(req.params.id))),
);

curriculumRouter.patch(
  '/topics/:id',
  adminOnly,
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => ok(res, await service.updateNode('topics', req.params.id, req.body))),
);

// --- Skills -----------------------------------------------------------------

curriculumRouter.post(
  '/topics/:id/skills',
  adminOnly,
  validateBody(createSkillSchema),
  handler(async (req, res) => ok(res, await service.createSkill(req.params.id, req.body), undefined, 201)),
);

curriculumRouter.patch(
  '/skills/:id',
  adminOnly,
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => ok(res, await service.updateNode('skills', req.params.id, req.body))),
);

// --- Ordering & archiving ---------------------------------------------------

const REORDERABLE = ['subjects', 'levels', 'topics', 'skills'] as const;
type Reorderable = (typeof REORDERABLE)[number];

function isReorderable(value: string): value is Reorderable {
  return (REORDERABLE as readonly string[]).includes(value);
}

curriculumRouter.patch(
  '/:kind/reorder',
  adminOnly,
  validateBody(reorderSchema),
  handler(async (req, res) => {
    const { kind } = req.params;
    if (!isReorderable(kind)) return ok(res, { reordered: 0 });
    return ok(res, await service.reorder(kind, req.body.orderedIds));
  }),
);

curriculumRouter.post(
  '/:kind/:id/archive',
  adminOnly,
  handler(async (req, res) => {
    const { kind, id } = req.params;
    if (!isReorderable(kind)) return ok(res, { archived: false });
    return ok(res, await service.archiveNode(kind, id));
  }),
);

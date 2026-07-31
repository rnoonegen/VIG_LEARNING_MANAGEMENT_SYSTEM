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
import { auth, requireRole } from '../../auth/middleware.js';
import {
  assertCanAuthorLevel,
  assertCanAuthorSkill,
  assertCanAuthorTopic,
} from '../../auth/guards.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './service.js';

export const curriculumRouter = Router();

/**
 * Structure is the admin's: subjects and the four levels under each. Content is
 * the teacher's: the headings and sub-headings for the levels they are assigned.
 * The per-node guards in auth/guards.ts hold that line.
 */
const adminOnly = requireRole('ADMIN');

// --- The whole tree ---------------------------------------------------------

curriculumRouter.get(
  '/tree',
  handler(async (req, res) => {
    const ctx = auth(req);
    // A teacher's own curriculum view asks for ?mine=true.
    const onlyMine = req.query.mine === 'true';
    return ok(res, await service.getTree(ctx, onlyMine));
  }),
);

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
  handler(async (req, res) =>
    ok(res, await service.createSubject(req.body, auth(req).userId), undefined, 201),
  ),
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
  '/levels/:id/skills',
  handler(async (req, res) => ok(res, await service.skillsForLevel(req.params.id))),
);

curriculumRouter.patch(
  '/levels/:id',
  adminOnly,
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => ok(res, await service.updateNode('levels', req.params.id, req.body))),
);

// --- Headings ---------------------------------------------------------------

curriculumRouter.post(
  '/levels/:id/topics',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(createTopicSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanAuthorLevel(ctx, req.params.id);
    return ok(res, await service.createTopic(req.params.id, req.body.name, ctx.userId), undefined, 201);
  }),
);

curriculumRouter.patch(
  '/topics/:id',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => {
    await assertCanAuthorTopic(auth(req), req.params.id);
    return ok(res, await service.updateNode('topics', req.params.id, req.body));
  }),
);

// --- Sub-headings -----------------------------------------------------------

curriculumRouter.post(
  '/topics/:id/skills',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(createSkillSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    await assertCanAuthorTopic(ctx, req.params.id);
    return ok(res, await service.createSkill(req.params.id, req.body, ctx.userId), undefined, 201);
  }),
);

curriculumRouter.patch(
  '/skills/:id',
  requireRole('ADMIN', 'TEACHER'),
  validateBody(updateCurriculumNodeSchema),
  handler(async (req, res) => {
    await assertCanAuthorSkill(auth(req), req.params.id);
    return ok(res, await service.updateNode('skills', req.params.id, req.body));
  }),
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

/**
 * Removing is archiving (BR-17). A sub-heading a child has already been ticked
 * against cannot be deleted without deleting their history with it, so it is
 * hidden instead and stays queryable.
 */
curriculumRouter.post(
  '/:kind/:id/archive',
  requireRole('ADMIN', 'TEACHER'),
  handler(async (req, res) => {
    const { kind, id } = req.params;
    if (!isReorderable(kind)) return ok(res, { archived: false });

    const ctx = auth(req);
    if (kind === 'topics') await assertCanAuthorTopic(ctx, id);
    else if (kind === 'skills') await assertCanAuthorSkill(ctx, id);
    // Subjects and levels are structure: admin only.
    else if (ctx.role !== 'ADMIN') throw forbidden('Only an administrator can remove that.');

    return ok(res, await service.archiveNode(kind, id));
  }),
);

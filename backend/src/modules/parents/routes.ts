import { Router } from 'express';
import {
  avatarUploadUrlSchema,
  createParentSchema,
  putParentStudentsSchema,
  setAvatarSchema,
  setParentStatusSchema,
  updateParentSchema,
} from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth, requireRole } from '../../auth/middleware.js';
import * as service from './service.js';

/**
 * Parent administration. The parent-facing API lives in modules/parent —
 * this router is what the school uses to create and maintain those accounts.
 */
export const parentsRouter = Router();

parentsRouter.use(requireRole('ADMIN'));

parentsRouter.get(
  '/',
  handler(async (_req, res) => ok(res, await service.listParents())),
);

/** Children with no parent account yet — the only ones the picker may offer. */
parentsRouter.get(
  '/assignable-students',
  handler(async (req, res) =>
    ok(res, await service.listAssignableStudents(req.query.parentId as string | undefined)),
  ),
);

/** Declared before POST '/' so a photo can be chosen before the account exists. */
parentsRouter.post(
  '/avatar-upload-url',
  validateBody(avatarUploadUrlSchema),
  handler(async (req, res) =>
    ok(res, await service.createAvatarUploadUrl(req.body.fileName, req.body.mimeType)),
  ),
);

parentsRouter.get(
  '/:id',
  handler(async (req, res) => ok(res, await service.getParent(req.params.id))),
);

parentsRouter.post(
  '/',
  validateBody(createParentSchema),
  handler(async (req, res) => ok(res, await service.createParent(req.body, auth(req).userId), undefined, 201)),
);

parentsRouter.patch(
  '/:id',
  validateBody(updateParentSchema),
  handler(async (req, res) => ok(res, await service.updateParent(req.params.id, req.body, auth(req).userId))),
);

parentsRouter.put(
  '/:id/students',
  validateBody(putParentStudentsSchema),
  handler(async (req, res) =>
    ok(res, await service.putChildren(req.params.id, req.body.studentIds, req.body.relationship, auth(req).userId)),
  ),
);

parentsRouter.put(
  '/:id/avatar',
  validateBody(setAvatarSchema),
  handler(async (req, res) =>
    ok(res, await service.setAvatar(req.params.id, req.body.storagePath, auth(req).userId)),
  ),
);

parentsRouter.delete(
  '/:id/avatar',
  handler(async (req, res) => ok(res, await service.removeAvatar(req.params.id, auth(req).userId))),
);

/** Deactivate or reactivate. There is no delete — see service.setParentStatus. */
parentsRouter.patch(
  '/:id/status',
  validateBody(setParentStatusSchema),
  handler(async (req, res) =>
    ok(res, await service.setParentStatus(req.params.id, req.body.status, auth(req).userId)),
  ),
);

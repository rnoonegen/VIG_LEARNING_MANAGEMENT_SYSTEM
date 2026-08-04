import { Router } from 'express';
import { avatarUploadUrlSchema, setAvatarSchema, updateMyProfileSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth } from '../../auth/middleware.js';
import * as service from './service.js';

/**
 * Your own profile, whoever you are.
 *
 * Every route works on the caller's id from the session — there is no `:id`
 * here on purpose, so a teacher cannot reach a colleague's record and a parent
 * cannot reach another family's. No role check is needed for the same reason.
 */
export const profileRouter = Router();

profileRouter.get(
  '/',
  handler(async (req, res) => ok(res, await service.getMyProfile(auth(req).userId))),
);

profileRouter.patch(
  '/',
  validateBody(updateMyProfileSchema),
  handler(async (req, res) => ok(res, await service.updateMyProfile(auth(req).userId, req.body))),
);

profileRouter.post(
  '/avatar-upload-url',
  validateBody(avatarUploadUrlSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    return ok(res, await service.createAvatarUploadUrl(req.body.fileName, req.body.mimeType, ctx.role));
  }),
);

profileRouter.put(
  '/avatar',
  validateBody(setAvatarSchema),
  handler(async (req, res) => ok(res, await service.setMyAvatar(auth(req).userId, req.body.storagePath))),
);

profileRouter.delete(
  '/avatar',
  handler(async (req, res) => ok(res, await service.removeMyAvatar(auth(req).userId))),
);

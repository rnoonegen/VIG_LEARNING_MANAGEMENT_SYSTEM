import { Router } from 'express';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@vig/shared';
import { handler, ok, validateBody } from '../../lib/http.js';
import { auth } from '../../auth/middleware.js';
import * as service from './service.js';
import * as push from './push.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  handler(async (req, res) => {
    const userId = auth(req).userId;
    const [items, unread] = await Promise.all([service.list(userId), service.unreadCount(userId)]);
    return ok(res, items, { unread });
  }),
);

// --- Web push registration (D3 / F22) ---------------------------------------
// Registered before the '/:id' routes so 'push' is never read as an id.

notificationsRouter.get(
  '/push/status',
  handler(async (req, res) => ok(res, await push.status(auth(req).userId))),
);

notificationsRouter.post(
  '/push/subscribe',
  validateBody(pushSubscribeSchema),
  handler(async (req, res) => {
    await push.subscribe(auth(req).userId, req.body);
    return ok(res, { ok: true }, undefined, 201);
  }),
);

notificationsRouter.post(
  '/push/unsubscribe',
  validateBody(pushUnsubscribeSchema),
  handler(async (req, res) => {
    await push.unsubscribe(auth(req).userId, req.body.endpoint);
    return ok(res, { ok: true });
  }),
);

notificationsRouter.patch(
  '/:id/read',
  handler(async (req, res) => {
    await service.markRead(auth(req).userId, req.params.id);
    return ok(res, { ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  handler(async (req, res) => {
    await service.markAllRead(auth(req).userId);
    return ok(res, { ok: true });
  }),
);

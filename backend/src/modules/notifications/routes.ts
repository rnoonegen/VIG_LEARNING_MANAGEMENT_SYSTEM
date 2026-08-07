import { Router } from 'express';
import { pushSubscribeSchema, pushUnsubscribeSchema, updateNotificationPrefsSchema } from '@vig/shared';
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

/**
 * Just the badge.
 *
 * The shell polls this every minute for every signed-in person; it used to pull
 * the full hundred-row list and count client-side, which is a lot of student
 * names crossing the wire to render one dot. The count is also the mute-aware
 * number — a client counting rows itself cannot know the account is muted.
 */
notificationsRouter.get(
  '/unread-count',
  handler(async (req, res) => ok(res, { unread: await service.unreadCount(auth(req).userId) })),
);

// --- The account's notify-me switch -----------------------------------------
// Same route for all three roles: the caller's id comes from the session, so
// nobody can read or change anybody else's preference.

notificationsRouter.get(
  '/preferences',
  handler(async (req, res) => ok(res, await service.getPreferences(auth(req).userId))),
);

notificationsRouter.patch(
  '/preferences',
  validateBody(updateNotificationPrefsSchema),
  handler(async (req, res) => ok(res, await service.setPreferences(auth(req).userId, req.body))),
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

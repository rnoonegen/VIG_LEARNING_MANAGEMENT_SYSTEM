import type { PushStatusDto, PushSubscribeInput } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { env } from '../../env.js';
import { notificationsEnabled } from './service.js';

/**
 * Web push (D3 / F22).
 *
 * The subscription estate is built now; *delivery* stays behind
 * FEATURE_WEB_PUSH. That split is deliberate: registering subscriptions from
 * day one means the flag flip is a one-line change against a warm set of
 * devices, instead of a launch where nobody is subscribed yet.
 *
 * The in-app notification centre is the launch channel and is unaffected by
 * any of this — `deliver()` is strictly additive to a row that has already
 * been written by notifications/service.ts.
 */

export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export async function status(userId: string): Promise<PushStatusDto> {
  const subscriptions = await prisma.pushSubscription.count({ where: { userId } });
  return {
    enabled: env.FEATURE_WEB_PUSH && pushConfigured(),
    // The public key is safe to hand out — that is its purpose.
    publicKey: env.VAPID_PUBLIC_KEY ?? null,
    subscriptions,
  };
}

/**
 * Idempotent by endpoint: a browser that re-subscribes (key rotation, permission
 * re-grant) updates its row rather than adding a duplicate device.
 */
export async function subscribe(userId: string, input: PushSubscribeInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    },
    // Re-binds the endpoint to the current user — shared devices are real in
    // a small school, and a stale owner would leak the wrong child's update.
    update: {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * Sends a push to every device a user has registered.
 *
 * No-ops unless the flag is on AND a keypair exists. The `web-push` library is
 * not a dependency of this build — wiring it is the flagged follow-up (M13),
 * and this function is the single place that changes.
 *
 * Also no-ops for an account that has turned notifications off in Settings.
 * That check belongs here rather than at each caller: this is the only place a
 * device is actually interrupted, so it is the only place that can honour the
 * switch for every sender, including the ones written after it.
 */
export async function deliver(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<{ sent: number; skipped: boolean }> {
  if (!env.FEATURE_WEB_PUSH || !pushConfigured()) return { sent: 0, skipped: true };
  if (!(await notificationsEnabled(userId))) return { sent: 0, skipped: true };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { sent: 0, skipped: false };

  // TODO(WEB-PUSH): swap this for webpush.sendNotification(sub, JSON.stringify(payload))
  // once `web-push` is added and VAPID keys are provisioned. Expired endpoints
  // return 404/410 and should be deleted here.
  console.info(
    `[push] FEATURE_WEB_PUSH on but no transport wired — would send "${payload.title}" to ${subs.length} device(s) for ${userId}`,
  );

  await prisma.pushSubscription.updateMany({
    where: { userId },
    data: { lastUsedAt: new Date() },
  });

  return { sent: subs.length, skipped: false };
}

import { post } from './api';

/**
 * PWA runtime helpers (F22 / D3).
 *
 * Registration is best-effort by design: the app is fully usable without a
 * service worker, so every failure here degrades to "no offline shell, no
 * install prompt" and never blocks sign-in.
 */

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SW_URL = '/sw.js';

export function serviceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerSupported()) return null;

  if (import.meta.env.DEV) {
    // Declining to register is not enough. A worker registered once — by a
    // production build, a preview, a colleague's deploy on the same port —
    // keeps controlling this origin afterwards, and it serves /src/*.tsx
    // cache-first. The result is a tab that boots last week's app while the
    // HMR-connected tab beside it shows today's, which reads as "my change did
    // not apply" and costs an afternoon. So dev actively clears it.
    await unregisterServiceWorkers();
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch (error) {
    console.warn('[pwa] service worker registration failed', error);
    return null;
  }
}

/** Best-effort teardown: an unusable dev session is worse than no offline shell. */
async function unregisterServiceWorkers(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return;

    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('vig-')).map((key) => caches.delete(key)));
    }
    console.info('[pwa] removed a stale service worker left over from a production build');
  } catch (error) {
    console.warn('[pwa] could not remove the existing service worker', error);
  }
}

// --- Push subscription ------------------------------------------------------

export interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
  subscriptions: number;
}

export function pushSupported(): boolean {
  return serviceWorkerSupported() && 'PushManager' in window && 'Notification' in window;
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer rather than `Uint8Array.from`, because
 * applicationServerKey requires a plain (non-shared) buffer.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalised);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Asks for notification permission and registers this device with the API.
 *
 * Returns why it stopped rather than throwing, because every outcome here is a
 * normal thing a browser can do and the settings screen explains each one.
 */
export async function subscribeToPush(
  publicKey: string,
): Promise<'subscribed' | 'denied' | 'unsupported' | 'failed'> {
  if (!pushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      // Chrome refuses a subscription that is not user-visible.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'failed';

    await post('/notifications/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent.slice(0, 400),
    });

    return 'subscribed';
  } catch (error) {
    console.warn('[pwa] push subscribe failed', error);
    return 'failed';
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  // Tell the server first: a device that unsubscribes locally but stays in the
  // table would keep receiving sends that silently fail.
  await post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

export async function hasLocalPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  return Boolean(await registration.pushManager.getSubscription());
}

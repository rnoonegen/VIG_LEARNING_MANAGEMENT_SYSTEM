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
  // The dev server serves modules unbundled; a caching worker in front of that
  // fights HMR for no benefit.
  if (import.meta.env.DEV) return null;

  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch (error) {
    console.warn('[pwa] service worker registration failed', error);
    return null;
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

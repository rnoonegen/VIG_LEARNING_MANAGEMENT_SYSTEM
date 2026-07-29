/* eslint-env serviceworker */
/**
 * Valmiki LMS service worker (F22 / D3).
 *
 * Caching policy follows one locked rule from Flow 04: the product must never
 * pretend it has data it does not have, and must never imply offline editing.
 *
 *   navigation  → network first, falling back to the cached app shell. A parent
 *                 on a weak connection sees the app with an offline banner
 *                 rather than the browser's dinosaur.
 *   static      → cache first. Hashed Vite assets are immutable.
 *   /api/       → never cached, never intercepted. Stale school data (an old
 *                 timetable, a resolved conflict) is worse than no data, and
 *                 writes must not appear to succeed while queued.
 */

const VERSION = 'v1';
const SHELL_CACHE = `vig-shell-${VERSION}`;
const ASSET_CACHE = `vig-assets-${VERSION}`;

/** Enough to boot the SPA and show the offline page. */
const SHELL_ASSETS = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one 404 during development does not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('vig-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only — signed Supabase media URLs are short-lived by design and
  // caching them would hand back links that have already expired.
  if (url.origin !== self.location.origin) return;

  // The API is deliberately untouched. See the header comment.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match('/index.html')) ??
            (await cache.match('/offline.html')) ??
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Only cache successful, basic (same-origin) responses.
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});

// --- Web push (delivery is gated server-side by FEATURE_WEB_PUSH) ------------

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Valmiki LMS', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Valmiki LMS', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
      // A weekly update is not urgent enough to interrupt; it waits to be seen.
      requireInteraction: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab when there is one rather than piling up windows.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Service worker version. Bump on any change to STATIC_ASSETS, the
// fetch strategy, or after a deploy that you want to force-evict stale
// chunks from. The activate handler deletes every cache that doesn't
// match this name, so users on an older SW lose their cache on update.
const CACHE_NAME = 'friday-admin-v7';

// Best-effort static pre-cache. cache.addAll() is atomic — if ANY asset
// fails (e.g. 403 from misperm'd file on the server), the WHOLE install
// rejects and the SW gets stuck in `installing` state forever, queuing
// fetches and silently breaking the page. Use cache.add() per-asset
// with try/catch so individual failures don't poison the install.
//
// 2026-05-24 incident: deploys propagated 600-perm public/ assets to
// /var/www/fad/, nginx (www-data) returned 403 for offline.html +
// icon-*.png, cache.addAll rejected, SW install hung, fetches pending
// indefinitely, TeamInbox + thread history rendered empty even though
// backend returned correct data. Defense in depth: this loop + the
// chmod fix in rsync.
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: pre-cache static assets (best-effort per asset)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          // Asset failed to cache (404 / 403 / network). Log and skip;
          // do NOT let one bad asset break the whole install.
          // eslint-disable-next-line no-console
          console.warn('[sw] failed to pre-cache', url, err && err.message);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-only (GMS needs live data)
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Navigation requests: network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Static assets: network-first for all _next static (JS + CSS), cache-first for images/fonts
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Other static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Push notifications
function parsePushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch (err) {
    try {
      const body = event.data.text();
      return body ? { body } : {};
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushPayload(event);
  const extraData = data && typeof data.data === 'object' && data.data ? data.data : {};
  const title = data.title || 'Friday Admin';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'gms-notification',
    data: { ...extraData, url: data.url || extraData.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

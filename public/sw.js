/* ============================================================
   Service worker: makes StarShooter installable and usable offline
   ============================================================

   The app is a single-page shell plus a same-origin API, so the split is
   simple:
     - navigations: network first, falling back to the cached shell, so an
       offline launch still opens the app instead of a browser error page;
     - static assets: cache first, refreshed in the background;
     - /api: never cached. Marks, sessions and predictions must always be live,
       and a stale grade would be worse than an error.
   ============================================================ */

const VERSION = 'v3';
const SHELL_CACHE = `starshooter-shell-${VERSION}`;
const ASSET_CACHE = `starshooter-assets-${VERSION}`;

const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/logo.svg',
  '/fonts/plex-sans-var.woff2',
  '/fonts/plex-mono-400.woff2',
  '/fonts/plex-mono-500.woff2',
  '/fonts/newsreader.woff2',
  '/fonts/newsreader-italic.woff2',
  '/manifest.webmanifest',
  '/main.js',
  '/app.js',
  '/lib.js',
  '/cutoffs.js',
  '/data/cutoffs.json',
  '/actions.js',
  '/auth.js',
  '/timer.js',
  '/presets.js',
  '/views/desk.js',
  '/views/papers.js',
  '/views/focus.js',
  '/views/tasks.js',
  '/views/settings.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if one file 404s, so add individually.
      await Promise.all(
        SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Live data only. Never serve a cached score or session.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            new Response('Offline. Reconnect to open StarShooter.', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' }
            })
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      return hit || (await network) || new Response('', { status: 504 });
    })()
  );
});

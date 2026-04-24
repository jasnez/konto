/**
 * Konto service worker — minimal, hand-rolled.
 *
 * Scope & intent
 * --------------
 * This SW exists so that installing Konto to the home screen does not launch
 * into Chrome's generic "no internet" page. It is NOT an offline-first cache.
 * Finance data must be fresh — we never cache API/HTML pages for reads.
 *
 * Strategies
 * ----------
 *  • Navigation requests (mode === 'navigate'):
 *      network-first → on failure, serve `/offline.html` from cache.
 *  • Static build assets (`/_next/static/*`, `/icons/*`, fonts):
 *      cache-first, populated lazily on first hit.
 *  • Everything else (API, /auth, Supabase, POST, etc.):
 *      pass through untouched.
 *
 * Versioning
 * ----------
 * Cache name contains SW_VERSION. Bump it (or just redeploy — the SW byte
 * diff forces reinstall) to purge old caches. Activate handler deletes any
 * cache whose name does not match the current version.
 */

const SW_VERSION = 'v1';
const SHELL_CACHE = `konto-shell-${SW_VERSION}`;
const STATIC_CACHE = `konto-static-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';

const SHELL_ASSETS = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` ensures the precache does not itself come from HTTP cache.
      await cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/icons/')) return true;
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(url.pathname)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase, auth callbacks, or same-origin API routes.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/auth/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (err) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(OFFLINE_URL);
          return (
            cached ?? new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => {
              /* quota / opaque — ignore */
            });
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })(),
    );
  }
});

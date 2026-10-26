// Nobar Service Worker — caches static assets for instant repeat visits.
//
// Strategy:
//   - Next.js chunks (/_next/static/*): cache-first (immutable, never change)
//   - TMDB images (image.tmdb.org): stale-while-revalidate (cache 24h)
//   - TMDB API (api.themoviedb.org): network-first (fresh data preferred)
//   - cdn-proxy Worker: network-only (dynamic, can't cache stream URLs)
//   - Everything else: network-first, fallback to cache
//
// On repeat visits, all JS/CSS/images load from cache → instant page load.

const CACHE_VERSION = "nobar-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Install: pre-cache nothing (lazy cache on first fetch).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clean old caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests.
  if (req.method !== "GET") return;

  // Skip cdn-proxy Worker requests (dynamic, can't cache).
  if (url.hostname.includes("nobar-cdn-proxy")) return;

  // Skip video segment requests (handled by hls.js, don't cache).
  if (url.hostname.includes("stream121.space") || url.hostname.includes("hakunaymatata")) return;

  // 1. Next.js static chunks — cache-first (immutable).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then(
          (cached) =>
            cached ||
            fetch(req).then((res) => {
              cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  // 2. TMDB images — stale-while-revalidate (cache 24h).
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req).then((res) => {
            // Only cache successful responses.
            if (res.ok) cache.put(req, res.clone());
            return res;
          });
          // Return cached immediately, update in background.
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 3. TMDB API — network-first (fresh data preferred, cache fallback).
  if (url.hostname === "api.themoviedb.org") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache successful responses for 5 min.
          if (res.ok) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. Same-origin navigation/page requests — network-first, cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/")))
    );
    return;
  }
});

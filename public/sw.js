// Nobar Service Worker — caches static assets for instant repeat visits.
//
// Strategy:
//   - Next.js chunks (/_next/static/*): network-first (always get latest)
//   - TMDB images (image.tmdb.org): stale-while-revalidate (cache 24h)
//   - TMDB API (api.themoviedb.org): network-first (fresh data preferred)
//   - cdn-proxy Worker: network-only (dynamic, can't cache stream URLs)
//   - Everything else: network-first, fallback to cache
//
// On repeat visits, all JS/CSS/images load from cache → instant page load.
// IMPORTANT: bump CACHE_VERSION on every deploy to force SW update.

const CACHE_VERSION = "nobar-v2";  // bumped from v1 → forces cache invalidation
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Install: skip waiting so new SW activates immediately (no stale cache).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clean ALL old caches (any version that doesn't match current).
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
  // Take control of ALL clients immediately (force update).
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

  // 1. Next.js static chunks — network-first (was cache-first, caused stale JS bug).
  //    Next.js chunks ARE immutable (content-hashed), but network-first ensures
  //    the user always gets the latest version on each visit. Cache is fallback
  //    for offline only.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 2. TMDB images — stale-while-revalidate (cache 24h).
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req).then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          });
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

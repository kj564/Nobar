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

const CACHE_VERSION = "nobar-v3";  // v3: bcdnxw Referer injection via SW
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

  // 3. TMDB API — DO NOT intercept (let browser handle natively).
  //    The SW was intercepting TMDB API calls and returning undefined from
  //    caches.match() when there was no cached response — causing the fetch
  //    to fail with "Gagal memuat film". Browser's native fetch handles
  //    CORS + cache headers properly. SW should only cache static assets.
  if (url.hostname === "api.themoviedb.org") {
    return; // Don't call event.respondWith() — let browser handle natively
  }

  // 5. bcdnxw.hakunaymatata.com — inject Referer: mzfi.me (anti-leech bypass)
  // mzfi/movieboxhd stream URLs need Referer: https://mzfi.me/ to play.
  // <video> element sends page Referer (nobar.pages.dev) → bcdnxw returns 429.
  // SW intercepts bcdnxw requests → rewrites Referer to mzfi.me → 206 ✓
  if (url.hostname === "bcdnxw.hakunaymatata.com") {
    event.respondWith(
      fetch(req, {
        headers: {
          ...Object.fromEntries(req.headers.entries()),
          "Referer": "https://mzfi.me/",
          "Origin": "https://mzfi.me",
        },
        redirect: "follow",
      })
    );
    return;
  }

  // 6. Same-origin navigation/page requests — network-first, cache fallback.
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

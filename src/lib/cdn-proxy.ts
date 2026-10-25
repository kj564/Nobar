// ─────────────────────────────────────────────────────────────────────
// lib/cdn-proxy.ts — Client-side CDN proxy configuration
//
// For GitHub Pages deployment: the app is static (no /api/* routes).
// All server-side logic moves to a tiny CDN proxy service that returns
// only JSON (~8KB per movie). Video segments go directly from CDN to browser.
//
// Two deployment modes:
//   1. GitHub Pages (static) → Cloudflare Worker (e.g. https://nobar-cdn-proxy.workers.dev)
//      Set NEXT_PUBLIC_CDN_PROXY_URL to the Worker URL.
//   2. Dev (Caddy gateway) → CDN proxy on :3003 via XTransformPort
//      Uses relative paths with ?XTransformPort=3003 query param.
// ─────────────────────────────────────────────────────────────────────

// In static mode, set this to the Cloudflare Worker URL.
const CDN_PROXY_URL =
  process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";

// CDN proxy port (for dev mode via Caddy gateway)
const CDN_PROXY_PORT = "3003";

// Detect if we're running on GitHub Pages (static mode)
const isStaticMode =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("github.io") ||
    CDN_PROXY_URL.length > 0);

/**
 * Build the proxy URL for a given path.
 * - Static mode (GitHub Pages): uses CDN_PROXY_URL (Cloudflare Worker)
 * - Dev mode (Caddy gateway): uses relative path + XTransformPort
 */
function proxyUrl(path: string): string {
  if (isStaticMode && CDN_PROXY_URL) {
    return `${CDN_PROXY_URL}${path}`;
  }
  // Dev mode: relative path + XTransformPort (Caddy gateway)
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${CDN_PROXY_PORT}`;
}

/**
 * Resolve stream sources for a TMDB ID via CDN proxy.
 * Returns hls-direct sources (browser fetches directly from sacdn).
 */
export async function resolveStream(
  tmdbId: number,
  kind: "movie" | "tv" = "movie",
  season: number = 1,
  episode: number = 1
): Promise<{
  sources: Array<{
    quality: string;
    url: string;
    provider: string;
    type: string;
    auth?: { policy: string; signature: string; keyPairId: string };
  }>;
  subtitles: Array<{ language: string; url: string }>;
}> {
  if (isStaticMode || true) {
    // Always use CDN proxy (works in both dev + static mode)
    const params = new URLSearchParams({
      kind,
      season: String(season),
      episode: String(episode),
    });
    const url = proxyUrl(`/vidlink/${tmdbId}?${params}`);
    const res = await fetch(url);
    if (!res.ok) return { sources: [], subtitles: [] };
    return res.json();
  }
}

/**
 * Resolve Idlix vidhide embed URL via CDN proxy.
 * Only used when vidlink HLS fails (fallback).
 */
export async function resolveIdlix(
  slug: string
): Promise<string | null> {
  const url = proxyUrl(`/idlix/${slug}`);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedUrl || null;
}

/**
 * Fetch mzfi catalog (trending + recommended) via CDN proxy.
 */
export async function fetchMzfiCatalog(): Promise<{
  trending: Array<{
    subjectId: string;
    title: string;
    year: string;
    genre: string;
    imdbRating: string;
    posterUrl: string;
    subjectType: number;
  }>;
  recommended: Array<any>;
}> {
  const url = proxyUrl("/mzfi/catalog");
  const res = await fetch(url);
  if (!res.ok) return { trending: [], recommended: [] };
  return res.json();
}

/**
 * Build Idlix slug from title + year.
 * Used client-side to construct the slug for resolveIdlix.
 */
export function buildIdlixSlug(title: string, year: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[:;,\(\)\.\!\?]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}-${year}`;
}

export { isStaticMode };

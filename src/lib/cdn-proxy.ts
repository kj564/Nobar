const CDN_PROXY_URL = process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";
const CDN_PROXY_PORT = "3003";
const isStaticMode = typeof window !== "undefined" && (window.location.hostname.includes("github.io") || CDN_PROXY_URL.length > 0);

function proxyUrl(path: string): string {
  if (isStaticMode && CDN_PROXY_URL) return `${CDN_PROXY_URL}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${CDN_PROXY_PORT}`;
}

// ─── lk21 client-side resolver (no Nobar server needed) ──────────────
// Applies lk21's OWN approach: fetch encrypted config + AES key via CORS
// proxy, decrypt IN THE BROWSER via WebCrypto. The browser then plays
// the resolved HLS directly from putarin/lowhls9 (both CORS-open).
//
// Only loaded when we have a title (client-side resolution needs the
// movie title to search lk21's catalog). vidlink.pro uses TMDB IDs only,
// so this is the primary path when the user is on a movie detail page.
let resolveLk21Client: typeof import("./lk21-client").resolveLk21Client | null = null;
async function getLk21Client() {
  if (!resolveLk21Client) {
    resolveLk21Client = (await import("./lk21-client")).resolveLk21Client;
  }
  return resolveLk21Client;
}

export async function resolveStream(
  tmdbId: number,
  kind: "movie" | "tv" = "movie",
  season: number = 1,
  episode: number = 1,
  title?: string,
  year?: string
): Promise<{
  sources: Array<{ quality: string; url: string; provider: string; type: string; auth?: any }>;
  subtitles: Array<{ language: string; url: string }>;
  embedUrl?: string | null;
}> {
  // ── PRIMARY: vidlink.pro via cdn-proxy Worker (reliable, server-side) ──
  // The Worker handles vidlink token mint + lk21 AES decryption + idlix scrape.
  // In static mode (CF Pages / GitHub Pages), NEXT_PUBLIC_CDN_PROXY_URL points
  // to the Worker; in dev, Next.js rewrites forward to localhost:3003.
  //
  // Client-side lk21 (via CORS proxy) is in lk21-client.ts but NOT used here —
  // public CORS proxies are dead (corsproxy.io 401, allorigins/codetabs timeout).
  // The Worker is the only reliable path.
  const params = new URLSearchParams({ kind, season: String(season), episode: String(episode) });
  const url = proxyUrl(`/vidlink/${tmdbId}?${params}`);
  const res = await fetch(url);
  if (!res.ok) {
    // vidlink failed entirely → try lk21 immediately (if we have title/year).
    const lk21 = await tryLk21(title, year, kind);
    if (lk21) return lk21;
    return { sources: [], subtitles: [], embedUrl: embedFallback(tmdbId, kind, season, episode) };
  }
  const data = await res.json();

  const hasHls = data.sources?.some((s: any) => s.type === "hls-direct");

  if (hasHls) {
    // HLS available → zero-egress ad-free path (hls.js direct from sacdn).
    return data;
  }

  // ── No HLS → try lk21 first (ad-free HLS from putarin) ──
  // lk21 returns CORS-open HLS that plays directly via hls.js — same zero-
  // egress path as vidlink HLS, but a different source. Skips all ads
  // because we never execute the putarin embed page's ad JS.
  const lk21 = await tryLk21(title, year, kind);
  if (lk21) return lk21;

  // ── lk21 didn't have it → try MP4-through-proxy (ad-free) ──
  // vidlink.pro returns MP4 sources on bcdn.hakunaymatata.com, which blocks
  // browser User-Agent (HTTP 428). We route MP4 through a proxy that fetches
  // with NO User-Agent header, so the browser can play the proxied URL directly.
  //
  // IMPORTANT: Cloudflare Worker can't proxy bcdn (it detects Cf-Worker/
  // Cdn-Loop headers → HTTP 427). So in production (static mode on CF Pages),
  // we use the Deno Deploy MP4 proxy instead (nobar-mp4-proxy.deno.dev).
  // In dev, we use the local cdn-proxy /mp4 endpoint (Bun, no CF headers).
  const mp4ProxyBase = isStaticMode
    ? "https://nobar-mp4-proxy.deno.dev"
    : "";
  const mp4Sources = (data.sources || [])
    .filter((s: any) => s.type === "mp4" && s.url)
    .map((s: any) => ({
      quality: s.quality,
      url: isStaticMode
        ? `${mp4ProxyBase}/mp4?url=${encodeURIComponent(s.url)}`
        : proxyUrl(`/mp4?url=${encodeURIComponent(s.url)}`),
      provider: s.provider || "vidlink.pro",
      type: "mp4",
    }));

  if (mp4Sources.length > 0) {
    return {
      sources: mp4Sources,
      subtitles: data.subtitles || [],
      embedUrl: null,
    };
  }

  // Last resort: vidlink.pro embed iframe (plays video, but HAS ADS).
  return { sources: [], subtitles: [], embedUrl: embedFallback(tmdbId, kind, season, episode) };
}

// Try lk21 resolver — returns null if not found or no title provided.
// Only attempts for movies (lk21 series support is incomplete — the
// dramamu.se redirect flow is harder to scrape reliably).
async function tryLk21(
  title?: string,
  year?: string,
  kind: "movie" | "tv" = "movie"
): Promise<null | {
  sources: Array<{ quality: string; url: string; provider: string; type: string; auth?: any }>;
  subtitles: Array<{ language: string; url: string }>;
  embedUrl?: string | null;
}> {
  if (!title || kind !== "movie") return null; // TV support TODO
  try {
    const params = new URLSearchParams({ title, kind, ...(year ? { year } : {}) });
    const url = proxyUrl(`/lk21/resolve?${params}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.sources?.length > 0) {
      console.log("[NOBAR] lk21 resolved:", data.sources[0].provider);
      return { sources: data.sources, subtitles: data.subtitles || [], embedUrl: null };
    }
  } catch (e) {
    console.warn("[NOBAR] lk21 resolve failed:", e);
  }
  return null;
}

function embedFallback(
  tmdbId: number,
  kind: "movie" | "tv",
  season: number,
  episode: number
): string {
  return kind === "tv"
    ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
    : `https://vidlink.pro/movie/${tmdbId}`;
}

export async function resolveIdlix(slug: string): Promise<string | null> {
  const url = proxyUrl(`/idlix/${slug}`);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedUrl || null;
}

export async function fetchMzfiCatalog(): Promise<any> {
  const url = proxyUrl("/mzfi/catalog");
  const res = await fetch(url);
  if (!res.ok) return { trending: [], recommended: [] };
  return res.json();
}

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

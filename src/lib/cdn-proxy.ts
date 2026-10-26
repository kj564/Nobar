const CDN_PROXY_URL = process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";
const CDN_PROXY_PORT = "3003";
const isStaticMode = typeof window !== "undefined" && (window.location.hostname.includes("github.io") || CDN_PROXY_URL.length > 0);

function proxyUrl(path: string): string {
  if (isStaticMode && CDN_PROXY_URL) return `${CDN_PROXY_URL}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${CDN_PROXY_PORT}`;
}

// Lazy-load mzfi embed resolver (iframe approach — works cross-origin).
let resolveMzfiEmbed: typeof import("./mzfi-client").resolveMzfiEmbed | null = null;
async function getMzfiClient() {
  if (!resolveMzfiEmbed) {
    resolveMzfiEmbed = (await import("./mzfi-client")).resolveMzfiEmbed;
  }
  return resolveMzfiEmbed;
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
  const lk21 = await tryLk21(title, year, kind);
  if (lk21) {
    const vidlinkSubs = (data.subtitles || []).filter((s: any) => s?.url);
    if (vidlinkSubs.length > 0) {
      console.log(`[NOBAR] Merged ${vidlinkSubs.length} vidlink subtitles into lk21 source`);
      return { ...lk21, subtitles: vidlinkSubs };
    }
    return lk21;
  }

  // ── lk21 didn't have it → try mzfi embed (iframe, same-origin to mzfi.me) ──
  // mzfi API is CORS-open for search (token from x-user header).
  // /subject/play needs cookie (same-origin only) — so we use iframe embed.
  // mzfi SPA play page plays video inside iframe (cookie works same-origin).
  // This is better than vidlink embed (mzfi has fewer ads).
  if (kind === "movie" && title) {
    try {
      const mzfiEmbed = await getMzfiClient();
      const mzfiUrl = await mzfiEmbed(title, year, kind);
      if (mzfiUrl) {
        console.log("[NOBAR] mzfi embed resolved:", mzfiUrl.slice(0, 60));
        const vidlinkSubs = (data.subtitles || []).filter((s: any) => s?.url);
        return { sources: [], subtitles: vidlinkSubs, embedUrl: mzfiUrl };
      }
    } catch (e) {
      console.warn("[NOBAR] mzfi resolve failed:", e);
    }
  }

  // ── lk21 didn't have it → try MP4-through-proxy (ad-free) ──
  // vidlink.pro returns MP4 sources on bcdn/bcdnxw.hakunaymatata.com, which
  // blocks browser User-Agent (HTTP 428) AND CF Worker headers (HTTP 427).
  //
  // ── lk21 didn't have it → try MP4 sources ──
  // bcdn. → proxied via CF Worker TCP socket (ad-free)
  // bcdnxw. → played DIRECTLY in browser (no proxy needed! <video> doesn't
  //   require CORS for media playback). CF Worker can't reach bcdnxw (427),
  //   but the browser CAN — bcdnxw blocks CF IPs, not user IPs.
  // other → try via Worker proxy
  const mp4ProxyPath = isStaticMode ? "/mp4-socket" : "/mp4";
  const mp4Sources = (data.sources || [])
    .filter((s: any) => s.type === "mp4" && s.url)
    .map((s: any) => {
      if (s.url.includes("bcdnxw.")) {
        // bcdnxw: play DIRECTLY in browser (no proxy).
        // <video> element doesn't need CORS for media playback.
        // bcdnxw blocks CF Worker IP (427) but accepts browser IP.
        console.log("[NOBAR] bcdnxw MP4 — playing directly in browser (no proxy):", s.quality);
        return {
          quality: s.quality,
          url: s.url, // direct URL, no proxy
          provider: s.provider || "vidlink.pro",
          type: "mp4",
        };
      }
      // bcdn. → proxy via TCP socket (ad-free)
      return {
        quality: s.quality,
        url: proxyUrl(`${mp4ProxyPath}?url=${encodeURIComponent(s.url)}`),
        provider: s.provider || "vidlink.pro",
        type: "mp4",
      };
    });

  if (mp4Sources.length > 0) {
    return {
      sources: mp4Sources,
      subtitles: data.subtitles || [],
      embedUrl: null,
    };
  }

  // Last resort: vidlink.pro embed iframe (plays video, but HAS ADS).
  // This happens when: lk21 doesn't have it + all MP4 sources are bcdnxw.
  // Better to play with ads than not play at all.
  console.log("[NOBAR] No playable sources, using vidlink embed (has ads)");
  return { sources: [], subtitles: data.subtitles || [], embedUrl: embedFallback(tmdbId, kind, season, episode) };
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

// ─────────────────────────────────────────────────────────────────────
// Nobar CDN Proxy — Cloudflare Worker / Bun mini-service
//
// TINY API proxy for GitHub Pages deployment. Only proxies small JSON
// responses (~8KB per movie) — NEVER video segments. All video data
// goes directly from CDN to browser (zero proxy egress).
//
// Endpoints:
//   GET  /vidlink/{tmdbId}?kind=movie&season=1&episode=1
//     → mints sodium token, calls vidlink.pro API, returns stream JSON
//   GET  /idlix/{slug}
//     → fetches idlix.tv page (direct IP), extracts vidhide embed URL
//   GET  /mzfi/catalog
//     → fetches mzfi trending + recommend (Cookie auth)
//
// Deploy options:
//   - Cloudflare Worker: wrangler deploy (free 100k req/day)
//   - Bun: bun run dev (self-hosted, any port)
// ─────────────────────────────────────────────────────────────────────

// Sodium replaced with tweetnacl (pure JS, Cloudflare Workers compatible)
import { mintVidlinkToken } from "./token-minter";

// ─── vidlink.pro token mint (pure sodium, <1ms) ────────────────────
const VIDLINK_KEY_HEX =
  "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";
const FUTURE_OFFSET = 5; // seconds

// Old mintVidlinkToken removed — use token-minter.ts

// ─── vidlink.pro API call ─────────────────────────────────────────
async function resolveVidlink(
  tmdbId: number,
  kind: "movie" | "tv",
  season: number,
  episode: number
): Promise<any> {
  const token = await mintVidlinkToken(tmdbId);
  const apiPath =
    kind === "tv"
      ? `/api/b/tv/${token}/${season}/${episode}`
      : `/api/b/movie/${token}`;
  const apiUrl = `https://vidlink.pro${apiPath}?multiLang=1`;
  const referer =
    kind === "tv"
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${tmdbId}`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: referer,
      "X-Playback-Environment": "hls",
    },
  });
  const text = await res.text();
  if (text === "null" || text.length < 10) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── CloudFront cookie → URL query conversion ────────────────────
function extractCloudFrontAuth(cookie: string) {
  const policy = (cookie.match(/CloudFront-Policy=([^;]+)/) || [])[1];
  const signature = (cookie.match(/CloudFront-Signature=([^;]+)/) || [])[1];
  const keyPairId = (cookie.match(/CloudFront-Key-Pair-Id=([^;]+)/) || [])[1];
  if (!policy || !signature || !keyPairId) return null;
  return { policy, signature, keyPairId };
}

function buildSignedUrl(baseUrl: string, auth: any): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}Policy=${auth.policy}&Signature=${auth.signature}&Key-Pair-Id=${auth.keyPairId}`;
}

// ─── Idlix resolver (direct IP, no CF) ────────────────────────────
const IDLIX_BASE = "http://178.62.87.194";
const IDLIX_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

function buildSlug(title: string, year: string): string {
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

async function resolveIdlix(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${IDLIX_BASE}/${slug}/`, {
      headers: { "User-Agent": IDLIX_UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.includes("Laman tidak ditemukan")) return null;
    const m = html.match(
      /<iframe[^>]+src="(https:\/\/vidhide\.org\/embed\/[a-z0-9]+)"/i
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ─── mzfi catalog (Cookie auth) ───────────────────────────────────
const MZFI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://mzfi.me",
  Referer: "https://mzfi.me/",
};

async function getMzfiToken(): Promise<string | null> {
  const r = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: MZFI_HEADERS,
  });
  const setCookie = r.headers.get("set-cookie") || "";
  const m = setCookie.match(/token=([^;]+)/);
  return m ? m[1].replace(/%22/g, "").replace(/^"|"$/g, "") : null;
}

// ─── HTTP server (Bun) / Worker entry ─────────────────────────────

const PORT = 3003;

export async function handleRequest(req: Request): Promise<Response> {
  try {
    return await handleRequestInner(req);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack?.slice(0, 500) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

async function handleRequestInner(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /vidlink/{tmdbId}?kind=movie&season=1&episode=1
  const vidlinkMatch = path.match(/^\/vidlink\/(\d+)$/);
  if (vidlinkMatch) {
    const tmdbId = Number(vidlinkMatch[1]);
    const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
    const season = Number(url.searchParams.get("season")) || 1;
    const episode = Number(url.searchParams.get("episode")) || 1;

    const vlJson = await resolveVidlink(tmdbId, kind, season, episode);
    if (!vlJson?.stream) {
      return Response.json({ sources: [], subtitles: [] }, { headers: corsHeaders });
    }

    // Build response: hls-direct if HLS + CloudFront cookie, else MP4 proxy
    const sources: any[] = [];
    const playlist = vlJson.stream.playlist;
    const cookie = vlJson.stream.playlistHeaders?.Cookie;

    if (playlist && cookie) {
      const auth = extractCloudFrontAuth(cookie);
      if (auth) {
        sources.push({
          quality: "Auto",
          url: buildSignedUrl(playlist, auth),
          provider: "vidlink.pro",
          type: "hls-direct",
          auth,
        });
      }
    }

    // MP4 fallback (will need /api/proxy — not available on GitHub Pages)
    for (const [q, d] of Object.entries(vlJson.stream.qualities || {})) {
      const qData = d as any;
      if (qData?.url && qData?.type === "mp4") {
        sources.push({
          quality: `${q}p`,
          url: qData.url, // direct CDN URL (bcdn — UA anti-bot, may fail in browser)
          provider: "vidlink.pro",
          type: "mp4",
        });
      }
    }

    // Subtitles: direct CDN URLs (cacdn is CORS-open)
    const subtitles = (vlJson.stream.captions || []).map((c: any) => ({
      language: c.language || "Unknown",
      url: c.url,
    }));

    return Response.json({ sources, subtitles }, { headers: corsHeaders });
  }

  // GET /idlix/{slug}
  const idlixMatch = path.match(/^\/idlix\/(.+)$/);
  if (idlixMatch) {
    const slug = idlixMatch[1];
    const embedUrl = await resolveIdlix(slug);
    return Response.json(
      { embedUrl, slug, status: embedUrl ? "found" : "not_found" },
      { headers: corsHeaders }
    );
  }

  // GET /mzfi/catalog
  if (path === "/mzfi/catalog") {
    const token = await getMzfiToken();
    if (!token) {
      return Response.json({ error: "token failed" }, { status: 502, headers: corsHeaders });
    }
    const [trendingRes, recommendRes] = await Promise.all([
      fetch("https://mzfi.me/wefeed-h5api-bff/subject/trending", {
        headers: { ...MZFI_HEADERS, Cookie: `token=${token}` },
      }),
      fetch("https://mzfi.me/wefeed-h5api-bff/subject/recommend", {
        headers: { ...MZFI_HEADERS, Cookie: `token=${token}` },
      }),
    ]);
    const trending = await trendingRes.json();
    const recommend = await recommendRes.json();
    return Response.json(
      {
        trending: (trending?.data?.subjectList || []).map((s: any) => ({
          subjectId: s.subjectId,
          title: s.title,
          year: (s.releaseDate || "").slice(0, 4),
          genre: s.genre,
          imdbRating: s.imdbRatingValue,
          posterUrl: s.cover?.url,
          subjectType: s.subjectType,
        })),
        recommended: (recommend?.data?.movieItems || []).map((s: any) => ({
          subjectId: s.id,
          title: s.name,
          year: (s.tag || "").slice(0, 4),
          genre: "",
          imdbRating: "",
          posterUrl: s.cover,
          subjectType: 1,
        })),
      },
      { headers: corsHeaders }
    );
  }

  // ─── MP4 proxy endpoint ─────────────────────────────────────────
  // GET /mp4?url={encoded_mp4_url}
  // Fetches MP4 from bcdn.hakunaymatata.com WITHOUT User-Agent
  // (bcdn rejects browser UA with 428). Streams back with Range support.
  // This makes ALL vidlink.pro movies playable ad-free (not just HLS ones).
  if (path === "/mp4" || path === "/mp4/") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return Response.json({ error: "url parameter required" }, { status: 400, headers: corsHeaders });
    }

    const mp4Headers: Record<string, string> = {
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const range = req.headers.get("range");
    if (range) mp4Headers["Range"] = range;

    try {
      const mp4Res = await fetch(targetUrl, { headers: mp4Headers, redirect: "follow" });
      const respHeaders = new Headers(corsHeaders);
    const ct = mp4Res.headers.get("content-type");
    const cl = mp4Res.headers.get("content-length");
    const cr = mp4Res.headers.get("content-range");
    const ar = mp4Res.headers.get("accept-ranges");
    if (ct) respHeaders.set("Content-Type", ct);
    if (cl) respHeaders.set("Content-Length", cl);
    if (cr) respHeaders.set("Content-Range", cr);
    if (ar) respHeaders.set("Accept-Ranges", ar);
    respHeaders.set("Cache-Control", "public, max-age=3600");
      return new Response(mp4Res.body, { status: mp4Res.status, headers: respHeaders });
    } catch (e: any) {
      return Response.json({ error: "MP4 fetch failed: " + e.message }, { status: 502, headers: corsHeaders });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
}

// ─── Entry point: works as BOTH Cloudflare Worker AND Bun server ─────
// Detects runtime:
//   - Cloudflare Workers: `globalThis.caches` exists, no `Bun`
//   - Bun: `Bun` global exists
//   - Node.js: neither (fallback to manual server)

// Only start Bun server if running in Bun (not Cloudflare Workers)
try {
  if (typeof (globalThis as any).Bun !== "undefined") {
    const server = (globalThis as any).Bun.serve({
      port: PORT,
      fetch: handleRequest,
    });
    console.log(`[cdn-proxy] Listening on http://0.0.0.0:${PORT}`);
  }
} catch (e) {
  // Cloudflare Workers — do nothing (worker.ts handles the export)
}

// NOTE: Cloudflare Worker export is in worker.ts (not here).
// This file is the Bun dev server entry point only.
// Bun auto-detects `export default { fetch }` and starts a server on port 3000,
// which conflicts with Next.js dev server.


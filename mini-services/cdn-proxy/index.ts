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
  // Try set-cookie first
  const setCookie = r.headers.get("set-cookie") || "";
  const m1 = setCookie.match(/token=([^;]+)/);
  if (m1) return m1[1].replace(/%22/g, "").replace(/^"|"$/g, "");
  // Fallback: extract from x-user header (mzfi sends token here too)
  const xUser = r.headers.get("x-user") || "";
  const m2 = xUser.match(/"token"\s*:\s*"([^"]+)"/);
  if (m2) return m2[1];
  return null;
}

// ─── HTTP server (Bun) / Worker entry ─────────────────────────────

// ─── cloudflare:sockets (raw TCP) — bypasses Cf-Worker header injection ──
// CF Workers' fetch() auto-adds Cf-Worker/Cdn-Loop/Cf-Ew-Via headers that
// bcdn.hakunaymatata.com detects → HTTP 427. But connect() opens a raw TLS
// socket — we control ALL headers manually. No CF headers sent.
// This lets us proxy MP4 bytes WITHOUT Deno Deploy/Vercel/external host.
//
// Only import in Cloudflare Workers (not Bun dev). Bun doesn't have this module.
let socketConnect: any = null;
try {
  if (typeof (globalThis as any).Bun === "undefined") {
    socketConnect = (await import("cloudflare:sockets")).connect;
  }
} catch {
  // Bun dev mode or module not available — /mp4-socket route will 502.
}

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

  // ─── MP4 proxy via raw TCP socket (bypasses CF header injection) ─────
  // This is the KEY: bcdn.hakunaymatata.com blocks CF Workers (427) because
  // fetch() auto-adds Cf-Worker/Cdn-Loop headers. But connect() from
  // cloudflare:sockets opens a raw TLS socket — we manually write HTTP
  // request headers with NO Cf-Worker, NO User-Agent. bcdn accepts (206).
  //
  // Usage: GET /mp4-socket?url={encoded_bcdn_url}
  // Streams back with Range support + CORS headers.
  if ((path === "/mp4-socket" || path === "/mp4-socket/") && socketConnect) {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return Response.json({ error: "url parameter required" }, { status: 400, headers: corsHeaders });
    }

    try {
      const target = new URL(targetUrl);
      const host = target.hostname;
      const port = target.port || "443";
      const reqPath = target.pathname + target.search;
      const range = req.headers.get("range") || "bytes=0-1048575"; // default 1MB

      // Open raw TLS socket to bcdn.
      const socket = socketConnect(`${host}:${port}`, { secureTransport: "on" });
      const writer = socket.writable.getWriter();
      const reader = socket.readable.getReader();

      // Build HTTP request manually — NO Cf-Worker (fetch adds it, connect doesn't).
      // CDN-specific header requirements:
      //   bcdn.    → NO User-Agent (428 for browser UA, 206 for no UA)
      //   bcdnxw.  → Mozilla User-Agent + Referer: mzfi.me (429 without either)
      let extraHeaders = "";
      let userAgent = "";
      if (host.includes("bcdnxw.")) {
        // mzfi.me MP4 CDN — requires browser UA + Referer anti-leech.
        userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        extraHeaders = "Referer: https://mzfi.me/\r\nOrigin: https://mzfi.me\r\n";
      }
      // For bcdn.: send NO User-Agent header at all (bcdn 428's browser UA).
      const uaHeader = userAgent ? `User-Agent: ${userAgent}\r\n` : "";
      const reqLine = `GET ${reqPath} HTTP/1.1\r\nHost: ${host}\r\n${uaHeader}Range: ${range}\r\nAccept: */*\r\n${extraHeaders}Connection: close\r\n\r\n`;
      await writer.write(new TextEncoder().encode(reqLine));
      writer.releaseLock();

      // Read raw HTTP response (headers + body combined in stream).
      const chunks: Uint8Array[] = [];
      let totalLen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
        // Don't buffer entire movie — cap at 2MB for this read.
        // The browser will make new Range requests as needed.
        if (totalLen > 2 * 1024 * 1024) break;
      }
      socket.close();

      // Combine chunks.
      const all = new Uint8Array(totalLen);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.length; }

      // Split headers/body at \r\n\r\n.
      let headerEnd = -1;
      for (let i = 0; i < all.length - 3; i++) {
        if (all[i] === 13 && all[i+1] === 10 && all[i+2] === 13 && all[i+3] === 10) {
          headerEnd = i; break;
        }
      }
      if (headerEnd < 0) {
        return Response.json({ error: "no HTTP header separator in response" }, { status: 502, headers: corsHeaders });
      }

      const headerStr = new TextDecoder().decode(all.slice(0, headerEnd));
      const body = all.slice(headerEnd + 4);
      const statusMatch = headerStr.match(/HTTP\/1\.[01] (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 200;

      // Parse response headers.
      const respHeaders = new Headers(corsHeaders);
      for (const line of headerStr.split("\r\n").slice(1)) {
        const idx = line.indexOf(":");
        if (idx > 0) {
          const k = line.slice(0, idx).trim().toLowerCase();
          const v = line.slice(idx + 1).trim();
          if (["content-type", "content-length", "content-range", "accept-ranges"].includes(k)) {
            respHeaders.set(k, v);
          }
        }
      }
      respHeaders.set("Cache-Control", "public, max-age=3600");
      return new Response(body, { status, headers: respHeaders });
    } catch (e: any) {
      return Response.json({ error: "Socket proxy failed: " + e.message }, { status: 502, headers: corsHeaders });
    }
  }

  // ─── MP4 proxy endpoint (SMART — adds correct headers per CDN) ──
  // GET /mp4?url={encoded_mp4_url}
  // NOTE: This uses fetch() which adds CF headers → bcdn returns 427.
  // Use /mp4-socket (above) for bcdn/bcdnxw URLs. This /mp4 route is
  // kept as fallback for non-CF-blocking CDNs (e.g., bcdnxw with Referer).
  if (path === "/mp4" || path === "/mp4/") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return Response.json({ error: "url parameter required" }, { status: 400, headers: corsHeaders });
    }

    const mp4Headers: Record<string, string> = {
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    // Smart header injection based on CDN domain
    if (targetUrl.includes("bcdn.hakunaymatata.com")) {
      // vidlink.pro MP4 CDN — rejects browser UA (428/427), send no UA
      // Don't set User-Agent at all
    } else if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      // mzfi.me MP4 CDN — requires Referer anti-leech
      mp4Headers["Referer"] = "https://mzfi.me/";
      mp4Headers["Origin"] = "https://mzfi.me";
      mp4Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    } else {
      // Default: send browser UA
      mp4Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

    // Optional mbtoken for mzfi DASH CDN (sbcdnw)
    const mbtoken = url.searchParams.get("mbtoken");
    if (mbtoken && targetUrl.includes("sbcdnw")) {
      mp4Headers["X-MB-Token"] = mbtoken;
      mp4Headers["Referer"] = "https://movieboxhd.net/";
      mp4Headers["Origin"] = "https://movieboxhd.net";
      mp4Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

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

  // ─── mzfi stream resolver ─────────────────────────────────────────
  // GET /mzfi/{tmdbId}?kind=movie&title={title}&year={year}
  // Searches mzfi.me for the movie, gets stream URLs, returns proxied MP4 sources.
  // The Worker handles all mzfi auth (Cookie + Referer) server-side.
  // Browser plays via /mp4 proxy (Worker adds Referer for bcdnxw CDN).
  const mzfiMatch = path.match(/^\/mzfi\/(\d+)$/);
  if (mzfiMatch) {
    const tmdbId = Number(mzfiMatch[1]);
    const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
    const title = url.searchParams.get("title") || "";
    const year = url.searchParams.get("year") || "";

    if (!title) {
      return Response.json({ sources: [], subtitles: [], error: "title required" }, { headers: corsHeaders });
    }

    try {
      const token = await getMzfiToken();
      if (!token) {
        return Response.json({ sources: [], subtitles: [], error: "mzfi token failed" }, { headers: corsHeaders });
      }

      // Search mzfi for the movie
      const searchRes = await fetch("https://mzfi.me/wefeed-h5api-bff/subject/search", {
        method: "POST",
        headers: { ...MZFI_HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: title, page: 1, perPage: 20 }),
      });
      const searchData = await searchRes.json();
      const items = searchData?.data?.items || [];

      // Find matching item (title + year)
      let target: any = null;
      const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const item of items) {
        const itemNorm = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const itemYear = (item.releaseDate || "").slice(0, 4);
        if (itemNorm === normTitle && (itemYear === year || Math.abs(Number(itemYear) - Number(year)) <= 1)) {
          target = item;
          break;
        }
      }
      // Fuzzy match
      if (!target) {
        for (const item of items) {
          const itemNorm = (item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (itemNorm.includes(normTitle) || normTitle.includes(itemNorm)) {
            target = item;
            break;
          }
        }
      }

      if (!target) {
        return Response.json({ sources: [], subtitles: [], error: "not found in mzfi" }, { headers: corsHeaders });
      }

      // Call /subject/play
      const seParam = kind === "tv" ? "1" : "0";
      const epParam = kind === "tv" ? "1" : "0";
      const playUrl = `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${target.subjectId}&se=${seParam}&ep=${epParam}&detailPath=${target.detailPath}&streamSignType=1&supportCodecs%5Bh264%5D=1`;
      const playRes = await fetch(playUrl, {
        headers: { ...MZFI_HEADERS, Authorization: `Bearer ${token}`, Referer: `https://mzfi.me/spa/videoPlayPage/movies/${target.detailPath}?id=${target.subjectId}` },
      });
      const playData = await playRes.json();
      const data = playData?.data;
      if (!data) {
        return Response.json({ sources: [], subtitles: [], error: "play failed" }, { headers: corsHeaders });
      }

      const streams = data.streams || [];
      const sources: any[] = [];

      for (const s of streams) {
        if (s.url) {
          // Wrap through /mp4 proxy (Worker adds Referer for bcdnxw)
          const proxyUrl = `/mp4?url=${encodeURIComponent(s.url)}`;
          const fullProxyUrl = isStaticMode ? `${CDN_PROXY_URL}${proxyUrl}` : `${proxyUrl}&XTransformPort=${CDN_PROXY_PORT}`;
          sources.push({
            quality: `${s.id || "auto"}p`,
            url: fullProxyUrl,
            provider: "mzfi.me",
            type: "mp4",
          });
        }
      }

      // Also extract subtitles
      const subtitles: any[] = [];
      const captions = data.captions || [];
      // mzfi returns captions via separate API call — skip for now

      return Response.json({ sources, subtitles }, { headers: corsHeaders });
    } catch (e: any) {
      return Response.json({ sources: [], subtitles: [], error: e.message }, { headers: corsHeaders });
    }
  }

  if (path === "/test-mzfi") {
    try {
      const r = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
        headers: MZFI_HEADERS,
      });
      const text = await r.text();
      const setCookie = r.headers.get("set-cookie") || "NONE";
      const xUser = r.headers.get("x-user") || "NONE";
      return Response.json({
        status: r.status,
        bodyLen: text.length,
        setCookie: setCookie.slice(0, 100),
        xUser: xUser.slice(0, 100),
        hasToken: setCookie.includes("token") || xUser.includes("token"),
      }, { headers: corsHeaders });
    } catch (e: any) {
      return Response.json({ error: e.message }, { headers: corsHeaders });
    }
  }

  // ─── mzfi play proxy (browser sends token, Worker calls play API) ──
  // GET /mzfi-play?subjectId={id}&detailPath={path}&token={token}&kind={kind}
  // Browser gets token from mzfi /home (x-user header, CORS-open)
  // Worker calls mzfi /subject/play with Cookie header (browser can't set it)
  if (path === "/mzfi-play" || path === "/mzfi-play/") {
    const subjectId = url.searchParams.get("subjectId") || "";
    const detailPath = url.searchParams.get("detailPath") || "";
    const token = url.searchParams.get("token") || "";
    const kind = url.searchParams.get("kind") || "movie";
    
    if (!subjectId || !detailPath || !token) {
      return Response.json({ error: "subjectId, detailPath, token required" }, { status: 400, headers: corsHeaders });
    }
    
    const seParam = kind === "tv" ? "1" : "0";
    const epParam = kind === "tv" ? "1" : "0";
    const playUrl = `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${seParam}&ep=${epParam}&detailPath=${detailPath}&streamSignType=1&supportCodecs%5Bh264%5D=1`;
    
    try {
      const playRes = await fetch(playUrl, {
        headers: {
          ...MZFI_HEADERS,
          Authorization: `Bearer ${token}`,
          Cookie: `token=${token}`,
          Referer: `https://mzfi.me/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}`,
        },
      });
      const playText = await playRes.text();
      let playData;
      try { playData = JSON.parse(playText); } catch { playData = null; }
      const data = playData?.data;
      if (!data) {
        return Response.json({ sources: [], subtitles: [], error: `play failed: HTTP ${playRes.status}, body: ${playText.slice(0, 200)}` }, { headers: corsHeaders });
      }
      
      const streams = data.streams || [];
      const sources: any[] = [];
      
      for (const s of streams) {
        if (s.url) {
          // Wrap through /mp4 proxy
          const proxyUrl = `/mp4?url=${encodeURIComponent(s.url)}`;
          const fullProxyUrl = isStaticMode ? `${CDN_PROXY_URL}${proxyUrl}` : `${proxyUrl}&XTransformPort=${CDN_PROXY_PORT}`;
          sources.push({
            quality: `${s.id || "auto"}p`,
            url: fullProxyUrl,
            provider: "mzfi.me",
            type: "mp4",
          });
        }
      }
      
      return Response.json({ sources, subtitles: [] }, { headers: corsHeaders });
    } catch (e: any) {
      return Response.json({ sources: [], subtitles: [], error: e.message }, { headers: corsHeaders });
    }
  }

  // ─── lk21 resolver endpoints ──────────────────────────────────────
  // RE'd flow: see RESEARCH.md for the full write-up.
  //   /lk21/health              → health check
  //   /lk21/search?q={query}    → search lk21official.fun, return slugs
  //   /lk21/resolve?title=&year=&kind= → full pipeline → CORS-open HLS URL
  //
  // The browser plays the resolved HLS DIRECTLY from putarin.{biz|xyz} +
  // lowhls9.stream121.space (both CORS-open, ACAO:*). Zero proxy egress.
  if (path === "/lk21/health") {
    return Response.json(
      { ok: true, version: "1.1.0", service: "lk21-resolver (cached)" },
      { headers: corsHeaders }
    );
  }

  if (path === "/lk21/search") {
    const q = url.searchParams.get("q") || "";
    if (!q) {
      return Response.json({ error: "q parameter required" }, { status: 400, headers: corsHeaders });
    }
    try {
      const results = await lk21Search(q);
      return Response.json({ query: q, count: results.length, results }, { headers: corsHeaders });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 502, headers: corsHeaders });
    }
  }

  if (path === "/lk21/resolve") {
    const title = url.searchParams.get("title") || "";
    const year = url.searchParams.get("year") || undefined;
    const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";

    if (!title) {
      return Response.json({ error: "title parameter required" }, { status: 400, headers: corsHeaders });
    }

    // ── Cache: lk21 rate-limits the CF Worker IP (403 after ~4 requests).
    // Cache the resolved HLS URL for 5 hours (JWT TTL is 6h). This means:
    //   - First request for a title → fetch from lk21 (1 API call)
    //   - All subsequent requests for the same title → served from cache
    // For 1000 unique movies, that's only 1000 lk21 fetches total (ever).
    // Without caching, 100 users browsing 10 movies each = 1000 fetches
    // → instant 403 ban.
    const cacheKey = `lk21:${kind}:${title}:${year || ""}`;
    const cache = (caches as any).default;
    const cacheReq = new Request(`https://nobar-cdn-proxy.internal/${cacheKey}`);
    const cached = await cache.match(cacheReq);
    if (cached) {
      const data = await cached.json();
      return Response.json({ ...data, cached: true }, { headers: corsHeaders });
    }

    try {
      const result = await lk21Resolve(title, year, kind);
      const responseData = { title, year, kind, ...result };
      // Only cache successful resolutions (sources.length > 0).
      // Don't cache failures — lk21 might have the movie next time.
      if (result.sources.length > 0) {
        const cacheRes = new Response(JSON.stringify(responseData), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=18000", // 5 hours
          },
        });
        // Fire-and-forget cache put (don't block the response).
        cache.put(cacheReq, cacheRes.clone()).catch(() => {});
      }
      return Response.json(responseData, { headers: corsHeaders });
    } catch (e: any) {
      return Response.json(
        { sources: [], subtitles: [], error: e.message },
        { status: 502, headers: corsHeaders }
      );
    }
  }

  return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
}

// ════════════════════════════════════════════════════════════════════
// lk21 Resolver — merged into cdn-proxy (single Bun process, port 3003)
// ════════════════════════════════════════════════════════════════════
// Reverse-engineered flow for lk21official.fun → putarin.{biz|xyz} → HLS.
// See RESEARCH.md for the full write-up + verification results.
//
// Pipeline:
//   1. Search lk21official.fun/?s={title} → parse <a href> for slug
//   2. Fetch lk21official.fun/{slug}/ → extract <iframe src="putarin.{biz|xyz}/e/{code}">
//   3. Fetch putarin.{biz|xyz}/e/{code} → extract window.__PX = {n, d, v}
//   4. GET putarin.{biz|xyz}/api/pk?n={n} → 64-hex AES-256 key
//   5. AES-256-GCM decrypt (IV = d[0:12], ct = d[12:]) → {file:"/api/hls?t={JWT}", type:"hls"}
//   6. Return https://putarin.{biz|xyz}/api/hls?t={JWT} (CORS-open, plays via hls.js)

const LK21_BASE = "https://lk21official.fun";
const PUTARIN_BIZ = "https://putarin.biz";
const PUTARIN_XYZ = "https://putarin.xyz";

// Dedicated headers for lk21/putarin — do NOT reuse MZFI_HEADERS (which sends
// Origin: mzfi.me + Accept: application/json, causing lk21 to 403 or return
// empty results). lk21 is a WordPress site that expects HTML requests with
// a normal browser UA + no foreign Origin/Referer.
const LK21_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function lk21FetchText(targetUrl: string, referer?: string): Promise<string> {
  // Retry with backoff — lk21 rate-limits the CF Worker IP (403 after ~4
  // rapid requests). Wait 3s on 403 and retry. This helps when multiple
  // users request different movies simultaneously (the cache absorbs
  // repeats, but the FIRST fetch of each movie still hits lk21).
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(targetUrl, {
      headers: referer
        ? { ...LK21_HEADERS, Referer: referer }
        : LK21_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return res.text();
    if (res.status === 403 && attempt < 2) {
      // Rate-limited — wait 3s (or 6s on second retry) and try again.
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${targetUrl}`);
  }
  throw new Error(`Max retries exceeded for ${targetUrl}`);
}

// base64 → Uint8Array (handles JSON-escaped \/ and URL-safe chars)
function lk21B64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/\\\//g, "/").replace(/-/g, "+").replace(/_/g, "/");
  const b = atob(clean);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

// hex string → Uint8Array
function lk21HexToBytes(s: string): Uint8Array {
  const u = new Uint8Array(s.length >> 1);
  for (let i = 0; i < u.length; i++) {
    u[i] = parseInt(s.substr(i << 1, 2), 16);
  }
  return u;
}

// Step 1+2: Search lk21 → array of {slug, title, url}
async function lk21Search(query: string): Promise<
  Array<{ slug: string; title: string; url: string }>
> {
  const html = await lk21FetchText(`${LK21_BASE}/?s=${encodeURIComponent(query)}`);
  const results: Array<{ slug: string; title: string; url: string }> = [];
  const seen = new Set<string>();

  // Match: <a href="https://lk21official.fun/{slug}/" ...>
  // Skip nav/genre/country/year/wp-* paths.
  const re = /href="https:\/\/lk21official\.fun\/([^"/]+)\/"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    if (
      /^(wp-json|wp-admin|wp-content|wp-includes|wp-login|feed|rss|search|page|category|tag|abjad|genre|country|year|populer|latest|rating|release|most-commented|top-movie-today|quality|series-terbaru|privacy-policy|dmca|about|contact|disclaimer|sitemap|serial-terbaru|film-terbaru)$/i.test(
        slug
      )
    ) {
      continue;
    }
    seen.add(slug);
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    results.push({ slug, title, url: `${LK21_BASE}/${slug}/` });
  }
  return results;
}

// Step 3: Fetch movie detail page, extract putarin embed code + domain
async function lk21ExtractPutarinCode(
  movieUrl: string
): Promise<{ code: string; base: string } | null> {
  const html = await lk21FetchText(movieUrl, LK21_BASE + "/");
  // <iframe src="https://putarin.{biz|xyz}/e/{code}" ...>
  const m = html.match(
    /src="(https?:\/\/putarin\.(biz|xyz)\/e\/([A-Za-z0-9_-]+))"/
  );
  if (!m) return null;
  const base = m[2] === "xyz" ? PUTARIN_XYZ : PUTARIN_BIZ;
  return { code: m[3], base };
}

// Step 4: Fetch putarin embed, extract __PX blob
async function lk21ExtractPXBlob(
  code: string,
  base: string
): Promise<{ n: string; d: string }> {
  const html = await lk21FetchText(`${base}/e/${code}`, `${base}/`);
  const m = html.match(
    /window\.__PX\s*=\s*(\{"n":"([^"]+)","d":"([^"]+)","v":"[^"]*"\})/
  );
  if (!m) throw new Error("Could not parse __PX from putarin page");
  return { n: m[2], d: m[3] };
}

// Step 5: Fetch AES-256 key from /api/pk
async function lk21FetchPk(nonce: string, base: string): Promise<string> {
  const res = await fetch(`${base}/api/pk?n=${encodeURIComponent(nonce)}`, {
    headers: { ...LK21_HEADERS, Referer: `${base}/` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`/api/pk HTTP ${res.status}`);
  const key = (await res.text()).trim();
  if (key.length < 64) throw new Error(`Key too short: ${key.length} chars`);
  return key;
}

// Step 6: AES-256-GCM decrypt → PLAYER config JSON
async function lk21DecryptPlayer(
  px: { n: string; d: string },
  base: string
): Promise<{ file: string; type: string }> {
  const keyHex = await lk21FetchPk(px.n, base);
  const raw = lk21B64ToBytes(px.d);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const keyBytes = lk21HexToBytes(keyHex);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ct
  );
  const text = new TextDecoder().decode(ptBuffer);
  return JSON.parse(text);
}

// Full pipeline: title → playable HLS URL
async function lk21Resolve(
  title: string,
  year?: string,
  kind: "movie" | "tv" = "movie"
): Promise<{
  sources: Array<{ quality: string; url: string; provider: string; type: string }>;
  subtitles: Array<{ language: string; url: string }>;
}> {
  // 1. Search lk21 by title. Try multiple query variants to maximize hit rate:
  //    - Original title (e.g., "The Dark Knight")
  //    - Without "The" prefix (e.g., "Dark Knight" — lk21 often drops articles)
  //    - With year appended (e.g., "Joker 2019" — helps disambiguate)
  const variants = [title];
  if (/^the\s+/i.test(title)) variants.push(title.replace(/^the\s+/i, ""));
  if (year) variants.push(`${title} ${year}`);
  if (year && /^the\s+/i.test(title)) {
    variants.push(`${title.replace(/^the\s+/i, "")} ${year}`);
  }

  let results: Array<{ slug: string; title: string; url: string }> = [];
  for (const q of variants) {
    try {
      const r = await lk21Search(q);
      if (r.length > 0) {
        results = r;
        break;
      }
    } catch {
      // Try next variant
    }
  }

  // FALLBACK: If search returned 0 (lk21 rate-limits CF IP after ~4 requests),
  // try the direct URL pattern. lk21 uses predictable slugs:
  //   "Top Gun: Maverick" → /top-gun-maverick/
  //   "Oppenheimer" → /oppenheimer/
  // We construct the slug from the title + year, then HEAD-check the URL.
  if (results.length === 0) {
    const slugGuess = title
      .toLowerCase()
      .replace(/[''`]/g, "")
      .replace(/[:;,\(\)\.\!\?]/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    // Try with and without year suffix
    const guesses = year ? [slugGuess, `${slugGuess}-${year}`] : [slugGuess];
    for (const slug of guesses) {
      const directUrl = `${LK21_BASE}/${slug}/`;
      try {
        // HEAD request — if 200, the movie exists at this URL.
        const checkRes = await fetch(directUrl, {
          method: "GET",
          headers: LK21_HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (checkRes.ok) {
          // Verify it's actually a movie page (has putarin embed).
          const html = await checkRes.text();
          if (html.includes("putarin.")) {
            results = [{ slug, title, url: directUrl }];
            break;
          }
        }
      } catch {
        // Try next guess
      }
    }
  }

  if (results.length === 0) {
    return { sources: [], subtitles: [] };
  }

  // 2. Pick the best match (normalized title match, year tiebreaker).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wantNorm = norm(title);
  // Also normalize without "the" prefix for matching against lk21 slugs
  // that drop articles (e.g., "Dark Knight" vs "the-dark-knight").
  const wantNormNoArticle = norm(title.replace(/^the\s+/i, ""));

  let best: { slug: string; title: string; url: string } | null = null;
  let bestScore = 0;
  for (const r of results) {
    const slugNorm = norm(r.slug);
    let score = 0;
    if (slugNorm === wantNorm || slugNorm === wantNormNoArticle) score = 100;
    else if (slugNorm.startsWith(wantNorm) || wantNorm.startsWith(slugNorm)) score = 80;
    else if (slugNorm.startsWith(wantNormNoArticle) || wantNormNoArticle.startsWith(slugNorm)) score = 80;
    else if (slugNorm.includes(wantNorm) || wantNorm.includes(slugNorm)) score = 60;
    else if (slugNorm.includes(wantNormNoArticle) || wantNormNoArticle.includes(slugNorm)) score = 60;
    if (year && slugNorm.endsWith(norm(year))) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best || bestScore < 60) {
    return { sources: [], subtitles: [] };
  }

  // 3. Fetch the movie detail page → extract putarin embed code + domain.
  const putarin = await lk21ExtractPutarinCode(best.url);
  if (!putarin) {
    return { sources: [], subtitles: [] };
  }

  // 4. Fetch the putarin embed page → extract __PX blob.
  const px = await lk21ExtractPXBlob(putarin.code, putarin.base);

  // 5. Decrypt the PLAYER config → get the HLS file URL.
  const player = await lk21DecryptPlayer(px, putarin.base);

  // The file is a relative URL like "/api/hls?t={JWT}". Make absolute.
  let hlsUrl = player.file;
  if (hlsUrl.startsWith("/")) {
    hlsUrl = putarin.base + hlsUrl;
  }

  return {
    sources: [
      {
        quality: "Auto",
        url: hlsUrl,
        provider: `lk21 (putarin.${putarin.base.includes(".xyz") ? "xyz" : "biz"})`,
        type: "hls-direct", // CORS-open, browser plays via hls.js (zero proxy egress)
      },
    ],
    subtitles: [], // putarin doesn't embed subs in the m3u8
  };
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


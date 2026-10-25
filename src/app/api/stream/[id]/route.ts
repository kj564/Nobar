import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/stream/[id]?kind=movie|tv&season=1&episode=1
// mzfi.me direct MP4 — NO ADS, NO IFRAME, direct stream.
// Fallback: videm.xyz / vidlink.pro embed URL (has ads).
//
// mzfi.me = moviebox.ph = movieboxhd.net — same aoneroom BFF backend.
// Catalog is HUGE (thousands of titles, verified via /subject/search).
// Previously limited to ~50-100 because we scanned /home?page=1..5 —
// now we use /subject/search POST which returns the full catalog.
//
// Vercel: set maxDuration to 60s (Pro plan) so the mzfi chain
// (token + search + play + retry + caption) doesn't time out.
// On Hobby plan (10s), cold-start + 6 fetch calls + retry could exceed.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel function timeout

// ─── In-memory cache for search results ────────────────────────────
// Prevents rate-limiting from mzfi (429s) on repeated lookups.
// - Positive cache: 5min TTL (subjectId match found)
// - Negative cache: 1min TTL (no match — retry sooner in case mzfi
//   catalog was updated or previous search hit a transient 429)
//
// ─── Request deduplication ──────────────────────────────────────────
// When multiple concurrent requests arrive for the same title+year
// (e.g. 5 users open the same movie simultaneously), only ONE search
// call is fired to mzfi — the others await the in-flight promise.
// This prevents token-mint storms and 429 rate-limiting.

type SubjectMatch = { subjectId: string; detailPath: string };
type CacheEntry = { data: SubjectMatch | null; ts: number; isNegative: boolean };
const searchCache = new Map<string, CacheEntry>();
const POSITIVE_TTL = 30 * 60 * 1000; // 30 minutes (catalog rarely changes)
const NEGATIVE_TTL = 2 * 60 * 1000;  // 2 minutes (retry sooner)

// ─── Guest token cache ──────────────────────────────────────────────
// mzfi guest tokens are HS256 JWTs with TTL=90 DAYS (Max-Age=7776000).
// Re-minting on every request wastes 200-500ms per call. Cache the token
// in-memory for 1 hour — well within its 90-day validity. If mzfi 401s
// us (token revoked/expired), we re-mint on demand.
type TokenEntry = { token: string; ts: number };
let cachedToken: TokenEntry | null = null;
let inflightTokenRequest: Promise<string | null> | null = null;
const TOKEN_TTL = 60 * 60 * 1000; // 1 hour (token itself lasts 90 days)

/**
 * Mint (or return cached) mzfi guest token.
 * Deduplicates concurrent requests — only one mint call fires at a time.
 * Exported for reuse by /api/stream/[id]/subtitles (avoids re-minting).
 */
export async function getMzfiToken(): Promise<string | null> {
  // Fast path: cached + fresh
  if (cachedToken && Date.now() - cachedToken.ts < TOKEN_TTL) {
    return cachedToken.token;
  }
  // Deduplicate: if a mint is already in-flight, await it
  if (inflightTokenRequest) {
    return inflightTokenRequest;
  }
  inflightTokenRequest = (async () => {
    try {
      const tokenRes = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
        headers: { ...COMMON_HEADERS, Referer: "https://mzfi.me/" },
      });
      const setCookie = tokenRes.headers.get("set-cookie") || "";
      const xUser = tokenRes.headers.get("x-user") || "";
      let token: string | null = null;
      const tokenMatch = setCookie.match(/(?:mb_guest_token|token)=([^;]+)/);
      if (tokenMatch) {
        token = tokenMatch[1].replace(/%22/g, "").replace(/^"|"$/g, "");
      } else if (xUser) {
        const m = xUser.match(/"token"\s*:\s*"([^"]+)"/);
        if (m) token = m[1];
      }
      if (token) {
        cachedToken = { token, ts: Date.now() };
      }
      return token;
    } catch {
      return null;
    } finally {
      inflightTokenRequest = null;
    }
  })();
  return inflightTokenRequest;
}


// In-flight request deduplication: key → Promise<SubjectMatch|null>
const inflightSearches = new Map<string, Promise<SubjectMatch & { subjectType: number } | null>>();

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://mzfi.me",
  // NOTE: do NOT send x-vip-restrict: 1 — it causes the BFF to return
  // vipLocked=true + empty stream URLs. Without it, all streams unlock
  // (including 1080p). Verified live for Frozen (2013), Inside Out 2 (2024).
  // The mzfi.me web app sends x-vip-restrict but only for display metadata;
  // the play endpoint should be called WITHOUT it.
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = url.searchParams.get("season")
    ? Number(url.searchParams.get("season"))
    : 1;
  const episode = url.searchParams.get("episode")
    ? Number(url.searchParams.get("episode"))
    : 1;
  const debug = url.searchParams.get("debug") === "1";

  // Get title + year from TMDB (ENGLISH locale — mzfi catalog uses English
  // titles, e.g. "Thor: Love and Thunder" not the id-ID "Thor: Cinta dan Guntur").
  let title = "";
  let year = "";
  let imdbId: string | null = null;
  let tmdbStatus = "";
  let tmdbReleaseDate = "";

  // ─── Parallelize TMDB fetch + mzfi token mint ───
  // Old code awaited TMDB before mzfi (sequential). But the mzfi token mint
  // doesn't depend on TMDB — kick it off in parallel. Saves 200-500ms.
  const tmdbPromise = (async () => {
    try {
      const detail =
        kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
      title = detail.title || detail.name || "";
      imdbId = (detail as any).imdb_id || null;
      tmdbStatus = (detail as any).status || "";
      const dateField = kind === "tv" ? "first_air_date" : "release_date";
      tmdbReleaseDate = (detail as any)[dateField] || "";
      year = tmdbReleaseDate ? String(tmdbReleaseDate).slice(0, 4) : "";
    } catch {
      // TMDB lookup failed — still allow embed fallback below
    }
  })();

  // Kick off token mint in parallel — by the time TMDB resolves, token
  // is already in cache and fetchMzfiStream skips the mint step entirely.
  const tokenWarmupPromise = getMzfiToken();

  const result: {
    sources: Array<{
      quality: string;
      url: string;
      provider: string;
      type: string;
    }>;
    subtitles: Array<{ language: string; url: string }>;
    embedUrl: string | null;
    dashSource: {
      url: string;
      provider: string;
      maxBitrate: string;
      codec: string;
    } | null;
  } = { sources: [], subtitles: [], embedUrl: null, dashSource: null };

  // Wait for TMDB before mzfi search (need title for search keyword)
  await tmdbPromise;
  await tokenWarmupPromise; // almost always already resolved by now

  // ─── mzfi.me direct MP4 (NO ADS) ───
  // Skip mzfi for unreleased movies — mzfi returns trailers for upcoming films
  const isUnreleased =
    kind === "movie" &&
    (tmdbStatus === "Rumored" ||
     tmdbStatus === "Planned" ||
     tmdbStatus === "In Production" ||
     tmdbStatus === "Post Production");

  // ─── Adaptive (DASH) source ───────────────────────────────────────
  // HEVC adaptive bitrate (1080/720/480 in one MPD) — buttery smooth
  // playback: client auto-switches quality based on bandwidth, no
  // buffering on slow connections, no manual quality picker needed.
  // Requires X-MB-Token header on every CDN request → proxy injects
  // it when URL is on sbcdnw.hakunaymatata.com.
  let dashSource: {
    url: string;          // proxied MPD URL (/api/proxy?url=...&mbtoken=...)
    provider: string;
    maxBitrate: string;    // "1080", "720", etc. for display only
    codec: string;         // "hevc" / "h264" — for compatibility check
  } | null = null;

  if (!isUnreleased) {
  try {
    const mzfiData = await fetchMzfiStream(title, year, kind, season, episode);
    if (debug && mzfiData) {
      console.log("[stream] raw mzfi keys:", Object.keys(mzfiData));
      console.log("[stream] raw mzfi dash:", JSON.stringify((mzfiData as any).dash || []).slice(0, 300));
      console.log("[stream] raw mzfi streams[0]:", JSON.stringify((mzfiData as any).streams?.[0] || {}).slice(0, 200));
      // Include debug info in response for client-side diagnosis
      (result as any)._debug = {
        mzfiKeys: Object.keys(mzfiData),
        mzfiDashCount: (mzfiData as any).dash?.length || 0,
        mzfiStreamsCount: (mzfiData as any).streams?.length || 0,
        mzfiHasResource: (mzfiData as any).hasResource,
        mzfiDashSample: (mzfiData as any).dash?.[0] ? {
          url: (mzfiData as any).dash[0].url,
          resolutions: (mzfiData as any).dash[0].resolutions,
          codecName: (mzfiData as any).dash[0].codecName,
          hasSignCookie: !!(mzfiData as any).dash[0].signCookie,
        } : null,
      };
    }
    if (mzfiData?.hasResource && Array.isArray(mzfiData.streams)) {
      // Trailer detection: use mzfi 'size' field (bytes) instead of HEAD request
      // Trailers are < 50MB, full movies are > 100MB
      // mzfi returns size as number (bytes) — check it directly (no HTTP roundtrip!)
      const sorted = mzfiData.streams
        .filter((s: any) => s.url && !s.vipLocked && s.format === "MP4")
        .filter((s: any) => {
          const size = Number(s.size) || 0;
          if (size > 0 && size < 50_000_000) {
            console.log(`[stream] Skipping trailer: ${s.resolutions}p = ${(size/1e6).toFixed(1)}MB`);
            return false;
          }
          return true;
        })
        .sort((a: any, b: any) => Number(a.resolutions) - Number(b.resolutions));

      for (const stream of sorted) {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(stream.url)}`;
        result.sources.push({
          quality: `${stream.resolutions}p`,
          url: proxyUrl,
          provider: "mzfi.me",
          type: "mp4",
        });
      }

      // ─── Extract DASH adaptive source ──────────────────────────
      // mzfiData.dash[] has multi-bitrate HEVC MPD manifests.
      // Pick the highest-resolution DASH variant (better ABR range).
      // The signCookie (X-MB-Token) is required by sbcdnw CDN.
      const dashArr = (mzfiData as any).dash || [];
      console.log(`[stream] mzfi play response: streams=${(mzfiData as any).streams?.length || 0} dash=${dashArr.length} hls=${(mzfiData as any).hls?.length || 0} hasResource=${(mzfiData as any).hasResource}`);
      const playableDash = dashArr.filter(
        (d: any) => d?.url && d?.signCookie && d?.signHeaderKey === "X-MB-Token"
      );
      if (playableDash.length > 0) {
        // Pick the one with highest resolutions string (e.g. "1080,720,480" > "720,480")
        const best = playableDash.reduce((a: any, b: any) => {
          const ar = Number(String(a.resolutions).split(",")[0]) || 0;
          const br = Number(String(b.resolutions).split(",")[0]) || 0;
          return ar >= br ? a : b;
        });
        const mpdUrl = `/api/proxy?url=${encodeURIComponent(best.url)}&mbtoken=${encodeURIComponent(best.signCookie)}`;
        const maxRes = String(best.resolutions || "").split(",")[0] || "auto";
        dashSource = {
          url: mpdUrl,
          provider: "mzfi.me (DASH)",
          maxBitrate: `${maxRes}p`,
          codec: best.codecName || "hevc",
        };
        console.log(`[stream] DASH adaptive: ${best.resolutions} (${best.codecName})`);
      }

      // Lazy subtitle fetch: return a placeholder URL that the client can
      // call on-demand (separate /api/stream/[id]/subtitles endpoint).
      // This saves latency on the main stream response — critical for
      // Vercel function timeout. Subtitles fetched when user opens the menu.
      // ALWAYS include placeholder (subtitles route tries mzfi → subtitlecat fallback).
      result.subtitles = [
        {
          language: "Available",
          url: `/api/stream/${tmdbId}/subtitles?kind=${kind}&season=${season}&episode=${episode}&_=${Date.now()}`,
        },
      ];
    }
    } catch (err) {
    console.error("[stream] mzfi fetch failed:", err);
  }
  } // end if (!isUnreleased)

  // ─── vidlink.pro fallback (direct MP4 via WASM token) ───
  // Only try vidlink.pro if mzfi returned no sources.
  // Inline the logic (no internal HTTP fetch — saves ~200ms)
  if (result.sources.length === 0) {
    try {
      // Initialize WASM (cached across requests)
      await initVidlinkWasm();
      const token = (globalThis as any).getAdv?.(String(tmdbId));
      if (token) {
        const apiPath = kind === "tv"
          ? `/api/b/tv/${tmdbId}/${season}/${episode}/${token}`
          : `/api/b/movie/${token}`;
        const apiUrl = `https://vidlink.pro${apiPath}?multiLang=1`;
        const vlRes = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json",
            Referer: `https://vidlink.pro/${kind}/${tmdbId}`,
          },
        });
        const vlText = await vlRes.text();
        if (vlText !== "null" && vlText.length > 10) {
          const vlJson = JSON.parse(vlText);
          const qualities = vlJson?.stream?.qualities || {};
          for (const [quality, data] of Object.entries(qualities)) {
            const qData = data as any;
            if (qData?.url && qData?.type === "mp4") {
              // Trailer detection via size field
              const size = Number(qData.size) || 0;
              if (size > 0 && size < 50_000_000) continue;
              result.sources.push({
                quality: `${quality}p`,
                url: `/api/proxy?url=${encodeURIComponent(qData.url)}`,
                provider: "vidlink.pro",
                type: "mp4",
              });
            }
          }
          // Extract vidlink built-in captions
          const captions = vlJson?.stream?.captions || [];
          if (captions.length > 0) {
            result.subtitles = captions.map((c: any) => ({
              language: c.language || "Unknown",
              url: `/api/subtitle?url=${encodeURIComponent(c.url)}`,
            }));
          }
        }
      }
    } catch (err) {
      console.error("[stream] vidlink fetch failed:", err);
    }
  }

  // Always include subtitle placeholder (even for vidlink/embed sources).
  // BUT: if vidlink.pro already returned subtitles, keep those (they're
  // built-in, same source, timing matches perfectly).
  if (result.subtitles.length === 0) {
    result.subtitles = [
      {
        language: "Available",
        url: `/api/stream/${tmdbId}/subtitles?kind=${kind}&season=${season}&episode=${episode}&_=${Date.now()}`,
      },
    ];
  }

  // ─── vidsrc.buzz HLS fallback (adaptive bitrate) ──────────────────
  // If mzfi + vidlink both returned no sources, try vidsrc.buzz which
  // provides HLS adaptive bitrate streams (1080p/720p/480p auto-switch).
  // API flow: embed page → sources API → play API → HLS stream URL
  if (result.sources.length === 0 && !dashSource) {
    try {
      // Get request origin for absolute proxy URLs (needed for data: URL base)
      const reqUrl = new URL(request.url);
      const requestOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
      // Return dedicated HLS endpoint URL (not data URL)
      // This endpoint fetches HLS playlist server-side (same IP as API calls)
      // and returns modified m3u8 with proxied segment URLs
      const hlsEndpoint = `${requestOrigin}/api/vidsrc-hls/${tmdbId}?kind=${kind}${kind === "tv" ? `&season=${season}&episode=${episode}` : ""}`;
      result.sources.push({
        quality: "Auto",
        url: hlsEndpoint,
        provider: "vidsrc.buzz",
        type: "hls",
      });
      console.log("[stream] vidsrc.buzz HLS endpoint added");
    } catch (err) {
      console.error("[stream] vidsrc.buzz fetch failed:", err);
    }
  }

  // Last resort: embed iframe (only if all direct sources fail)
  if (result.sources.length === 0 && !dashSource) {
    // Use IMDB ID for providers that need it (vidsrc.me, 2embed)
    const embedId = imdbId || String(tmdbId);
    result.embedUrl =
      kind === "tv"
        ? `https://vidsrc.me/embed/tv/${embedId}/${season}/${episode}`
        : `https://vidsrc.me/embed/movie/${embedId}`;
  }

  // Attach DASH source to response (Shaka player picks this up first;
  // falls back to MP4 sources if DASH unavailable or browser lacks HEVC).
  result.dashSource = dashSource;

  // CRITICAL: Do NOT cache at edge — mzfi stream URLs expire after ~10min.
  // If we cache the API response, users get stale URLs → "Playback failed".
  // Browser cache is OK for instant re-loads, but edge/CDN cache must be off.
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

// ─── mzfi.me fetcher (refactored) ──────────────────────────────────
// Returns play data + subjectId/detailPath/token for downstream
// subtitle fetching. Uses /subject/search (full catalog) instead of
// paging /home (limited to ~100 tiles).

async function fetchMzfiStream(
  title: string,
  year: string,
  kind: "movie" | "tv",
  season: number,
  episode: number
): Promise<any | null> {
  if (!title) return null;

  // Step 1: Get guest token (cached for 1 hour — token itself lasts 90 days)
  // The /api/stream route kicks off getMzfiToken() in parallel with TMDB
  // fetch, so by the time we get here, the token is almost always already
  // in cache (zero network roundtrip). Saves 200-500ms per request.
  let token: string | null = await getMzfiToken();
  if (!token) return null;

  // Step 2: Search the FULL catalog (not just /home tiles)
  // Cache results per (title+year) to avoid rate-limit (429).
  // Deduplicate concurrent requests for the same key.
  const cacheKey = `${title.toLowerCase()}|${year}|${kind}`;
  let subjectId: string | null = null;
  let detailPath: string | null = null;
  let subjectType: number | null = null;

  const cached = searchCache.get(cacheKey);
  const ttl = cached?.isNegative ? NEGATIVE_TTL : POSITIVE_TTL;
  if (cached && Date.now() - cached.ts < ttl) {
    if (cached.data) {
      subjectId = cached.data.subjectId;
      detailPath = cached.data.detailPath;
    } else {
      return null; // negative cache — known not-found (1min TTL)
    }
  } else {
    // Deduplicate: if a search for this key is already in-flight,
    // await it instead of firing another mzfi API call.
    let inflight = inflightSearches.get(cacheKey);
    if (!inflight) {
      inflight = searchSubject(title, year, token, kind).finally(() => {
        inflightSearches.delete(cacheKey);
      });
      inflightSearches.set(cacheKey, inflight);
    }
    const match = await inflight;
    if (match) {
      subjectId = match.subjectId;
      detailPath = match.detailPath;
      subjectType = match.subjectType;
      searchCache.set(cacheKey, {
        data: { subjectId, detailPath },
        ts: Date.now(),
        isNegative: false,
      });
    } else {
      // negative cache (1min) — retry sooner in case of transient 429
      searchCache.set(cacheKey, { data: null, ts: Date.now(), isNegative: true });
      return null;
    }
  }

  // Step 3: Call /subject/play with CORRECT se/ep params.
  // CRITICAL FIX: movies require se=0&ep=0 (not se=1&ep=1) — verified live.
  // CRITICAL FIX: brackets in supportCodecs[h264] MUST be URL-encoded as
  // %5Bh264%5D — raw brackets cause the BFF to return an empty response,
  // which looked like "VIP-locked" but was actually a malformed URL bug.
  // RETRY: the BFF sometimes returns vipLocked=true + empty stream URLs
  // on the first call (anti-bot / cold-token behavior). A single retry
  // with a fresh token typically returns vipLocked=false + real URLs.
  const seParam = kind === "tv" ? season : 0;
  const epParam = kind === "tv" ? episode : 0;

  const buildPlayUrl = (sid: string, path: string) =>
    `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${sid}` +
    `&se=${seParam}&ep=${epParam}&detailPath=${path}` +
    `&streamSignType=1&supportCodecs%5Bh264%5D=1`;

  const playHeaders = (sid: string, path: string, tok: string) => ({
    ...COMMON_HEADERS,
    Authorization: `Bearer ${tok}`,
    Referer: `https://mzfi.me/spa/videoPlayPage/movies/${path}?id=${sid}`,
  });

  // Attempt 1
  let playRes = await fetch(buildPlayUrl(subjectId, detailPath), {
    headers: playHeaders(subjectId, detailPath, token),
  });
  let playData = playRes.ok ? await playRes.json() : null;
  let data = playData?.data;

  // Retry logic: if first attempt returned vip-locked streams or no
  // playable URLs, mint a fresh token and try once more. This handles
  // the transient "vipLocked:true + empty url" anti-bot behavior.
  const hasPlayableStream = (d: any) =>
    d?.streams?.some((s: any) => s.url && !s.vipLocked && s.format === "MP4");

  if (!hasPlayableStream(data)) {
    // Brief delay before retry (anti-abuse cooldown)
    await new Promise((r) => setTimeout(r, 800));
    // Invalidate cached token — vip-locked response suggests the cached
    // token may be flagged. Force re-mint by clearing cache before retry.
    cachedToken = null;
    inflightTokenRequest = null;
    const retryToken = await getMzfiToken();
    if (retryToken) {
      playRes = await fetch(buildPlayUrl(subjectId, detailPath), {
        headers: playHeaders(subjectId, detailPath, retryToken),
      });
      if (playRes.ok) {
        playData = await playRes.json();
        if (playData?.data) {
          data = playData.data;
          token = retryToken; // use fresh token for subtitle fetch too
        }
      }
    }
  }

  if (!data) return null;

  // Attach context for downstream subtitle fetch
  data._subjectId = subjectId;
  data._detailPath = detailPath;
  data._token = token;
  data._subjectType = subjectType;
  return data;
}

// ─── Search the aoneroom BFF catalog by title + year ───────────────
// Returns the best matching subject with hasResource:true.
// subjectType: 1 = movie, 2 = series/anime (per aoneroom convention).
//
// Matching strategy (multi-pass with progressive loosening):
// 1. Normalized exact title + exact year
// 2. Normalized exact title + year ±1 (release vs streaming date)
// 3. Normalized contains + year ±1
// 4. Any hasResource (last resort, year ignored)
//
// "Normalized" = lowercase + strip all non-alphanumeric chars.
// This handles punctuation differences like "Avatar: The Way of Water" (TMDB)
// vs "Avatar - The Way Of Water" (mzfi) → both normalize to "avatarthewayofwater".

function normalizeTitle(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function yearMatch(itemYear: string, targetYear: string, tolerance: number): boolean {
  if (!targetYear || !itemYear) return true; // no year to compare → accept
  const diff = Math.abs(Number(itemYear) - Number(targetYear));
  return diff <= tolerance;
}

async function searchSubject(
  title: string,
  year: string,
  token: string,
  kind: "movie" | "tv"
): Promise<SubjectMatch & { subjectType: number } | null> {
  // Retry on 429 (rate-limit) with exponential backoff.
  // mzfi BFF returns 429 when too many requests hit the same token.
  let searchRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    searchRes = await fetch(
      "https://mzfi.me/wefeed-h5api-bff/subject/search",
      {
        method: "POST",
        headers: {
          ...COMMON_HEADERS,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Referer: "https://mzfi.me/",
        },
        body: JSON.stringify({ keyword: title, page: 1, perPage: 20 }),
      }
    );
    if (searchRes.status !== 429) break;
    // 429 — wait 500ms, 1s, 2s before retry
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  if (!searchRes || !searchRes.ok) return null;
  const searchData = await searchRes.json();
  const items: any[] = searchData?.data?.items || [];

  const normTitle = normalizeTitle(title);

  const pick = (item: any) => ({
    subjectId: item.subjectId,
    detailPath: item.detailPath,
    subjectType: item.subjectType,
  });

  // Pass 1: normalized exact title + exact year
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (itemNorm === normTitle && itemNorm !== "" && yearMatch(itemYear, year, 0)) {
      return pick(item);
    }
  }

  // Pass 2: normalized exact title + year ±1 (release vs streaming date)
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (itemNorm === normTitle && itemNorm !== "" && yearMatch(itemYear, year, 1)) {
      return pick(item);
    }
  }

  // Pass 3: normalized contains (either direction) + year ±1
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (
      itemNorm !== "" &&
      (itemNorm.includes(normTitle) || normTitle.includes(itemNorm)) &&
      yearMatch(itemYear, year, 1)
    ) {
      return pick(item);
    }
  }

  // Pass 4: best prefix match — STRICT threshold to avoid false positives.
  // Require score >= 80% of query length AND year within ±2.
  // Without this, "Vision Quest" (1985) would match "Visions" (2025) —
  // different movie! Better to return null (embed fallback) than play
  // the WRONG movie. Also prefer items whose subjectType matches kind.
  const minScore = Math.ceil(normTitle.length * 0.8);
  let best: any = null;
  let bestScore = -1;
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    // Require year within ±2 (some old movies have wrong metadata)
    if (!yearMatch(itemYear, year, 2)) continue;
    const shorter = Math.min(itemNorm.length, normTitle.length);
    let score = 0;
    for (let i = 0; i < shorter; i++) {
      if (itemNorm[i] === normTitle[i]) score++;
      else break;
    }
    if (score < minScore) continue;
    // Prefer same subjectType (1=movie for movie queries, 2=series/anime for TV)
    const expectedType = kind === "tv" ? 2 : 1;
    const typeBonus = item.subjectType === expectedType ? 100 : 0;
    const adjustedScore = score + typeBonus;
    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      best = item;
    }
  }
  if (best) return pick(best);

  return null;
}

// ─── Fetch subtitle URLs (SRT format) from aoneroom ───────────────
async function fetchMzfiSubtitles(
  subjectId: string,
  detailPath: string,
  streamId: string,
  token: string
): Promise<Array<{ language: string; url: string }>> {
  const capRes = await fetch(
    `https://mzfi.me/wefeed-h5api-bff/subject/caption?format=MP4&id=${streamId}&subjectId=${subjectId}&detailPath=${detailPath}`,
    {
      headers: {
        ...COMMON_HEADERS,
        Authorization: `Bearer ${token}`,
        Referer: "https://mzfi.me/",
      },
    }
  );

  if (!capRes.ok) return [];
  const capData = await capRes.json();
  const captions = capData?.data?.captions || [];
  return captions.map((c: any) => ({
    language: c.lanName || c.lan || "Unknown",
    url: c.url,
  }));
}

// ─── vidlink.pro WASM initialization (cached across requests) ───
let wasmInitPromise: Promise<void> | null = null;

async function initVidlinkWasm(): Promise<void> {
  if (wasmInitPromise) return wasmInitPromise;
  wasmInitPromise = (async () => {
    const fs = await import("fs");
    const path = await import("path");
    const bridgeCode = fs.readFileSync(
      path.join(process.cwd(), "lib/vidlink-wasm/wasm-bridge.js"),
      "utf8"
    );
    (globalThis as any).window = globalThis;
    if (!(globalThis as any).document || typeof (globalThis as any).document.querySelector !== 'function') {
      (globalThis as any).document = {
        createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] }),
        getElementById: () => null, getElementsByTagName: () => [],
        querySelector: () => null, querySelectorAll: () => [],
        body: { appendChild: () => {} }, head: { appendChild: () => {} },
      };
    }
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node', plugins: { namedItem: () => null } },
        writable: true, configurable: true,
      });
    } catch {}
    if (!(globalThis as any).location) {
      (globalThis as any).location = { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost', href: 'https://localhost/', pathname: '/', search: '', hash: '' };
    }
    eval(bridgeCode);
    const sodium = (await import("libsodium-wrappers")).default;
    await sodium.ready;
    (globalThis as any).sodium = sodium;
    const wasmBuffer = fs.readFileSync(path.join(process.cwd(), "lib/vidlink-wasm/fu.wasm"));
    const dm = new (globalThis as any).Dm();
    const { instance } = await WebAssembly.instantiate(wasmBuffer, dm.importObject);
    dm.run(instance);
    await new Promise((r) => setTimeout(r, 2000));
  })();
  return wasmInitPromise;
}

// ─── vidsrc.buzz HLS provider ──────────────────────────────────────
// API flow:
// 1. GET /embed/movie/{tmdb_id} → extract Q config (token + IMDB ID)
// 2. GET /pl/api.php?a=sources&type=movie&id={imdb}&t={token} → server list
// 3. GET /pl/api.php?a=play&ref={ref} → {url: "/_stream?id=X", type: "hls"}
// 4. Return proxied HLS URL: /api/proxy?url=vidsrc.buzz/_stream?id=X
//
// HLS segments are small (5-second chunks) → much less proxy bandwidth
// than full MP4 progressive. HLS.js handles adaptive bitrate in browser.

const VIDSRC_BUZZ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchVidsrcBuzzStream(
  tmdbId: number,
  kind: "movie" | "tv",
  season: number,
  episode: number,
  title: string,
  requestOrigin: string
): Promise<string | null> {
  // Build embed URL
  const embedUrl = kind === "tv"
    ? `https://vidsrc.buzz/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://vidsrc.buzz/embed/movie/${tmdbId}`;

  // Step 1: Fetch embed page to extract Q config (token + IMDB ID)
  const pageRes = await fetch(embedUrl, {
    headers: { "User-Agent": VIDSRC_BUZZ_UA, Referer: "https://vidsrc.buzz/" },
  });
  if (!pageRes.ok) {
    console.log("[vidsrc.buzz] embed page failed:", pageRes.status);
    return null;
  }
  const html = await pageRes.text();

  // Extract Q config from JavaScript
  const tokenMatch = html.match(/"t":"([^"]+)"/);
  const idMatch = html.match(/"id":"(tt\d+)"/);
  if (!tokenMatch || !idMatch) {
    console.log("[vidsrc.buzz] no token/IMDB ID found in page");
    return null;
  }
  const token = tokenMatch[1];
  const imdbId = idMatch[1];

  // Step 2: Call sources API
  const encodedToken = encodeURIComponent(token);
  const typeParam = kind === "tv" ? "tv" : "movie";
  const sourcesUrl = `https://vidsrc.buzz/pl/api.php?a=sources&type=${typeParam}&id=${imdbId}&s=${kind === "tv" ? season : 0}&e=${kind === "tv" ? episode : 0}&t=${encodedToken}`;

  const sourcesRes = await fetch(sourcesUrl, {
    headers: {
      "User-Agent": VIDSRC_BUZZ_UA,
      Referer: embedUrl,
      Accept: "application/json",
    },
  });
  if (!sourcesRes.ok) {
    console.log("[vidsrc.buzz] sources API failed:", sourcesRes.status);
    return null;
  }
  const sourcesData = await sourcesRes.json();

  if (sourcesData?.error || !sourcesData?.servers?.length) {
    console.log("[vidsrc.buzz] no servers:", sourcesData?.error || "empty");
    return null;
  }

  // Step 3: Call play API for each server until we get a stream URL
  for (const server of sourcesData.servers) {
    const ref = server.ref;
    if (!ref) continue;
    const encodedRef = encodeURIComponent(ref);
    const playUrl = `https://vidsrc.buzz/pl/api.php?a=play&ref=${encodedRef}`;

    const playRes = await fetch(playUrl, {
      headers: {
        "User-Agent": VIDSRC_BUZZ_UA,
        Referer: embedUrl,
        Accept: "application/json",
      },
    });
    if (!playRes.ok) continue;
    const playData = await playRes.json();

    if (playData?.url && playData?.type === "hls") {
      // Step 4: Fetch HLS master playlist SERVER-SIDE (same IP as play API call)
      // Session IDs from vidsrc.buzz are IP-bound — if we return a proxy URL
      // to the browser, a DIFFERENT Vercel function (different IP) will try
      // to fetch it → 403. Fix: fetch master + variant playlists server-side,
      // rewrite all URLs to go through /api/proxy, return as data: URL.
      const streamPath = playData.url;
      const fullStreamUrl = streamPath.startsWith("http")
        ? streamPath
        : `https://vidsrc.buzz${streamPath}`;

      // Fetch master playlist
      const masterRes = await fetch(fullStreamUrl, {
        headers: { "User-Agent": VIDSRC_BUZZ_UA, Referer: embedUrl },
      });
      if (!masterRes.ok) {
        console.log(`[vidsrc.buzz] master playlist failed: ${masterRes.status}`);
        continue;
      }
      let masterM3u8 = await masterRes.text();

      // Check if this is a master playlist (has variant streams) or a media playlist
      const hasVariants = masterM3u8.includes("#EXT-X-STREAM-INF");

      if (hasVariants) {
        // Master playlist: fetch each variant playlist, inline them
        const variantUrls = masterM3u8.split("\n")
          .filter((l: string) => l.trim() && !l.startsWith("#"));

        let rebuiltM3u8 = "#EXTM3U\n";
        const lines = masterM3u8.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("#EXT-X-STREAM-INF")) {
            // Next line is the variant URL — fetch it
            const variantUrl = lines[i + 1]?.trim();
            if (variantUrl) {
              const fullVariantUrl = variantUrl.startsWith("http")
                ? variantUrl
                : `https://vidsrc.buzz${variantUrl}`;
              const variantRes = await fetch(fullVariantUrl, {
                headers: { "User-Agent": VIDSRC_BUZZ_UA, Referer: embedUrl },
              });
              if (variantRes.ok) {
                const variantM3u8 = await variantRes.text();
                // Rewrite segment URLs to go through /api/proxy
                const rewritten = rewriteHlsUrls(variantM3u8, "https://vidsrc.buzz", requestOrigin);
                // Convert to data URL for this variant
                const dataUrl = `data:application/vnd.apple.mpegurl;base64,${Buffer.from(rewritten).toString("base64")}`;
                rebuiltM3u8 += line + "\n" + dataUrl + "\n";
              }
            }
            i++; // skip the variant URL line
          } else if (line && !line.startsWith("#EXTM3U")) {
            rebuiltM3u8 += line + "\n";
          }
        }
        masterM3u8 = rebuiltM3u8;
      } else {
        // Media playlist: rewrite segment URLs directly
        masterM3u8 = rewriteHlsUrls(masterM3u8, "https://vidsrc.buzz", requestOrigin);
      }

      // Return as data URL (self-contained, no additional server calls for playlist)
      const dataUrl = `data:application/vnd.apple.mpegurl;base64,${Buffer.from(masterM3u8).toString("base64")}`;
      console.log(`[vidsrc.buzz] HLS playlist inlined (${masterM3u8.length}b)`);
      return dataUrl;
    }
  }

  console.log("[vidsrc.buzz] no HLS stream URL from any server");
  return null;
}

// ─── HLS URL rewriter ──────────────────────────────────────────────
// Rewrites all relative URLs in an HLS m3u8 playlist to go through
// /api/proxy. This allows HLS.js to fetch segments via our proxy which
// injects the correct Referer header for vidsrc.buzz.
function rewriteHlsUrls(m3u8: string, cdnBaseUrl: string, proxyOrigin: string): string {
  return m3u8
    .split("\n")
    .map((line: string) => {
      const trimmed = line.trim();
      // Skip empty lines and comments (but keep #EXT-X-KEY etc.)
      if (!trimmed || trimmed.startsWith("#")) return line;
      // This is a URL line — rewrite to go through /api/proxy
      const fullUrl = trimmed.startsWith("http")
        ? trimmed
        : `${cdnBaseUrl}${trimmed}`;
      // Use ABSOLUTE URL (proxyOrigin + /api/proxy) so it resolves correctly
      // even when the base URL is a data: URL
      return `${proxyOrigin}/api/proxy?url=${encodeURIComponent(fullUrl)}`;
    })
    .join("\n");
}

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
const POSITIVE_TTL = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_TTL = 1 * 60 * 1000;  // 1 minute (retry sooner)

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

  // Get title + year from TMDB (ENGLISH locale — mzfi catalog uses English
  // titles, e.g. "Thor: Love and Thunder" not the id-ID "Thor: Cinta dan Guntur").
  // Run TMDB fetch in parallel with mzfi token mint to save ~500ms latency
  // (critical for Vercel function timeout — workspace is 2-4s, Vercel 5-10s).
  let title = "";
  let year = "";
  let imdbId: string | null = null;

  const tmdbPromise = (async () => {
    try {
      const detail =
        kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
      title = detail.title || detail.name || "";
      imdbId = (detail as any).imdb_id || null;
      const dateField = kind === "tv" ? "first_air_date" : "release_date";
      const dateVal = (detail as any)[dateField];
      year = dateVal ? String(dateVal).slice(0, 4) : "";
    } catch {
      // TMDB lookup failed — still allow embed fallback below
    }
  })();

  const result: {
    sources: Array<{
      quality: string;
      url: string;
      provider: string;
      type: string;
    }>;
    subtitles: Array<{ language: string; url: string }>;
    embedUrl: string | null;
  } = { sources: [], subtitles: [], embedUrl: null };

  // Wait for TMDB before mzfi search (need title for search keyword)
  await tmdbPromise;

  // ─── mzfi.me direct MP4 (NO ADS) ───
  try {
    const mzfiData = await fetchMzfiStream(title, year, kind, season, episode);
    if (mzfiData?.hasResource && Array.isArray(mzfiData.streams)) {
      // Sort by quality (360 → 480 → 720 → 1080)
      const sorted = mzfiData.streams
        .filter((s: any) => s.url && !s.vipLocked && s.format === "MP4")
        .sort((a: any, b: any) => Number(a.resolutions) - Number(b.resolutions));

      for (const stream of sorted) {
        // Proxy through our API to bypass CORS + inject Referer
        // (CDN requires Referer: https://mzfi.me/ — see /api/proxy)
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(stream.url)}`;
        result.sources.push({
          quality: `${stream.resolutions}p`,
          url: proxyUrl,
          provider: "mzfi.me",
          type: "mp4",
        });
      }

      // Lazy subtitle fetch: return a subtitle URL that the client can
      // call on-demand (separate /api/stream/[id]/subtitles endpoint).
      // This saves ~340ms latency on the main stream response — critical
      // for Vercel function timeout. Subtitles are only fetched when the
      // user actually opens the subtitle menu.
      if (mzfiData.streams[0]?.id && mzfiData._subjectId && mzfiData._detailPath) {
        // Build a subtitle API URL that includes all the context needed
        // (subjectId, detailPath, streamId, token) so the client can fetch
        // subtitles independently without re-doing the search/play chain.
        result.subtitles = [
          {
            language: "Available",
            url: `/api/stream/${tmdbId}/subtitles?kind=${kind}&season=${season}&episode=${episode}&_=${Date.now()}`,
          },
        ];
      }
    }
  } catch (err) {
    console.error("[stream] mzfi fetch failed:", err);
  }

  // Set embed fallback URL (only used if mzfi fails)
  if (result.sources.length === 0) {
    if (imdbId) {
      result.embedUrl =
        kind === "tv"
          ? `https://videm.xyz/embed/tv/${imdbId}/${season}/${episode}`
          : `https://videm.xyz/embed/movie/${imdbId}`;
    } else {
      result.embedUrl =
        kind === "tv"
          ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${tmdbId}`;
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300" },
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

  // Step 1: Get guest token (minted fresh on /home?page=1 hit)
  const tokenRes = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: { ...COMMON_HEADERS, Referer: "https://mzfi.me/" },
  });
  // Token comes in Set-Cookie (mb_guest_token=) AND x-user header (JSON).
  const setCookie = tokenRes.headers.get("set-cookie") || "";
  const xUser = tokenRes.headers.get("x-user") || "";
  let token: string | null = null;

  const tokenMatch = setCookie.match(/(?:mb_guest_token|token)=([^;]+)/);
  if (tokenMatch) {
    token = tokenMatch[1].replace(/%22/g, "").replace(/^"|"$/g, "");
  } else if (xUser) {
    // x-user: {"token":"<JWT>","userId":"...","userType":0,"appType":3}
    const m = xUser.match(/"token"\s*:\s*"([^"]+)"/);
    if (m) token = m[1];
  }
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
    const retryTokenRes = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
      headers: { ...COMMON_HEADERS, Referer: "https://mzfi.me/" },
    });
    const retryCookie = retryTokenRes.headers.get("set-cookie") || "";
    const retryXUser = retryTokenRes.headers.get("x-user") || "";
    let retryToken: string | null = null;
    const retryMatch = retryCookie.match(/(?:mb_guest_token|token)=([^;]+)/);
    if (retryMatch) retryToken = retryMatch[1].replace(/%22/g, "").replace(/^"|"$/g, "");
    else if (retryXUser) {
      const m = retryXUser.match(/"token"\s*:\s*"([^"]+)"/);
      if (m) retryToken = m[1];
    }
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

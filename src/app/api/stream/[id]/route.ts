import { NextResponse } from "next/server";
import { fetchMovieDetail, fetchTVDetail } from "@/lib/tmdb";

// GET /api/stream/[id]?kind=movie|tv&season=1&episode=1
// mzfi.me direct MP4 — NO ADS, NO IFRAME, direct stream.
// Fallback: videm.xyz / vidlink.pro embed URL (has ads).
//
// mzfi.me = moviebox.ph = movieboxhd.net — same aoneroom BFF backend.
// Catalog is HUGE (thousands of titles, verified via /subject/search).
// Previously limited to ~50-100 because we scanned /home?page=1..5 —
// now we use /subject/search POST which returns the full catalog.

export const dynamic = "force-dynamic";

// ─── In-memory cache (5min TTL) for search results ───────────────
// Prevents rate-limiting from mzfi (429s) on repeated lookups.
type SubjectMatch = { subjectId: string; detailPath: string };
type CacheEntry = { data: SubjectMatch | null; ts: number };
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://mzfi.me",
  "x-vip-restrict": "1",
  "x-client-info": '{"timezone":"UTC"}',
  "x-source": "",
  "x-no-high-risk-restrict": "0",
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

  // Get title + year from TMDB
  let title = "";
  let year = "";
  let imdbId: string | null = null;
  try {
    const detail =
      kind === "tv" ? await fetchTVDetail(tmdbId) : await fetchMovieDetail(tmdbId);
    title = detail.title || detail.name || "";
    imdbId = (detail as any).imdb_id || null;
    const dateField = kind === "tv" ? "first_air_date" : "release_date";
    const dateVal = (detail as any)[dateField];
    year = dateVal ? String(dateVal).slice(0, 4) : "";
  } catch {
    // TMDB lookup failed — still allow embed fallback below
  }

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

      // Fetch subtitles (separate endpoint)
      if (mzfiData.streams[0]?.id && mzfiData._subjectId && mzfiData._detailPath) {
        try {
          const subs = await fetchMzfiSubtitles(
            mzfiData._subjectId,
            mzfiData._detailPath,
            String(mzfiData.streams[0].id),
            mzfiData._token!
          );
          result.subtitles = subs;
        } catch {
          // subtitles optional — ignore failures
        }
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
  const cacheKey = `${title.toLowerCase()}|${year}`;
  const cached = searchCache.get(cacheKey);
  let subjectId: string | null = null;
  let detailPath: string | null = null;
  let subjectType: number | null = null;

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    if (cached.data) {
      subjectId = cached.data.subjectId;
      detailPath = cached.data.detailPath;
    } else {
      return null; // negative cache — known not-found
    }
  } else {
    const match = await searchSubject(title, year, token);
    if (match) {
      subjectId = match.subjectId;
      detailPath = match.detailPath;
      subjectType = match.subjectType;
      searchCache.set(cacheKey, {
        data: { subjectId, detailPath },
        ts: Date.now(),
      });
    } else {
      // negative cache to prevent re-querying 429-prone endpoint
      searchCache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }
  }

  // Step 3: Call /subject/play with CORRECT se/ep params.
  // CRITICAL: movies require se=0&ep=0 (not se=1&ep=1) — verified live.
  // For movies, the prior se=1&ep=1 caused hasResource:false → embed fallback.
  const seParam = kind === "tv" ? season : 0;
  const epParam = kind === "tv" ? episode : 0;

  const playUrl =
    `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${subjectId}` +
    `&se=${seParam}&ep=${epParam}&detailPath=${detailPath}` +
    `&streamSignType=1&supportCodecs[h264]=1`;

  const playRes = await fetch(playUrl, {
    headers: {
      ...COMMON_HEADERS,
      Authorization: `Bearer ${token}`,
      Referer: `https://mzfi.me/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}`,
    },
  });

  if (!playRes.ok) return null;
  const playData = await playRes.json();
  const data = playData.data;
  if (!data) return null;

  // Attach context for downstream subtitle fetch
  data._subjectId = subjectId;
  data._detailPath = detailPath;
  data._token = token;
  data._subjectType = subjectType;
  return data;
}

// ─── Search the aoneroom BFF catalog by title + year ───────────────
// Returns the first matching subject with hasResource:true.
// subjectType: 1 = movie, 2 = series/anime (per aoneroom convention).
async function searchSubject(
  title: string,
  year: string,
  token: string
): Promise<SubjectMatch & { subjectType: number } | null> {
  const searchRes = await fetch(
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

  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  const items = searchData?.data?.items || [];

  const titleLower = title.toLowerCase();

  // Pass 1: exact title match + year match + hasResource
  for (const item of items) {
    const itemTitle = (item.title || "").toLowerCase();
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (
      itemTitle === titleLower &&
      (!year || itemYear === year) &&
      item.hasResource
    ) {
      return {
        subjectId: item.subjectId,
        detailPath: item.detailPath,
        subjectType: item.subjectType,
      };
    }
  }

  // Pass 2: title contains query + year + hasResource (looser)
  for (const item of items) {
    const itemTitle = (item.title || "").toLowerCase();
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (
      (itemTitle.includes(titleLower) || titleLower.includes(itemTitle)) &&
      (!year || itemYear === year) &&
      item.hasResource
    ) {
      return {
        subjectId: item.subjectId,
        detailPath: item.detailPath,
        subjectType: item.subjectType,
      };
    }
  }

  // Pass 3: any hasResource match (year ignored) — last resort
  for (const item of items) {
    if (item.hasResource) {
      return {
        subjectId: item.subjectId,
        detailPath: item.detailPath,
        subjectType: item.subjectType,
      };
    }
  }

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

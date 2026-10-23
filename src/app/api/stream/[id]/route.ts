import { NextResponse } from "next/server";
import { fetchMovieDetail } from "@/lib/tmdb";

// GET /api/stream/[id]
// Fetches direct stream URLs + subtitles from vidlink.pro + mzfi.me
// Returns JSON: { sources: [{quality, url, provider}], subtitles: [{language, url}] }

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Get movie info from TMDB (for title+year matching with mzfi)
  let movieTitle = "";
  let movieYear = "";
  try {
    const detail = await fetchMovieDetail(tmdbId);
    movieTitle = detail.title || detail.name || "";
    movieYear = detail.release_date ? String(detail.release_date).slice(0, 4) : "";
  } catch {}

  const result: {
    sources: Array<{ quality: string; url: string; provider: string; type: string }>;
    subtitles: Array<{ language: string; url: string }>;
  } = { sources: [], subtitles: [] };

  // ─── Source 1: vidlink.pro ───
  try {
    const vidlinkData = await fetchVidlinkStream(tmdbId);
    if (vidlinkData) {
      for (const [quality, info] of Object.entries(vidlinkData.stream?.qualities || {})) {
        const q = info as { url: string; type: string };
        if (q.url) {
          result.sources.push({
            quality: `${quality}p`,
            url: q.url,
            provider: "vidlink.pro",
            type: q.type || "mp4",
          });
        }
      }
      // Subtitles
      for (const cap of vidlinkData.stream?.captions || []) {
        if (cap.url) {
          result.subtitles.push({
            language: cap.language || "Unknown",
            url: cap.url,
          });
        }
      }
    }
  } catch (err) {
    console.error("VidLink fetch failed:", err);
  }

  // ─── Source 2: mzfi.me (fallback if vidlink has no sources) ───
  if (result.sources.length === 0) {
    try {
      const mzfiData = await fetchMzfiStream(movieTitle, movieYear);
      if (mzfiData) {
        for (const stream of mzfiData.streams || []) {
          if (stream.url && !stream.vipLocked) {
            result.sources.push({
              quality: `${stream.resolutions}p`,
              url: stream.url,
              provider: "mzfi.me",
              type: stream.format?.toLowerCase() || "mp4",
            });
          }
        }
        // mzfi subtitles (from API response — need to fetch separately)
      }
    } catch (err) {
      console.error("Mzfi fetch failed:", err);
    }
  }

  if (result.sources.length === 0) {
    return NextResponse.json(
      { error: "No stream sources found. Falling back to embed." },
      { status: 404 }
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

// ─── VidLink.pro fetcher ──────────────────────────────────────────
// 1. Fetch vidlink.pro/movie/{tmdbId} HTML
// 2. Extract encoded ID from script tags
// 3. Call /api/b/movie/{encodedId}?multiLang=0
// 4. Return stream data

async function fetchVidlinkStream(tmdbId: number): Promise<any | null> {
  // Step 1: Fetch page HTML to get encoded ID
  const pageUrl = `https://vidlink.pro/movie/${tmdbId}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html",
    },
  });

  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  // Step 2: Extract encoded ID from HTML
  // Pattern: /api/b/movie/{ENCODED_ID}
  const match = html.match(/api\/b\/movie\/([A-Za-z0-9]+)/);
  if (!match) return null;
  const encodedId = match[1];

  // Step 3: Call API
  const apiUrl = `https://vidlink.pro/api/b/movie/${encodedId}?multiLang=0`;
  const apiRes = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": pageUrl,
    },
  });

  if (!apiRes.ok) return null;
  return await apiRes.json();
}

// ─── mzfi.me fetcher ──────────────────────────────────────────────
// 1. Get guest token from mzfi.me
// 2. Search home API for movie by title+year
// 3. Call /wefeed-h5api-bff/subject/play with subjectId

async function fetchMzfiStream(title: string, year: string): Promise<any | null> {
  if (!title) return null;

  // Step 1: Get guest token
  const tokenRes = await fetch("https://mzfi.me/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  // Extract token from Set-Cookie header
  const setCookie = tokenRes.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/mb_guest_token=([^;]+)/);
  if (!tokenMatch) return null;
  let token = tokenMatch[1];
  // Clean token (remove URL encoding + quotes)
  token = token.replace(/%22/g, "").replace(/^"|"$/g, "");

  // Step 2: Search home API for movie by title+year
  const homeRes = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Origin": "https://mzfi.me",
      "Referer": "https://mzfi.me/",
      "x-vip-restrict": "1",
      "x-client-info": '{"timezone":"UTC"}',
      "x-source": "",
      "x-no-high-risk-restrict": "0",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!homeRes.ok) return null;
  const homeData = await homeRes.json();

  // Find movie by title+year in operatingList
  let subjectId: string | null = null;
  let detailPath: string | null = null;
  const titleLower = title.toLowerCase();

  for (const op of homeData.data?.operatingList || []) {
    for (const subject of op.subjects || []) {
      const subjectTitle = (subject.title || "").toLowerCase();
      const subjectYear = subject.releaseDate ? String(subject.releaseDate).slice(0, 4) : "";
      if (subjectTitle === titleLower && (!year || subjectYear === year)) {
        subjectId = subject.subjectId;
        detailPath = subject.detailPath;
        break;
      }
    }
    if (subjectId) break;
  }

  if (!subjectId || !detailPath) return null;

  // Step 3: Call play API
  const playRes = await fetch(
    `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=1&ep=1&detailPath=${detailPath}&streamSignType=1&supportCodecs[h264]=1`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Origin": "https://mzfi.me",
        "Referer": `https://mzfi.me/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}`,
        "x-vip-restrict": "1",
        "x-client-info": '{"timezone":"UTC"}',
        "x-source": "",
        "x-no-high-risk-restrict": "0",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    }
  );

  if (!playRes.ok) return null;
  const playData = await playRes.json();
  return playData.data;
}

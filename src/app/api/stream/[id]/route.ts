import { NextResponse } from "next/server";
import { fetchMovieDetail, fetchTVDetail } from "@/lib/tmdb";

// GET /api/stream/[id]?kind=movie|tv&season=1&episode=1
// mzfi.me direct MP4 — NO ADS, NO IFRAME, direct stream.
// Fallback: vidlink.pro embed URL (has ads).

export const dynamic = "force-dynamic";

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
  const season = url.searchParams.get("season") ? Number(url.searchParams.get("season")) : 1;
  const episode = url.searchParams.get("episode") ? Number(url.searchParams.get("episode")) : 1;

  // Get movie info from TMDB
  let title = "";
  let year = "";
  let imdbId: string | null = null;
  try {
    const detail = kind === "tv" ? await fetchTVDetail(tmdbId) : await fetchMovieDetail(tmdbId);
    title = detail.title || detail.name || "";
    imdbId = (detail as any).imdb_id || null;
    if (kind === "tv") {
      year = (detail as any).first_air_date ? String((detail as any).first_air_date).slice(0, 4) : "";
    } else {
      year = (detail as any).release_date ? String((detail as any).release_date).slice(0, 4) : "";
    }
  } catch {}

  const result: {
    sources: Array<{ quality: string; url: string; provider: string; type: string }>;
    subtitles: Array<{ language: string; url: string }>;
    embedUrl: string | null;
  } = { sources: [], subtitles: [], embedUrl: null };

  // ─── mzfi.me direct MP4 (NO ADS) ───
  try {
    const mzfiData = await fetchMzfiStream(title, year);
    if (mzfiData) {
      const streams = mzfiData.streams || [];
      // Sort by quality (360 → 480 → 720)
      const sorted = streams
        .filter((s: any) => s.url && !s.vipLocked)
        .sort((a: any, b: any) => Number(a.resolutions) - Number(b.resolutions));

      for (const stream of sorted) {
        // Proxy through our API to bypass CORS + add Referer
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(stream.url)}`;
        result.sources.push({
          quality: `${stream.resolutions}p`,
          url: proxyUrl,
          provider: "mzfi.me",
          type: "mp4",
        });
      }

      // Also get subtitles from mzfi (if available in response)
      // mzfi returns subtitle URLs in a separate field sometimes
    }
  } catch (err) {
    console.error("Mzfi fetch failed:", err);
  }

  // Set embed fallback URL (only used if mzfi fails)
  if (result.sources.length === 0) {
    // Use videm.xyz embed (IMDB ID) or vidlink.pro (TMDB ID)
    if (imdbId) {
      result.embedUrl = kind === "tv"
        ? `https://videm.xyz/embed/tv/${imdbId}/${season}/${episode}`
        : `https://videm.xyz/embed/movie/${imdbId}`;
    } else {
      result.embedUrl = kind === "tv"
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidlink.pro/movie/${tmdbId}`;
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

// ─── mzfi.me fetcher ──────────────────────────────────────────────

async function fetchMzfiStream(title: string, year: string): Promise<any | null> {
  if (!title) return null;

  // Step 1: Get guest token
  const tokenRes = await fetch("https://mzfi.me/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const setCookie = tokenRes.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/mb_guest_token=([^;]+)/);
  if (!tokenMatch) return null;
  let token = tokenMatch[1].replace(/%22/g, "").replace(/^"|"$/g, "");

  // Step 2: Search ALL home pages (1-5) for movie by title+year
  let subjectId: string | null = null;
  let detailPath: string | null = null;
  const titleLower = title.toLowerCase();

  for (let page = 1; page <= 5 && !subjectId; page++) {
    try {
      const homeRes = await fetch(`https://mzfi.me/wefeed-h5api-bff/home?page=${page}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Origin": "https://mzfi.me",
          "Referer": "https://mzfi.me/",
          "x-vip-restrict": "1",
          "x-client-info": '{"timezone":"UTC"}',
          "x-source": "",
          "x-no-high-risk-restrict": "0",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!homeRes.ok) continue;
      const homeData = await homeRes.json();

      for (const op of homeData.data?.operatingList || []) {
        for (const subject of op.subjects || []) {
          const subjectTitle = (subject.title || "").toLowerCase();
          const subjectYear = subject.releaseDate ? String(subject.releaseDate).slice(0, 4) : "";
          // Match by title (exact or contains) + year
          if ((subjectTitle === titleLower || subjectTitle.includes(titleLower)) 
              && (!year || subjectYear === year)) {
            subjectId = subject.subjectId;
            detailPath = subject.detailPath;
            break;
          }
        }
        if (subjectId) break;
      }
    } catch { continue; }
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    }
  );

  if (!playRes.ok) return null;
  const playData = await playRes.json();
  return playData.data;
}

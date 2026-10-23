import { NextResponse } from "next/server";
import { fetchMovieDetail, fetchTVDetail } from "@/lib/tmdb";

// GET /api/stream/[id]?kind=movie|tv&season=1&episode=1
// Fetches direct stream URLs + subtitles from videm.xyz + vidlink.pro + mzfi.me

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
  const season = url.searchParams.get("season") ? Number(url.searchParams.get("season")) : undefined;
  const episode = url.searchParams.get("episode") ? Number(url.searchParams.get("episode")) : undefined;

  // Get movie/series info from TMDB (for imdbId + title+year)
  let imdbId: string | null = null;
  let title = "";
  let year = "";
  try {
    const detail = kind === "tv" ? await fetchTVDetail(tmdbId) : await fetchMovieDetail(tmdbId);
    title = detail.title || detail.name || "";
    if (kind === "tv") {
      const tvDetail = detail as any;
      year = tvDetail.first_air_date ? String(tvDetail.first_air_date).slice(0, 4) : "";
      imdbId = tvDetail.imdb_id || null;
    } else {
      const movieDetail = detail as any;
      year = movieDetail.release_date ? String(movieDetail.release_date).slice(0, 4) : "";
      imdbId = movieDetail.imdb_id || null;
    }
  } catch {}

  const result: {
    sources: Array<{ quality: string; url: string; provider: string; type: string }>;
    subtitles: Array<{ language: string; url: string }>;
  } = { sources: [], subtitles: [] };

  // ─── Source 1: videm.xyz (movie-web.click provider) ───
  // Uses IMDB ID — most reliable if imdbId available
  if (imdbId) {
    try {
      const videmData = await fetchVidemStream(imdbId, kind, season, episode);
      if (videmData) {
        for (const source of videmData.sources) {
          result.sources.push(source);
        }
        for (const sub of videmData.subtitles) {
          result.subtitles.push(sub);
        }
      }
    } catch (err) {
      console.error("Videm fetch failed:", err);
    }
  }

  // ─── Source 2: vidlink.pro ───
  if (result.sources.length === 0) {
    try {
      const vidlinkData = await fetchVidlinkStream(tmdbId, kind, season, episode);
      if (vidlinkData) {
        const qualities = vidlinkData.stream?.qualities || {};
        const sortedKeys = Object.keys(qualities).sort((a, b) => Number(a) - Number(b));
        for (const quality of sortedKeys) {
          const info = qualities[quality];
          if (info?.url) {
            // Proxy through our API for CORS bypass
            const streamUrl = `/api/proxy?url=${encodeURIComponent(info.url)}`;
            result.sources.push({
              quality: `${quality}p`,
              url: streamUrl,
              provider: "vidlink.pro",
              type: info.type || "mp4",
            });
          }
        }
        for (const cap of vidlinkData.stream?.captions || []) {
          if (cap.url) {
            result.subtitles.push({
              language: cap.language || "Unknown",
              url: `/api/subtitle?url=${encodeURIComponent(cap.url)}`,
            });
          }
        }
      }
    } catch (err) {
      console.error("VidLink fetch failed:", err);
    }
  }

  // ─── Source 3: mzfi.me (last fallback) ───
  if (result.sources.length === 0) {
    try {
      const mzfiData = await fetchMzfiStream(title, year);
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

// ─── videm.xyz fetcher (movie-web.click provider) ─────────────────
// Flow: embed page → extract token → sources API → play API → stream URL

async function fetchVidemStream(
  imdbId: string,
  kind: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<{ sources: Array<{ quality: string; url: string; provider: string; type: string }>; subtitles: Array<{ language: string; url: string }> } | null> {
  const embedPath = kind === "tv" && season && episode
    ? `/embed/tv/${imdbId}/${season}/${episode}`
    : `/embed/movie/${imdbId}`;

  const pageUrl = `https://videm.xyz${embedPath}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html",
      "Referer": "https://movie-web.click/",
    },
  });

  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  // Extract token from HTML (base64 encoded JWT-like)
  // Pattern: t=eyJjIjoi... or "t":"eyJjIjoi...
  const tokenMatch = html.match(/["']t["']?\s*[=:]\s*["'](eyJ[A-Za-z0-9_.-]+)["']/);
  if (!tokenMatch) return null;
  const token = tokenMatch[1];

  // Call sources API
  const typeParam = kind === "tv" ? "tv" : "movie";
  const sParam = season || 0;
  const eParam = episode || 0;
  const sourcesUrl = `https://videm.xyz/api.php?a=sources&type=${typeParam}&id=${imdbId}&s=${sParam}&e=${eParam}&t=${token}`;

  const sourcesRes = await fetch(sourcesUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": pageUrl,
    },
  });

  if (!sourcesRes.ok) return null;
  const sourcesData = await sourcesRes.json();

  if (!sourcesData.servers || sourcesData.servers.length === 0) return null;

  const sources: Array<{ quality: string; url: string; provider: string; type: string }> = [];
  const subtitles: Array<{ language: string; url: string }> = [];

  // Try each server until we get a stream URL
  for (const server of sourcesData.servers.slice(0, 5)) {
    try {
      const playUrl = `https://videm.xyz/api.php?a=play&ref=${server.ref}&t=${token}`;
      const playRes = await fetch(playUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": pageUrl,
        },
      });

      if (!playRes.ok) continue;
      const playData = await playRes.json();

      if (playData.url && !playData.url.includes("unavailable")) {
        const rawUrl = playData.url.startsWith("http") ? playData.url : `https://videm.xyz${playData.url}`;
        // Proxy through our API to bypass Referer/CORS restrictions
        const streamUrl = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
        sources.push({
          quality: server.name || "Auto",
          url: streamUrl,
          provider: "videm.xyz",
          type: playData.type || "hls",
        });
        // Only need first working server
        break;
      }
    } catch {
      continue;
    }
  }

  // Fetch subtitles
  try {
    const subsUrl = `https://videm.xyz/api.php?a=subs&type=${typeParam}&id=${imdbId}&s=${sParam}&e=${eParam}&t=${token}`;
    const subsRes = await fetch(subsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": pageUrl,
      },
    });

    if (subsRes.ok) {
      const subsData = await subsRes.json();
      if (Array.isArray(subsData)) {
        for (const sub of subsData) {
          if (sub.url) {
            const fullUrl = sub.url.startsWith("http") ? sub.url : `https://videm.xyz${sub.url}`;
            subtitles.push({
              language: sub.lang || sub.language || sub.label || "Unknown",
              url: `/api/subtitle?url=${encodeURIComponent(fullUrl)}`,
            });
          }
        }
      }
    }
  } catch {}

  return { sources, subtitles };
}

// ─── VidLink.pro fetcher ──────────────────────────────────────────

async function fetchVidlinkStream(
  tmdbId: number,
  kind: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<any | null> {
  const path = kind === "tv" && season && episode
    ? `/tv/${tmdbId}/${season}/${episode}`
    : `/movie/${tmdbId}`;

  const pageUrl = `https://vidlink.pro${path}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html",
    },
  });

  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const match = html.match(/api\/b\/(?:movie|tv)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  const encodedId = match[1];

  const apiUrl = `https://vidlink.pro/api/b/${kind === "tv" ? "tv" : "movie"}/${encodedId}?multiLang=0`;
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

async function fetchMzfiStream(title: string, year: string): Promise<any | null> {
  if (!title) return null;

  const tokenRes = await fetch("https://mzfi.me/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const setCookie = tokenRes.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/mb_guest_token=([^;]+)/);
  if (!tokenMatch) return null;
  let token = tokenMatch[1].replace(/%22/g, "").replace(/^"|"$/g, "");

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

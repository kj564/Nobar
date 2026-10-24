import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/stream/[id]/subtitles?kind=movie|tv&season=1&episode=1
// Lazy subtitle fetch — separate from main /api/stream/[id] to avoid
// Vercel function timeout. Main stream route returns just sources;
// client calls this endpoint on-demand when user opens subtitle menu.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const url = new URL(_request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = url.searchParams.get("season")
    ? Number(url.searchParams.get("season"))
    : 1;
  const episode = url.searchParams.get("episode")
    ? Number(url.searchParams.get("episode"))
    : 1;

  // Get title + year from TMDB (English)
  let title = "";
  let year = "";
  try {
    const detail =
      kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
    title = detail.title || detail.name || "";
    const dateField = kind === "tv" ? "first_air_date" : "release_date";
    const dateVal = (detail as any)[dateField];
    year = dateVal ? String(dateVal).slice(0, 4) : "";
  } catch {
    return NextResponse.json({ subtitles: [] });
  }

  // Reuse the same mzfi fetch logic — get subjectId + streams, then captions
  try {
    const mzfiData = await fetchMzfiStreamForSubs(title, year, kind, season, episode);
    if (mzfiData?.streams?.[0]?.id && mzfiData._subjectId && mzfiData._detailPath) {
      const subs = await fetchMzfiSubtitles(
        mzfiData._subjectId,
        mzfiData._detailPath,
        String(mzfiData.streams[0].id),
        mzfiData._token!
      );
      if (subs.length > 0) {
        // Check if Indonesian subtitle is available.
        // If not, add auto-translated "Indonesian (Auto)" option.
        const hasIndonesian = subs.some((s: any) =>
          s.language?.toLowerCase().includes("indonesian") ||
          s.language?.toLowerCase().includes("bahasa")
        );
        if (!hasIndonesian) {
          const enSub = subs.find((s: any) =>
            s.language?.toLowerCase().includes("english")
          );
          if (enSub) {
            const proxyUrl = new URL(enSub.url, "http://localhost");
            const rawSrtUrl = proxyUrl.searchParams.get("url") || "";
            if (rawSrtUrl) {
              subs.unshift({
                language: "Indonesian (Auto)",
                url: `/api/subtitles/translate?url=${encodeURIComponent(rawSrtUrl)}`,
              });
            }
          }
        }
        return NextResponse.json({ subtitles: subs });
      }
    }
  } catch (err) {
    console.error("[subtitles] mzfi fetch failed:", err);
  }

  // ── Fallback: subtitlecat.com ──
  // If mzfi has no subtitles, search subtitlecat.com (subscene is closed).
  try {
    const searchQuery = year ? `${title} ${year}` : title;
    const searchUrl = `https://www.subtitlecat.com/index.php?search=${encodeURIComponent(searchQuery)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": COMMON_HEADERS["User-Agent"] },
    });
    const searchHtml = await searchRes.text();

    const pageMatches = searchHtml.match(/href="(subs\/\d+\/[^"]*\.html)"/g) || [];
    const pageUrls = pageMatches
      .map((m) => m.match(/href="([^"]*)"/)?.[1])
      .filter(Boolean)
      .slice(0, 3);

    if (pageUrls.length > 0) {
      const subRes = await fetch(`https://www.subtitlecat.com/${pageUrls[0]}`, {
        headers: { "User-Agent": COMMON_HEADERS["User-Agent"], Referer: searchUrl },
      });
      const subHtml = await subRes.text();

      const srtRegex = /href="(\/subs\/[^"]*\.srt)"/g;
      const subs: Array<{ language: string; url: string }> = [];
      let match: RegExpExecArray | null;
      while ((match = srtRegex.exec(subHtml)) !== null) {
        const srtPath = match[1];
        const langCode = srtPath.split("-").pop()?.replace(".srt", "") || "unknown";
        subs.push({
          language: langCodeToName(langCode),
          url: `/api/subtitle?url=${encodeURIComponent("https://www.subtitlecat.com" + srtPath)}`,
        });
      }
      if (subs.length > 0) {
        // Add auto-translated Indonesian if not available
        const hasIndonesian = subs.some((s: any) =>
          s.language?.toLowerCase().includes("indonesian") ||
          s.language?.toLowerCase().includes("bahasa")
        );
        if (!hasIndonesian) {
          const enSub = subs.find((s: any) =>
            s.language?.toLowerCase().includes("english")
          );
          if (enSub) {
            const proxyUrl = new URL(enSub.url, "http://localhost");
            const rawSrtUrl = proxyUrl.searchParams.get("url") || "";
            if (rawSrtUrl) {
              subs.unshift({
                language: "Indonesian (Auto)",
                url: `/api/subtitles/translate?url=${encodeURIComponent(rawSrtUrl)}`,
              });
            }
          }
        }
        return NextResponse.json({ subtitles: subs });
      }
    }
  } catch (err) {
    console.error("[subtitles] subtitlecat fetch failed:", err);
  }

  return NextResponse.json({ subtitles: [] });
}

// ─── Inline mzfi fetch (same logic as stream route, returns minimal data) ──
const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://mzfi.me",
};

type SubjectMatch = { subjectId: string; detailPath: string };
const searchCache = new Map<string, { data: SubjectMatch | null; ts: number; isNegative: boolean }>();
const POSITIVE_TTL = 5 * 60 * 1000;
const NEGATIVE_TTL = 1 * 60 * 1000;

function normalizeTitle(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function yearMatch(itemYear: string, targetYear: string, tolerance: number): boolean {
  if (!targetYear || !itemYear) return true;
  return Math.abs(Number(itemYear) - Number(targetYear)) <= tolerance;
}

async function fetchMzfiStreamForSubs(
  title: string,
  year: string,
  kind: "movie" | "tv",
  season: number,
  episode: number
): Promise<any> {
  if (!title) return null;

  // Mint token
  const tokenRes = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: { ...COMMON_HEADERS, Referer: "https://mzfi.me/" },
  });
  const setCookie = tokenRes.headers.get("set-cookie") || "";
  const xUser = tokenRes.headers.get("x-user") || "";
  let token: string | null = null;
  const m1 = setCookie.match(/(?:mb_guest_token|token)=([^;]+)/);
  if (m1) token = m1[1].replace(/%22/g, "").replace(/^"|"$/g, "");
  else if (xUser) {
    const m2 = xUser.match(/"token"\s*:\s*"([^"]+)"/);
    if (m2) token = m2[1];
  }
  if (!token) return null;

  // Search (with cache + dedup)
  const cacheKey = `${title.toLowerCase()}|${year}|${kind}`;
  let subjectId: string | null = null;
  let detailPath: string | null = null;

  const cached = searchCache.get(cacheKey);
  const ttl = cached?.isNegative ? NEGATIVE_TTL : POSITIVE_TTL;
  if (cached && Date.now() - cached.ts < ttl) {
    if (!cached.data) return null;
    subjectId = cached.data.subjectId;
    detailPath = cached.data.detailPath;
  } else {
    const match = await searchSubject(title, year, token, kind);
    if (match) {
      subjectId = match.subjectId;
      detailPath = match.detailPath;
      searchCache.set(cacheKey, { data: { subjectId, detailPath }, ts: Date.now(), isNegative: false });
    } else {
      searchCache.set(cacheKey, { data: null, ts: Date.now(), isNegative: true });
      return null;
    }
  }

  // Play
  const seParam = kind === "tv" ? season : 0;
  const epParam = kind === "tv" ? episode : 0;
  const playUrl =
    `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${subjectId}` +
    `&se=${seParam}&ep=${epParam}&detailPath=${detailPath}` +
    `&streamSignType=1&supportCodecs%5Bh264%5D=1`;

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

  data._subjectId = subjectId;
  data._detailPath = detailPath;
  data._token = token;
  return data;
}

async function searchSubject(
  title: string,
  year: string,
  token: string,
  kind: "movie" | "tv"
): Promise<SubjectMatch & { subjectType: number } | null> {
  let searchRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    searchRes = await fetch("https://mzfi.me/wefeed-h5api-bff/subject/search", {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Referer: "https://mzfi.me/",
      },
      body: JSON.stringify({ keyword: title, page: 1, perPage: 20 }),
    });
    if (searchRes.status !== 429) break;
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

  // Pass 1: exact + year0
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (itemNorm === normTitle && itemNorm !== "" && yearMatch(itemYear, year, 0)) return pick(item);
  }
  // Pass 2: exact + year±1
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (itemNorm === normTitle && itemNorm !== "" && yearMatch(itemYear, year, 1)) return pick(item);
  }
  // Pass 3: contains + year±1
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (itemNorm !== "" && (itemNorm.includes(normTitle) || normTitle.includes(itemNorm)) && yearMatch(itemYear, year, 1)) return pick(item);
  }
  // Pass 4: best prefix (strict)
  const minScore = Math.ceil(normTitle.length * 0.8);
  let best: any = null;
  let bestScore = -1;
  for (const item of items) {
    if (!item.hasResource) continue;
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = item.releaseDate ? String(item.releaseDate).slice(0, 4) : "";
    if (!yearMatch(itemYear, year, 2)) continue;
    const shorter = Math.min(itemNorm.length, normTitle.length);
    let score = 0;
    for (let i = 0; i < shorter; i++) {
      if (itemNorm[i] === normTitle[i]) score++;
      else break;
    }
    if (score < minScore) continue;
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

function langCodeToName(code: string): string {
  const map: Record<string, string> = {
    en: "English", id: "Indonesian", es: "Spanish", fr: "French",
    de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch",
    ru: "Russian", ar: "Arabic", ja: "Japanese", ko: "Korean",
    zh: "Chinese", hi: "Hindi", th: "Thai", vi: "Vietnamese",
    tr: "Turkish", pl: "Polish", sv: "Swedish", da: "Danish",
    fi: "Finnish", no: "Norwegian", cs: "Czech", he: "Hebrew",
    ro: "Romanian", el: "Greek", ms: "Malay", si: "Sinhala",
    sq: "Albanian", bs: "Bosnian", iw: "Hebrew", ckb: "Kurdish",
    br: "Breton",
  };
  return map[code] || code.toUpperCase();
}

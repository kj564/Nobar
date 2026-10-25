import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/subtitles/search/[id]?kind=movie|tv
// Searches subtitlecat.com for subtitles, returns available languages.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ subtitles: [] });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";

  let searchQuery = "";
  try {
    const detail =
      kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
    const title = detail.title || detail.name || "";
    const dateField = kind === "tv" ? "first_air_date" : "release_date";
    const year = (detail as any)[dateField] ? String((detail as any)[dateField]).slice(0, 4) : "";
    searchQuery = year ? `${title} ${year}` : title;
  } catch {
    return NextResponse.json({ subtitles: [] });
  }

  if (!searchQuery) return NextResponse.json({ subtitles: [] });

  try {
    const searchUrl = `https://www.subtitlecat.com/index.php?search=${encodeURIComponent(searchQuery)}`;
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": UA } });
    const searchHtml = await searchRes.text();

    const pageMatches = searchHtml.match(/href="(subs\/\d+\/[^"]*\.html)"/g) || [];
    const pageUrls = pageMatches
      .map((m) => m.match(/href="([^"]*)"/)?.[1])
      .filter(Boolean)
      .slice(0, 3);

    if (pageUrls.length === 0) return NextResponse.json({ subtitles: [] });

    const subRes = await fetch(`https://www.subtitlecat.com/${pageUrls[0]}`, {
      headers: { "User-Agent": UA, Referer: searchUrl },
    });
    const subHtml = await subRes.text();

    const srtRegex = /href="(\/subs\/[^"]*\.srt)"/g;
    const subtitles: Array<{ language: string; url: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = srtRegex.exec(subHtml)) !== null) {
      const srtPath = match[1];
      const langCode = srtPath.split("-").pop()?.replace(".srt", "") || "unknown";
      subtitles.push({
        language: langCodeToName(langCode),
        url: `/api/subtitle?url=${encodeURIComponent("https://www.subtitlecat.com" + srtPath)}`,
      });
    }

    return NextResponse.json({ subtitles });
  } catch {
    return NextResponse.json({ subtitles: [] });
  }
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
  };
  return map[code] || code.toUpperCase();
}

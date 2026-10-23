import { NextResponse } from "next/server";

// GET /api/subtitle?url={encoded_url}
// Proxies subtitle SRT files from hakunaymatata.com CDN + converts to WebVTT
// for HTML5 <track> element compatibility + CORS bypass.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const subtitleUrl = url.searchParams.get("url");

  if (!subtitleUrl) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    // mzfi.me / aoneroom subtitle CDN (pbcdnw.aoneroom.com) requires
    // Referer header or returns 429 — same as the video CDN.
    const isMzfi = /aoneroom\.com|hakunaymatata\.com/.test(subtitleUrl);
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    };
    if (isMzfi) {
      headers.Referer = "https://mzfi.me/";
      headers.Origin = "https://mzfi.me";
    }
    const res = await fetch(subtitleUrl, { headers });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch subtitle: ${res.status}` }, { status: 502 });
    }

    let text = await res.text();

    // Convert SRT → WebVTT:
    // 1. Add "WEBVTT" header if missing
    // 2. Replace comma decimal separator in timestamps with dot
    if (!text.startsWith("WEBVTT")) {
      // Fix timestamps: 00:00:01,000 → 00:00:01.000
      text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      text = "WEBVTT\n\n" + text;
    }

    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Subtitle proxy error:", err);
    return NextResponse.json({ error: "Failed to proxy subtitle" }, { status: 500 });
  }
}

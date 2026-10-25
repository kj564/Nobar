import { NextResponse } from "next/server";
import {
  callVidlinkApi,
  extractCloudFrontAuth,
  buildSignedUrl,
} from "@/lib/vidlink/token";

// GET /api/vidlink/[id]?kind=movie|tv&season=1&episode=1
// vidlink.pro provider — pure-sodium token mint (<1ms, no WASM).
//
// Returns HLS direct source (zero Vercel egress) when X-Playback-Environment: hls
// succeeds — the browser fetches m3u8 + .ts segments DIRECTLY from
// sacdn.hakunaymatata.com (CORS-open). Falls back to MP4 (proxied) if HLS fails.
//
// See research/vidlink-deep-re.md for the full reverse-engineering report.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const season = Number(url.searchParams.get("season")) || 1;
  const episode = Number(url.searchParams.get("episode")) || 1;

  try {
    // X-Playback-Environment: hls → returns HLS playlist + CloudFront cookie.
    // Server mints token with +5s future timestamp (anti-replay requirement).
    const vlJson = await callVidlinkApi(tmdbId, kind, season, episode, "hls");
    if (!vlJson?.stream) {
      return NextResponse.json({ sources: [], subtitles: [] });
    }

    const sources: Array<{
      quality: string;
      url: string;
      provider: string;
      type: string;
      auth?: {
        policy: string;
        signature: string;
        keyPairId: string;
      };
    }> = [];

    // ── Preferred: HLS direct (zero Vercel egress) ──
    // CloudFront cookie → URL query params → browser fetches directly.
    const playlist = vlJson.stream.playlist;
    const cookie = vlJson.stream.playlistHeaders?.Cookie;
    if (playlist && cookie) {
      const auth = extractCloudFrontAuth(cookie);
      if (auth) {
        const signedM3u8Url = buildSignedUrl(playlist, auth);
        sources.push({
          quality: "Auto",
          url: signedM3u8Url,
          provider: "vidlink.pro",
          type: "hls-direct",
          auth,
        });
      }
    }

    // ── Fallback: MP4 qualities (still proxied via /api/proxy) ──
    const qualities = vlJson.stream.qualities || {};
    for (const [quality, data] of Object.entries(qualities)) {
      const qData = data as any;
      if (qData?.url && qData?.type === "mp4") {
        const size = Number(qData.size) || 0;
        if (size > 0 && size < 50_000_000) continue; // skip trailers
        sources.push({
          quality: `${quality}p`,
          url: `/api/proxy?url=${encodeURIComponent(qData.url)}`,
          provider: "vidlink.pro",
          type: "mp4",
        });
      }
    }

    // ── Subtitles: pass CDN URLs directly (no /api/subtitle proxy) ──
    // cacdn.hakunaymatata.com is CORS-open (ACAO:*) and the URLs already
    // contain signed auth (Policy/Signature/Key-Pair-Id in URL query).
    const captions = vlJson.stream.captions || [];
    const subtitles = captions.map((c: any) => ({
      language: c.language || "Unknown",
      url: c.url, // direct CDN URL — zero egress
    }));

    return NextResponse.json({ sources, subtitles });
  } catch (err) {
    console.error("[vidlink] error:", err);
    return NextResponse.json({ sources: [], subtitles: [] });
  }
}

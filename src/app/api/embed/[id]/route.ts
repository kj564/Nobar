import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/embed/[id]?kind=movie|tv&season=1&episode=1
// Proxies embed player HTML through our same-origin API route.
//
// WHY: VideoTogether website version can only sync <video> elements in
// same-origin context. Cross-origin iframes (videm.xyz, vidlink.pro)
// throw SecurityError → "No video in this page".
//
// By proxying the embed HTML through /api/embed/*, the iframe becomes
// same-origin (localhost:3000), so VT can inject into it and find the
// <video> element inside.
//
// The proxy rewrites all absolute URLs in the embed HTML to route through
// /api/proxy?url=... so resources (JS, CSS, poster, m3u8) load correctly
// from the same origin.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return new NextResponse("<h1>Invalid ID</h1>", {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = url.searchParams.get("season") || "1";
  const episode = url.searchParams.get("episode") || "1";

  // Get IMDB ID from TMDB (videm.xyz needs IMDB ID)
  let imdbId: string | null = null;
  let tmdbFallback = false;
  try {
    const detail =
      kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
    imdbId = (detail as any).imdb_id || null;
  } catch {
    // TMDB failed — will fallback to vidlink.pro (TMDB ID based)
    tmdbFallback = true;
  }

  // Build upstream embed URL
  let upstreamUrl: string;
  if (imdbId && !tmdbFallback) {
    upstreamUrl =
      kind === "tv"
        ? `https://videm.xyz/embed/tv/${imdbId}/${season}/${episode}`
        : `https://videm.xyz/embed/movie/${imdbId}`;
  } else {
    upstreamUrl =
      kind === "tv"
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidlink.pro/movie/${tmdbId}`;
  }

  // Fetch upstream embed HTML
  let html: string;
  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        ...COMMON_HEADERS,
        Referer: upstreamUrl,
        Origin: new URL(upstreamUrl).origin,
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch embed: ${res.status}` },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch (err) {
    console.error("[embed] proxy failed:", err);
    return NextResponse.json(
      { error: "Failed to proxy embed" },
      { status: 500 }
    );
  }

  // Rewrite absolute URLs to route through /api/proxy
  // This ensures all resources (JS, CSS, images, m3u8) load same-origin
  const upstreamOrigin = new URL(upstreamUrl).origin;

  // Rewrite absolute URLs (https://videm.xyz/...) → /api/proxy?url=...
  html = html.replace(
    /https?:\/\/([^"'\s]+)/g,
    (match, hostPath) => {
      // Skip data: URLs and already-proxied URLs
      if (match.startsWith("data:") || match.includes("/api/proxy")) {
        return match;
      }
      return `/api/proxy?url=${encodeURIComponent(match)}`;
    }
  );

  // Rewrite protocol-relative URLs (//cdn.example.com/...)
  html = html.replace(
    /(["'(])\/\/([^"'\s)]+)/g,
    (match, prefix, hostPath) => {
      return `${prefix}/api/proxy?url=${encodeURIComponent("https://" + hostPath)}`;
    }
  );

  // Rewrite root-relative URLs (/path → /api/proxy?url=<upstream>/path)
  // But skip our own /api/ routes
  html = html.replace(
    /(["'(])\/(?!api\/)([^"'\s)]+)/g,
    (match, prefix, path) => {
      return `${prefix}/api/proxy?url=${encodeURIComponent(upstreamOrigin + "/" + path)}`;
    }
  );

  // Return the rewritten HTML
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL", // Allow our own iframe to embed this
      "Cache-Control": "public, max-age=300",
    },
  });
}

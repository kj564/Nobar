import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/embed/[id]?kind=movie|tv&season=1&episode=1
//
// Same-origin embed proxy — makes VT sync work WITHOUT browser extension.
//
// HOW IT WORKS:
// 1. Fetch upstream embed HTML (videm.xyz / vidlink.pro)
// 2. Inject <base href="<upstream-origin>"> tag → relative URLs resolve
//    to upstream (JS, CSS, images, AJAX calls work correctly)
// 3. Serve HTML from our origin → iframe becomes same-origin
// 4. VT website version checks: window.location.origin === iframe.contentWindow.location.origin
//    → both are localhost:3000 → TRUE → VT injects script into iframe
// 5. VT finds <video> inside iframe → hooks play/pause/seek → sync works!

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

  let imdbId: string | null = null;
  let useVidlink = false;
  try {
    const detail =
      kind === "tv" ? await fetchTVDetailEnglish(tmdbId) : await fetchMovieDetailEnglish(tmdbId);
    imdbId = (detail as any).imdb_id || null;
  } catch {
    useVidlink = true;
  }

  let upstreamUrl: string;
  let upstreamOrigin: string;
  if (imdbId && !useVidlink) {
    upstreamUrl =
      kind === "tv"
        ? `https://videm.xyz/embed/tv/${imdbId}/${season}/${episode}`
        : `https://videm.xyz/embed/movie/${imdbId}`;
    upstreamOrigin = "https://videm.xyz";
  } else {
    upstreamUrl =
      kind === "tv"
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidlink.pro/movie/${tmdbId}`;
    upstreamOrigin = "https://vidlink.pro";
  }

  let html: string;
  try {
    const res = await fetch(upstreamUrl, {
      headers: { ...COMMON_HEADERS, Referer: upstreamUrl },
    });
    if (!res.ok) {
      return NextResponse.redirect(upstreamUrl, {
        headers: { "Cache-Control": "public, max-age=300" },
      });
    }
    html = await res.text();
  } catch {
    return NextResponse.redirect(upstreamUrl);
  }

  // KEY TRICK: inject <base> tag so relative URLs resolve to upstream origin,
  // while the document itself is served from our origin (same-origin iframe).
  const baseTag = `<base href="${upstreamOrigin}/">`;

  // CRITICAL: Override fetch + XHR inside the iframe so AJAX calls
  // (e.g. videm.xyz's /playerswish.php) route through our /api/proxy.
  // Without this, cross-origin AJAX from our origin is blocked by CORS.
  // Video/CSS/JS loading works via <base> tag, but fetch/XHR need this.
  const fetchInterceptor = `<script>
    (function() {
      var upstreamOrigin = "${upstreamOrigin}";
      var origFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = (typeof input === 'string') ? input : (input && input.url) || input;
        if (url && !url.startsWith('http') && !url.startsWith('/api/')) {
          url = upstreamOrigin + (url.startsWith('/') ? '' : '/') + url;
        }
        if (url && url.startsWith('http') && !url.startsWith(window.location.origin)) {
          url = '/api/proxy?url=' + encodeURIComponent(url);
        }
        if (typeof input === 'string') {
          return origFetch.call(this, url, init);
        } else if (input && input.url) {
          var newInput = Object.assign({}, input, { url: url });
          return origFetch.call(this, newInput, init);
        }
        return origFetch.call(this, input, init);
      };
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, sync, user, pass) {
        if (url && !url.startsWith('http') && !url.startsWith('/api/')) {
          url = upstreamOrigin + (url.startsWith('/') ? '' : '/') + url;
        }
        if (url && url.startsWith('http') && !url.startsWith(window.location.origin)) {
          url = '/api/proxy?url=' + encodeURIComponent(url);
        }
        return origOpen.call(this, method, url, sync, user, pass);
      };
    })();
  </script>`;

  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>${baseTag}${fetchInterceptor}`);
  } else if (html.includes("<html>")) {
    html = html.replace("<html>", `<html><head>${baseTag}${fetchInterceptor}</head>`);
  } else {
    html = baseTag + fetchInterceptor + html;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL",
      "Cache-Control": "public, max-age=300",
    },
  });
}

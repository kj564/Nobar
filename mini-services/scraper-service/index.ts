// Nobar Scraper Service — Cloud Browser API
//
// Headless browser proxy yang scrape direct stream URLs dari piracy
// embed sources (vidsrc.xyz, multiembed, dll). Bypass CORS karena
// server-side fetch. Client (GitHub Pages) fetch dari service ini
// via Caddy gateway (?XTransformPort=3031).
//
// Endpoints:
//   GET /api/stream?tmdbId=123&kind=movie
//   GET /api/stream?tmdbId=123&kind=tv&season=1&episode=1
//   GET /health
//
// Response:
//   { streamUrl, quality, provider, expiresAt, cached }

import { chromium, type Browser, type Page } from "playwright";

const PORT = 3031;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type CacheEntry = {
  streamUrl: string;
  provider: string;
  quality: string;
  at: number;
};

const cache = new Map<string, CacheEntry>();

// ─── Browser pool ──────────────────────────────────────────────────────
// Reuse single browser instance across requests (faster than launch per request)
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  browserInstance = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--mute-audio",
    ],
  });
  return browserInstance;
}

// ─── Scraper ───────────────────────────────────────────────────────────

async function scrapeStreamUrl(
  tmdbId: number,
  kind: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<{ streamUrl: string; provider: string; quality: string } | null> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Build list of embed URLs to try in order (most reachable first)
  const embedUrls: { url: string; provider: string }[] = [];
  if (kind === "movie") {
    embedUrls.push({ url: `https://www.2embed.cc/embed/${tmdbId}`, provider: "2embed.cc" });
    embedUrls.push({ url: `https://multiembed.mov/?video_id=${tmdbId}`, provider: "multiembed.mov" });
    embedUrls.push({ url: `https://vidsrc.to/embed/movie/${tmdbId}`, provider: "vidsrc.to" });
  } else {
    const s = season ?? 1;
    const e = episode ?? 1;
    embedUrls.push({ url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`, provider: "2embed.cc" });
    embedUrls.push({ url: `https://multiembed.mov/?video_id=${tmdbId}&s=${s}&e=${e}`, provider: "multiembed.mov" });
    embedUrls.push({ url: `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`, provider: "vidsrc.to" });
  }

  for (const { url: embedUrl, provider } of embedUrls) {
    try {
      console.log(`[scraper] Trying ${provider}: ${embedUrl}`);

      // Network interception — capture all requests for .m3u8/.mp4 URLs.
      // More reliable than DOM check because video src might be blob:
      // or loaded dynamically via JS.
      const streamUrls: string[] = [];
      const requestHandler = (request: { url: () => string }) => {
        const reqUrl = request.url();
        if (
          reqUrl.includes(".m3u8") ||
          reqUrl.includes(".mp4") ||
          (reqUrl.includes("stream") && reqUrl.includes("video"))
        ) {
          console.log(`[scraper] ${provider}: captured request: ${reqUrl.substring(0, 80)}`);
          streamUrls.push(reqUrl);
        }
      };
      page.on("request", requestHandler);

      await page.goto(embedUrl, { waitUntil: "networkidle", timeout: 20000 });

      // Wait extra for video to potentially load
      await page.waitForTimeout(3000);

      // Also check DOM for video src (fallback)
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const videoSrc = await frame.evaluate(() => {
            const video = document.querySelector("video");
            if (video?.src && video.src !== "about:blank") return video.src;
            const source = video?.querySelector("source");
            if (source?.src) return source.src;
            return null;
          });

          if (
            videoSrc &&
            (videoSrc.includes(".m3u8") ||
              videoSrc.includes(".mp4") ||
              videoSrc.startsWith("blob:"))
          ) {
            console.log(`[scraper] ${provider}: found stream (DOM): ${videoSrc.substring(0, 80)}...`);
            page.off("request", requestHandler);
            await context.close();
            return { streamUrl: videoSrc, provider, quality: "auto" };
          }
        } catch {
          // cross-origin frame, skip
        }
      }

      // Check captured network requests
      if (streamUrls.length > 0) {
        const streamUrl = streamUrls[0];
        console.log(`[scraper] ${provider}: found stream (network): ${streamUrl.substring(0, 80)}...`);
        page.off("request", requestHandler);
        await context.close();
        return { streamUrl, provider, quality: "auto" };
      }

      page.off("request", requestHandler);
      console.log(`[scraper] ${provider}: no stream found, trying next`);
    } catch (err) {
      console.log(`[scraper] ${provider}: error -`, err instanceof Error ? err.message : err);
    }
  }

  console.log("[scraper] No direct stream URL found from any source");
  await context.close();
  return null;
}

// ─── HTTP server ────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  idleTimeout: 120, // 2 minutes (default 10s too short for scraping)
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers (allow all origins for GitHub Pages client)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", port: PORT, uptime: process.uptime() }),
        { headers: corsHeaders }
      );
    }

    // Stream endpoint
    if (path === "/api/stream") {
      const tmdbId = Number(url.searchParams.get("tmdbId"));
      const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
      const season = url.searchParams.get("season")
        ? Number(url.searchParams.get("season"))
        : undefined;
      const episode = url.searchParams.get("episode")
        ? Number(url.searchParams.get("episode"))
        : undefined;

      if (!tmdbId || !Number.isFinite(tmdbId)) {
        return new Response(
          JSON.stringify({ error: "tmdbId query required" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Build cache key
      const cacheKey = `${kind}:${tmdbId}:${season ?? 0}:${episode ?? 0}`;

      // Check cache
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return new Response(
          JSON.stringify({
            streamUrl: cached.streamUrl,
            provider: cached.provider,
            quality: cached.quality,
            expiresAt: new Date(cached.at + CACHE_TTL_MS).toISOString(),
            cached: true,
          }),
          { headers: corsHeaders }
        );
      }

      // Scrape
      console.log(`[scraper] Request: ${cacheKey}`);
      const result = await scrapeStreamUrl(tmdbId, kind, season, episode);

      if (!result) {
        return new Response(
          JSON.stringify({
            error: "No stream URL found. Falling back to embed iframe.",
            fallback: true,
          }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Cache result
      cache.set(cacheKey, { ...result, at: Date.now() });

      return new Response(
        JSON.stringify({
          streamUrl: result.streamUrl,
          provider: result.provider,
          quality: result.quality,
          expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
          cached: false,
        }),
        { headers: corsHeaders }
      );
    }

    // 404
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  },
});

console.log(`[nobar-scraper] Cloud Browser API running on port ${PORT}`);
console.log(`[nobar-scraper] Endpoints:`);
console.log(`  GET /health`);
console.log(`  GET /api/stream?tmdbId=123&kind=movie`);
console.log(`  GET /api/stream?tmdbId=123&kind=tv&season=1&episode=1`);

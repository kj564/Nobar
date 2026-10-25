/**
 * Nobar CDN Proxy — Cloudflare Worker
 *
 * Zero-server-bandwidth video proxy for Nobar streaming.
 * Injects correct headers per CDN so browser can fetch video directly.
 *
 * Cost: FREE for 100k requests/day (Cloudflare Workers free tier)
 * Bandwidth: UNLIMITED on free tier
 * Edge cache: 24hr TTL (cacheEverything: true)
 *
 * Usage:
 *   https://nobar-cdn-proxy.<sub>.workers.dev/?url=<encoded-CDN-url>
 *   https://nobar-cdn-proxy.<sub>.workers.dev/?url=<encoded>&mbtoken=<token>
 *
 * Test endpoints:
 *   /test        — health check
 *   /fetch-test  — outbound fetch test
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // ── CORS preflight ──
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // ── Health check ──
    if (url.pathname === "/test") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Nobar CDN Proxy is running",
          time: new Date().toISOString(),
          version: "1.0.0",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // ── Outbound fetch test ──
    if (url.pathname === "/fetch-test") {
      try {
        const r = await fetch("https://httpbin.org/get");
        const text = await r.text();
        return new Response(
          JSON.stringify({ ok: true, status: r.status, body: text.slice(0, 500) }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: String(err) }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    // ── Main proxy logic ──
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "missing url parameter" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Build headers based on CDN domain
    const headers = new Headers();
    headers.set("Accept", "*/*");
    headers.set("Accept-Language", "en-US,en;q=0.9");

    // Pass through Range header for video seeking
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    // ─── mzfi CDN (bcdnxw) — needs browser UA + Referer: mzfi.me ───
    if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      headers.set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      headers.set("Referer", "https://mzfi.me/");
      headers.set("Origin", "https://mzfi.me");
    }
    // ─── vidlink CDN (bcdn) — needs NO Referer, NO browser UA ───
    // Cloudflare Worker fetch sends "Cloudflare-Workers" UA by default (non-browser, works!)
    // Don't set User-Agent — Worker's default works
    // Don't set Referer — vidlink CDN rejects it (429)
    else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
      // Intentionally empty — Worker default UA works for vidlink
    }
    // ─── DASH CDN (sbcdnw) — needs Referer: movieboxhd.net + X-MB-Token ───
    else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
      const mbtoken = url.searchParams.get("mbtoken") || "";
      headers.set("Referer", "https://movieboxhd.net/");
      headers.set("Origin", "https://movieboxhd.net");
      if (mbtoken) headers.set("X-MB-Token", mbtoken);
    }
    // ─── Subtitle CDN (cacdn) — public, no special headers needed ───
    // URL has signed ?Policy= param, no Referer needed

    // Fetch from CDN with edge caching (24hr TTL)
    let res;
    try {
      res = await fetch(targetUrl, {
        headers,
        cf: {
          cacheEverything: true,
          cacheTtl: 86400, // 24 hours at edge
          cacheTtlByStatus: {
            "200-299": 86400, // cache success responses 24hr
            "400-499": 60, // cache errors 1min (retry sooner)
            "500-599": 0, // don't cache server errors
          },
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: "CDN fetch failed",
          detail: String(err),
          targetUrl: targetUrl.slice(0, 80),
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // ─── Retry on 429/428 (rate-limit) with minimal headers ───
    if (res.status === 429 || res.status === 428) {
      const retryHeaders = new Headers();
      if (range) retryHeaders.set("Range", range);

      // For vidlink: bare request (no UA, no Referer) — works!
      // For mzfi: need Referer, so add it back
      if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
        retryHeaders.set("Referer", "https://mzfi.me/");
        retryHeaders.set(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        );
      }

      try {
        res = await fetch(targetUrl, {
          headers: retryHeaders,
          cf: { cacheEverything: true, cacheTtl: 86400 },
        });
      } catch (err) {
        // Fall through with original error response
      }
    }

    // Forward response with CORS headers
    const respHeaders = new Headers(res.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "Range");
    respHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges, Content-Length"
    );
    // Cache at browser for 1hr (CDN URLs expire after ~10min, but chunks are fine)
    respHeaders.set("Cache-Control", "public, max-age=3600");

    return new Response(res.body, { status: res.status, headers: respHeaders });
  },
};

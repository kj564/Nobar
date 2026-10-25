/**
 * Nobar CDN Proxy — Cloudflare Worker
 * 
 * Simple, tested proxy that injects correct headers per CDN.
 * Video bytes: Browser → Worker → CDN (ZERO Vercel egress)
 * 
 * Deploy:
 *   1. dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Name: nobar-cdn-proxy
 *   3. Deploy (with default code)
 *   4. Click "Edit code" → paste this entire file → Deploy
 *   5. Get URL: https://nobar-cdn-proxy.<your-sub>.workers.dev
 *   6. Set CDN_PROXY_URL env var in Vercel = that URL
 *   7. Redeploy Nobar
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
      return new Response(JSON.stringify({
        ok: true,
        message: "Nobar CDN Proxy is running",
        time: new Date().toISOString(),
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── Get target URL from query param ──
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "missing url parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── Build headers based on CDN domain ──
    const headers = new Headers();
    headers.set("Accept", "*/*");
    headers.set("Accept-Language", "en-US,en;q=0.9");

    // Pass through Range header for video seeking
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    // ─── mzfi CDN (bcdnxw) — needs browser UA + Referer: mzfi.me ───
    if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      headers.set("Referer", "https://mzfi.me/");
      headers.set("Origin", "https://mzfi.me");
    }
    // ─── vidlink CDN (bcdn) — needs NO Referer, NO browser UA ───
    // Worker's default UA ("Cloudflare-Workers") is non-browser, which works!
    // Don't set anything — let Worker use its defaults
    else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
      // intentionally empty
    }
    // ─── DASH CDN (sbcdnw) — needs Referer: movieboxhd.net + X-MB-Token ───
    else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
      const mbtoken = url.searchParams.get("mbtoken") || "";
      headers.set("Referer", "https://movieboxhd.net/");
      headers.set("Origin", "https://movieboxhd.net");
      if (mbtoken) headers.set("X-MB-Token", mbtoken);
    }

    // ── Fetch from CDN (NO edge cache — it breaks Range requests) ──
    let res;
    try {
      res = await fetch(targetUrl, { headers });
    } catch (err) {
      return new Response(JSON.stringify({
        error: "CDN fetch failed",
        detail: String(err),
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── Retry on 429/428 (rate-limit) with minimal headers ──
    if (res.status === 429 || res.status === 428) {
      const retryHeaders = new Headers();
      if (range) retryHeaders.set("Range", range);

      // For mzfi: need Referer, add it back
      if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
        retryHeaders.set("Referer", "https://mzfi.me/");
        retryHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
      }
      // For vidlink: bare request (no UA, no Referer) — works!

      try {
        res = await fetch(targetUrl, { headers: retryHeaders });
      } catch (err) {
        // Fall through with original error response
      }
    }

    // ── Forward response with CORS headers ──
    const respHeaders = new Headers(res.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "Range");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    // Browser cache 1hr — CDN URLs expire after ~10min, but chunks are fine
    respHeaders.set("Cache-Control", "public, max-age=3600");

    return new Response(res.body, { status: res.status, headers: respHeaders });
  },
};

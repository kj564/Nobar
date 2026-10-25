/**
 * Nobar CDN Proxy — Deno Deploy
 * 
 * Free tier: 1M requests/month, allows outbound fetch
 * 
 * Deploy via Deno Deploy dashboard:
 * 1. https://dash.deno.com → New Project → Playground
 * 2. Paste this entire file
 * 3. Click "Save & Deploy"
 * 4. Get URL: https://<your-project>.deno.dev (or .deno.net)
 * 5. Set CDN_PROXY_URL env var in Vercel = that URL
 */

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Health check
  if (url.pathname === "/test") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Nobar CDN Proxy is running",
        time: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Get target URL from query param
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
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  // Pass through Range header for video seeking
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  // ─── mzfi CDN (bcdnxw) — needs browser UA + Referer: mzfi.me ───
  if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    headers["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
  }
  // ─── vidlink CDN (bcdn) — needs NO Referer, NO browser UA ───
  // Deno sends "Deno/X.X" UA by default (non-browser, works!)
  else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // intentionally empty
  }
  // ─── DASH CDN (sbcdnw) — needs Referer: movieboxhd.net + X-MB-Token ───
  else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
    const mbtoken = url.searchParams.get("mbtoken") || "";
    headers["Referer"] = "https://movieboxhd.net/";
    headers["Origin"] = "https://movieboxhd.net";
    if (mbtoken) headers["X-MB-Token"] = mbtoken;
  }

  // ─── CRITICAL: Remove Deno Deploy's auto-injected headers ───
  // Deno Deploy adds these headers to ALL outbound requests:
  //   Cdn-Loop, X-Deno-Loop, Traceparent
  // mzfi CDN (Alibaba/Tengine) BLOCKS requests with Cdn-Loop header (426)
  // Setting them to empty string overrides the defaults
  headers["Cdn-Loop"] = "";
  headers["X-Deno-Loop"] = "";
  headers["Traceparent"] = "";

  // Fetch from CDN
  let res: Response;
  try {
    res = await fetch(targetUrl, { headers });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "CDN fetch failed",
        detail: String(err),
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

  // Retry on 426/429/428 (rate-limit / CDN block) with minimal headers
  if (res.status === 426 || res.status === 429 || res.status === 428) {
    const retryHeaders: Record<string, string> = {
      "Cdn-Loop": "",
      "X-Deno-Loop": "",
      "Traceparent": "",
    };
    if (range) retryHeaders["Range"] = range;

    if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      retryHeaders["Referer"] = "https://mzfi.me/";
      retryHeaders["User-Agent"] =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    }

    try {
      res = await fetch(targetUrl, { headers: retryHeaders });
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
  respHeaders.set("Cache-Control", "public, max-age=3600");

  return new Response(res.body, { status: res.status, headers: respHeaders });
});

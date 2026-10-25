/**
 * Nobar CDN Proxy — Deno Deploy
 * Free tier: 1M requests/month, allows outbound fetch
 * Deploy: deno deploy --allow-net proxy.ts
 * URL: https://nobar-cdn-proxy.deno.dev
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

async function handler(req: Request): Promise<Response> {
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

  if (url.pathname === "/test") {
    return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "missing url" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Build headers based on CDN
  const headers: Record<string, string> = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (req.headers.get("range")) headers["Range"] = req.headers.get("range")!;

  if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
  } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // vidlink: NO UA, NO Referer — Deno sends "Deno/X.X" UA by default (non-browser, works!)
  } else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
    const mbtoken = url.searchParams.get("mbtoken") || "";
    headers["Referer"] = "https://movieboxhd.net/";
    headers["Origin"] = "https://movieboxhd.net";
    if (mbtoken) headers["X-MB-Token"] = mbtoken;
  }

  try {
    const res = await fetch(targetUrl, { headers });
    
    const respHeaders = new Headers(res.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "Range");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    respHeaders.set("Cache-Control", "public, max-age=3600");
    
    return new Response(res.body, { status: res.status, headers: respHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

serve(handler, { port: 8000 });

// MP4 proxy for Deno Deploy (free, no Cloudflare headers)
// Deploy: deno deploy --project=nobar-mp4-proxy deno.ts
// URL: https://nobar-mp4-proxy.deno.dev
//
// bcdn.hakunaymatata.com blocks:
//   - Browser User-Agent (428)
//   - Cloudflare Worker headers: Cf-Worker, Cdn-Loop, Cf-Ew-Via (427)
// Deno Deploy doesn't add any of these headers → bcdn accepts!

import { serve } from "https://deno.land/std/http/server.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  if (url.pathname !== "/mp4" && url.pathname !== "/mp4/") {
    return new Response("MP4 proxy. Usage: /mp4?url={encoded_url}", { headers: CORS });
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("Missing url param", { status: 400, headers: CORS });
  }

  // Build headers based on CDN domain
  const headers: Record<string, string> = {
    "Accept": "*/*",
  };
  
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // vidlink.pro MP4 CDN — blocks browser UA, send NO User-Agent
    // Deno Deploy sends "Deno/<version>" by default — bcdn might accept it
    // If not, we override with empty string
    headers["User-Agent"] = "";
  } else if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    // mzfi.me MP4 CDN — requires Referer anti-leech
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  } else {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
  }

  try {
    const res = await fetch(targetUrl, { headers, redirect: "follow" });
    const respHeaders = new Headers(CORS);
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = res.headers.get(h);
      if (v) respHeaders.set(h, v);
    }
    respHeaders.set("Cache-Control", "public, max-age=3600");
    return new Response(res.body, { status: res.status, headers: respHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response("Fetch failed: " + msg, { status: 502, headers: CORS });
  }
}, { port: 8000 });

import { NextResponse } from "next/server";

// Edge runtime — runs on Cloudflare edge network (300+ POPs)
// Faster than Node.js runtime for video streaming.

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  const mbToken = url.searchParams.get("mbtoken");

  if (!targetUrl) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
  } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // vidlink: no UA, no Referer
  } else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
    headers["Referer"] = "https://movieboxhd.net/";
    headers["Origin"] = "https://movieboxhd.net";
    if (mbToken) headers["X-MB-Token"] = mbToken;
  }

  try {
    const res = await fetch(targetUrl, { headers });

    const respHeaders = new Headers(res.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "Range");
    respHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    respHeaders.set("Cache-Control", "public, max-age=3600");

    return new NextResponse(res.body, { status: res.status, headers: respHeaders });
  } catch (err) {
    return NextResponse.json({ error: "Edge proxy failed" }, { status: 502 });
  }
}

import { NextResponse } from "next/server";

// GET /api/proxy?url={encoded_url}
// Streams video/audio content through our server with proper headers.
// Bypasses CORS + Referer restrictions on CDN stream URLs.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    // Determine Referer based on stream URL domain
    let referer = "https://videm.xyz/";
    if (targetUrl.includes("vidlink.pro")) referer = "https://vidlink.pro/";
    else if (targetUrl.includes("hakunaymatata.com")) referer = "https://mzfi.me/";
    else if (targetUrl.includes("videm.xyz")) referer = "https://videm.xyz/embed/";

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": referer,
        "Origin": referer.replace(/\/$/, ""),
      },
      // Pass through Range header for video seeking
      ...(request.headers.get("range")
        ? { headers: { ...request.headers, Range: request.headers.get("range") || "" } }
        : {}),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Stream fetch failed: ${res.status}` },
        { status: res.status }
      );
    }

    // Get content type + length
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const contentLength = res.headers.get("content-length");
    const acceptRanges = res.headers.get("accept-ranges");
    const contentRange = res.headers.get("content-range");

    // Stream the response body
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(res.body, { headers });
  } catch (err) {
    console.error("Proxy error:", err);
    return NextResponse.json(
      { error: "Failed to proxy stream" },
      { status: 500 }
    );
  }
}

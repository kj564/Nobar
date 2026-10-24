import { NextResponse } from "next/server";

// GET /api/proxy?url={encoded_url}
// Streams video content through our server with proper headers.
// For videm.xyz: fetches embed page first to get session cookie, then proxies stream.
//
// Vercel: must use Node.js runtime (not edge) for large video streaming.
// Edge runtime truncates large responses; Node.js runtime streams properly.
// Set maxDuration=300s so seeking through a 2GB movie doesn't timeout.

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    // Determine Referer + Origin based on stream URL domain.
    // Both mzfi and vidlink use hakunaymatata.com CDN, but different
    // subdomains require different Referer headers:
    //   bcdnxw.hakunaymatata.com → mzfi.me (mzfi streams)
    //   bcdn.hakunaymatata.com   → vidlink.pro (vidlink streams)
    let referer = "https://videm.xyz/embed/";
    let origin = "https://videm.xyz";
    
    if (targetUrl.includes("vidlink.pro")) {
      referer = "https://vidlink.pro/";
      origin = "https://vidlink.pro";
    } else if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      // mzfi.me streams use bcdnxw subdomain
      referer = "https://mzfi.me/";
      origin = "https://mzfi.me";
    } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
      // vidlink.pro streams use bcdn subdomain — CDN REJECTS Referer header!
      // Returns 429 if any Referer is sent, 206 without Referer.
      // Do NOT send Referer/Origin for bcdn subdomain.
      referer = "";
      origin = "";
    } else if (targetUrl.includes("hakunaymatata.com")) {
      // Default for other hakunaymatata subdomains
      referer = "https://mzfi.me/";
      origin = "https://mzfi.me";
    } else if (targetUrl.includes("videm.xyz")) {
      referer = "https://videm.xyz/embed/";
      origin = "https://videm.xyz";
    }

    // Build headers — only include Referer/Origin if non-empty
    // (bcdn.hakunaymatata.com REJECTS requests with Referer header → 429)
    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (referer) fetchHeaders["Referer"] = referer;
    if (origin) fetchHeaders["Origin"] = origin;

    // Pass through Range header for video seeking
    const range = request.headers.get("range");
    if (range) {
      fetchHeaders["Range"] = range;
    }

    const res = await fetch(targetUrl, { headers: fetchHeaders });

    if (!res.ok) {
      // If 403, try without Origin header (some CDNs reject it)
      if (res.status === 403) {
        const retryHeaders = { ...fetchHeaders };
        delete retryHeaders["Origin"];
        const retryRes = await fetch(targetUrl, { headers: retryHeaders });
        if (retryRes.ok) {
          return streamResponse(retryRes);
        }
      }
      
      // If still failing, try with videm.xyz embed page referer
      if (res.status === 403 && targetUrl.includes("videm.xyz")) {
        // Try fetching the stream with a session-like approach
        const embedRetryHeaders = { ...fetchHeaders };
        embedRetryHeaders["Referer"] = "https://videm.xyz/embed/movie/550";
        embedRetryHeaders["Sec-Fetch-Dest"] = "empty";
        embedRetryHeaders["Sec-Fetch-Mode"] = "cors";
        embedRetryHeaders["Sec-Fetch-Site"] = "same-origin";
        const retryRes2 = await fetch(targetUrl, { headers: embedRetryHeaders });
        if (retryRes2.ok) {
          return streamResponse(retryRes2);
        }
      }

      return NextResponse.json(
        { error: `Stream fetch failed: ${res.status}`, url: targetUrl },
        { status: res.status }
      );
    }

    return streamResponse(res);
  } catch (err) {
    console.error("Proxy error:", err);
    return NextResponse.json(
      { error: "Failed to proxy stream" },
      { status: 500 }
    );
  }
}

function streamResponse(res: Response): NextResponse {
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const contentLength = res.headers.get("content-length");
  const acceptRanges = res.headers.get("accept-ranges");
  const contentRange = res.headers.get("content-range");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Headers": "Range",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
  };
  if (contentLength) headers["Content-Length"] = contentLength;
  if (acceptRanges) headers["Accept-Ranges"] = acceptRanges;
  if (contentRange) headers["Content-Range"] = contentRange;

  // CRITICAL: pass through the upstream status code. If mzfi CDN returned
  // 206 (Partial Content) for a Range request, we MUST return 206 too —
  // otherwise the browser treats it as a full 200 response and seeking
  // breaks (decode errors because the byte offsets don't match currentTime).
  const status = res.status;

  return new NextResponse(res.body, { status, headers });
}

/**
 * Local test server — mirrors Cloudflare Worker behavior EXACTLY.
 * Streams response (no buffering) for video playback.
 */
import http from "http";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8787");

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

  if (url.pathname === "/test") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
    return;
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing url parameter" }));
    return;
  }

  const headers = { Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" };
  if (req.headers.range) headers.Range = req.headers.range;

  if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
  } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // vidlink: no UA, no Referer
  } else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
    const mbtoken = url.searchParams.get("mbtoken") || "";
    headers["Referer"] = "https://movieboxhd.net/";
    headers["Origin"] = "https://movieboxhd.net";
    if (mbtoken) headers["X-MB-Token"] = mbtoken;
  }

  console.log(`[proxy] ${targetUrl.slice(0, 80)}...`);

  try {
    const r = await fetch(targetUrl, { headers });
    console.log(`[proxy] → ${r.status}`);

    // Stream response headers
    const respHeaders = {
      "Content-Type": r.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    };
    if (r.headers.get("content-length")) respHeaders["Content-Length"] = r.headers.get("content-length");
    if (r.headers.get("content-range")) respHeaders["Content-Range"] = r.headers.get("content-range");
    if (r.headers.get("accept-ranges")) respHeaders["Accept-Ranges"] = r.headers.get("accept-ranges");

    res.writeHead(r.status, respHeaders);

    // STREAM response body (no buffering!)
    const reader = r.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    pump().catch(err => {
      console.error("[proxy] stream error:", err.message);
      res.end();
    });
  } catch (err) {
    console.error("[proxy] error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(8787, () => console.log("Local CDN proxy (streaming): http://localhost:8787"));

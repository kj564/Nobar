/**
 * Local test server — simulates Cloudflare Worker behavior
 * Run: node mini-services/cdn-proxy/test-local.mjs
 * Test: http://localhost:8787/?url=<encoded-CDN-url>
 */
import http from "http";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8787");

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing url parameter" }));
    return;
  }

  // Build headers
  const headers = { Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" };
  if (req.headers.range) headers.Range = req.headers.range;

  if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    headers["Referer"] = "https://mzfi.me/";
    headers["Origin"] = "https://mzfi.me";
  } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
    // vidlink: no UA, no Referer (Node fetch sends no UA by default)
  } else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
    const mbtoken = url.searchParams.get("mbtoken") || "";
    headers["Referer"] = "https://movieboxhd.net/";
    if (mbtoken) headers["X-MB-Token"] = mbtoken;
  }

  console.log(`[proxy] ${targetUrl.slice(0, 80)}... headers:`, Object.keys(headers).join(","));

  try {
    const r = await fetch(targetUrl, { headers });
    res.writeHead(r.status, {
      "Content-Type": r.headers.get("content-type") || "application/octet-stream",
      "Content-Length": r.headers.get("content-length") || "",
      "Content-Range": r.headers.get("content-range") || "",
      "Accept-Ranges": r.headers.get("accept-ranges") || "",
      "Cache-Control": "public, max-age=3600",
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
    console.log(`[proxy] → ${r.status} (${buf.length}b)`);
  } catch (err) {
    console.error("[proxy] error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(8787, () => console.log("Local CDN proxy test server: http://localhost:8787"));

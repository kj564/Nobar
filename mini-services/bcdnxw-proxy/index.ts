// bcdnxw-proxy — adds Referer: mzfi.me for bcdnxw URLs.
// Non-CF IP → bcdnxw accepts → 206.
// Deploy: fly.io / Render / Railway / Oracle Cloud VPS
Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("OK", { headers: { "Access-Control-Allow-Origin": "*" } });
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("Usage: /?url={encoded_bcdnxw_url}", { status: 400 });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS", "Access-Control-Allow-Headers": "Range", "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges" } });
    try {
      const h = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36", "Referer": "https://mzfi.me/", "Origin": "https://mzfi.me", "Accept": "*/*" };
      const r = req.headers.get("range"); if (r) h.Range = r;
      const res = await fetch(targetUrl, { headers: h, redirect: "follow" });
      const rh = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges", "Cache-Control": "public, max-age=3600" };
      for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = res.headers.get(k); if (v) rh[k] = v; }
      return new Response(res.body, { status: res.status, headers: rh });
    } catch (e) { return new Response("Proxy error: " + e.message, { status: 502 }); }
  },
});
console.log("[bcdnxw-proxy] :3000");

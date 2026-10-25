export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/test") {
      return new Response(JSON.stringify({
        ok: true,
        message: "Worker is running",
        time: new Date().toISOString(),
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (url.pathname === "/fetch-test") {
      // Test if outbound fetch works
      try {
        const r = await fetch("https://httpbin.org/get");
        const text = await r.text();
        return new Response(JSON.stringify({
          ok: true,
          status: r.status,
          body: text.slice(0, 500),
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (err) {
        return new Response(JSON.stringify({
          ok: false,
          error: String(err),
        }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "missing url parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Build headers based on CDN domain
    const headers = new Headers();
    headers.set("Accept", "*/*");
    headers.set("Accept-Language", "en-US,en;q=0.9");

    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    if (targetUrl.includes("bcdnxw.hakunaymatata.com")) {
      headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      headers.set("Referer", "https://mzfi.me/");
      headers.set("Origin", "https://mzfi.me");
    } else if (targetUrl.includes("bcdn.hakunaymatata.com")) {
      // vidlink: no UA, no Referer
    } else if (targetUrl.includes("sbcdnw.hakunaymatata.com")) {
      const mbtoken = url.searchParams.get("mbtoken") || "";
      headers.set("Referer", "https://movieboxhd.net/");
      headers.set("Origin", "https://movieboxhd.net");
      if (mbtoken) headers.set("X-MB-Token", mbtoken);
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
      return new Response(JSON.stringify({
        error: "fetch failed",
        detail: String(err),
        targetUrl: targetUrl.slice(0, 80),
      }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};

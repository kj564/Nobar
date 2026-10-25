import { NextResponse } from "next/server";

// GET /api/vidsrc-hls/[id]?kind=movie&season=1&episode=1
// Returns HLS m3u8 playlist with all URLs rewritten to /api/proxy
// Server-side fetch (same IP as play API call → no IP-bound 403)

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = Number(url.searchParams.get("season") || 1);
  const episode = Number(url.searchParams.get("episode") || 1);
  const variantIndex = url.searchParams.get("v"); // which variant to fetch

  const proxyOrigin = `${url.protocol}//${url.host}`;

  // If variantIndex is set, fetch that specific variant playlist
  if (variantIndex !== null) {
    // We need to re-run the whole flow to get variant URLs, then fetch the requested variant
    // This is not ideal but necessary because sessions are IP-bound
    // TODO: cache the session
  }

  // Step 1: Fetch embed page
  const embedUrl = kind === "tv"
    ? `https://vidsrc.buzz/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://vidsrc.buzz/embed/movie/${tmdbId}`;

  const pageRes = await fetch(embedUrl, { headers: { "User-Agent": UA, Referer: "https://vidsrc.buzz/" } });
  if (!pageRes.ok) return NextResponse.json({ error: "embed failed" }, { status: 502 });
  const html = await pageRes.text();

  const tokenMatch = html.match(/"t":"([^"]+)"/);
  const idMatch = html.match(/"id":"(tt\d+)"/);
  if (!tokenMatch || !idMatch) return NextResponse.json({ error: "no token" }, { status: 502 });

  const token = tokenMatch[1];
  const imdbId = idMatch[1];
  const encToken = encodeURIComponent(token);

  // Step 2: Sources API
  const typeParam = kind === "tv" ? "tv" : "movie";
  const sourcesUrl = `https://vidsrc.buzz/pl/api.php?a=sources&type=${typeParam}&id=${imdbId}&s=${kind === "tv" ? season : 0}&e=${kind === "tv" ? episode : 0}&t=${encToken}`;
  const sourcesRes = await fetch(sourcesUrl, { headers: { "User-Agent": UA, Referer: embedUrl, Accept: "application/json" } });
  if (!sourcesRes.ok) return NextResponse.json({ error: "sources failed" }, { status: 502 });
  const sourcesData = await sourcesRes.json();
  if (sourcesData?.error || !sourcesData?.servers?.length) return NextResponse.json({ error: "no servers" }, { status: 502 });

  // Step 3: Play API
  let streamUrl = "";
  for (const server of sourcesData.servers) {
    const ref = server.ref;
    if (!ref) continue;
    const encRef = encodeURIComponent(ref);
    const playRes = await fetch(`https://vidsrc.buzz/pl/api.php?a=play&ref=${encRef}`, { headers: { "User-Agent": UA, Referer: embedUrl, Accept: "application/json" } });
    if (!playRes.ok) continue;
    const playData = await playRes.json();
    if (playData?.url && playData?.type === "hls") {
      streamUrl = playData.url.startsWith("http") ? playData.url : `https://vidsrc.buzz${playData.url}`;
      break;
    }
  }
  if (!streamUrl) return NextResponse.json({ error: "no stream" }, { status: 502 });

  // Step 4: Fetch master playlist
  const masterRes = await fetch(streamUrl, { headers: { "User-Agent": UA, Referer: embedUrl } });
  if (!masterRes.ok) return NextResponse.json({ error: "master playlist failed" }, { status: 502 });
  let masterM3u8 = await masterRes.text();

  // Step 5: If master has variants, fetch each variant and inline segment URLs
  const hasVariants = masterM3u8.includes("#EXT-X-STREAM-INF");

  if (hasVariants) {
    // For each variant, fetch the variant playlist and rewrite URLs
    // Then replace the variant URL with a new endpoint that returns the variant
    const lines = masterM3u8.split("\n");
    let rebuilt = "#EXTM3U\n";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const variantUrl = lines[i + 1]?.trim();
        if (variantUrl) {
          const fullVariantUrl = variantUrl.startsWith("http") ? variantUrl : `https://vidsrc.buzz${variantUrl}`;
          // Fetch variant playlist
          const vRes = await fetch(fullVariantUrl, { headers: { "User-Agent": UA, Referer: embedUrl } });
          if (vRes.ok) {
            const vM3u8 = await vRes.text();
            // Rewrite segment URLs to absolute proxy URLs
            const rewritten = vM3u8.split("\n").map((l: string) => {
              const t = l.trim();
              if (!t || t.startsWith("#")) return l;
              const fullUrl = t.startsWith("http") ? t : `https://vidsrc.buzz${t}`;
              return `${proxyOrigin}/api/proxy?url=${encodeURIComponent(fullUrl)}`;
            }).join("\n");
            // Encode as data URL (hls.js supports data: URLs for media playlists)
            const dataUrl = `data:application/vnd.apple.mpegurl;base64,${Buffer.from(rewritten).toString("base64")}`;
            rebuilt += line + "\n" + dataUrl + "\n";
          }
        }
        i++;
      } else if (line && !line.startsWith("#EXTM3U")) {
        rebuilt += line + "\n";
      }
    }
    masterM3u8 = rebuilt;
  } else {
    // Media playlist: rewrite segment URLs directly
    masterM3u8 = masterM3u8.split("\n").map((l: string) => {
      const t = l.trim();
      if (!t || t.startsWith("#")) return l;
      const fullUrl = t.startsWith("http") ? t : `https://vidsrc.buzz${t}`;
      return `${proxyOrigin}/api/proxy?url=${encodeURIComponent(fullUrl)}`;
    }).join("\n");
  }

  return new NextResponse(masterM3u8, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

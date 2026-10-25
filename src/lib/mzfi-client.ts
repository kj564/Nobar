// Client-side mzfi.me API wrapper
// mzfi.me is CORS-open (ACAO:*) so browser can call it directly.
// Token is extracted from x-user response header (not set-cookie).

const MZFI_HEADERS = {
  "Accept": "application/json",
  "Origin": "https://mzfi.me",
  "Referer": "https://mzfi.me/",
};

let cachedToken: { token: string; ts: number } | null = null;
const TOKEN_TTL = 30 * 60 * 1000; // 30 min

async function getMzfiToken(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedToken.ts < TOKEN_TTL) {
    return cachedToken.token;
  }
  const r = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: MZFI_HEADERS,
  });
  // Token is in x-user header (not set-cookie — that's blocked by CORS)
  const xUser = r.headers.get("x-user") || "";
  const m = xUser.match(/"token"\s*:\s*"([^"]+)"/);
  if (m) {
    cachedToken = { token: m[1], ts: Date.now() };
    return m[1];
  }
  return null;
}

function normalizeTitle(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function resolveMzfiStream(
  title: string,
  year: string,
  kind: "movie" | "tv" = "movie"
): Promise<Array<{ quality: string; url: string; provider: string; type: string }>> {
  if (!title) return [];
  
  const token = await getMzfiToken();
  if (!token) return [];

  // Search
  const searchRes = await fetch("https://mzfi.me/wefeed-h5api-bff/subject/search", {
    method: "POST",
    headers: { ...MZFI_HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ keyword: title, page: 1, perPage: 20 }),
  });
  const searchData = await searchRes.json();
  const items = searchData?.data?.items || [];

  // Find matching item
  const normTitle = normalizeTitle(title);
  let target: any = null;
  for (const item of items) {
    const itemNorm = normalizeTitle(item.title || "");
    const itemYear = (item.releaseDate || "").slice(0, 4);
    if (itemNorm === normTitle && Math.abs(Number(itemYear) - Number(year)) <= 1) {
      target = item;
      break;
    }
  }
  if (!target) {
    for (const item of items) {
      const itemNorm = normalizeTitle(item.title || "");
      if (itemNorm.includes(normTitle) || normTitle.includes(itemNorm)) {
        target = item;
        break;
      }
    }
  }
  if (!target) return [];

  // Play
  const seParam = kind === "tv" ? 1 : 0;
  const epParam = kind === "tv" ? 1 : 0;
  const playUrl = `https://mzfi.me/wefeed-h5api-bff/subject/play?subjectId=${target.subjectId}&se=${seParam}&ep=${epParam}&detailPath=${target.detailPath}&streamSignType=1&supportCodecs%5Bh264%5D=1`;
  const playRes = await fetch(playUrl, {
    headers: {
      ...MZFI_HEADERS,
      Authorization: `Bearer ${token}`,
      Referer: `https://mzfi.me/spa/videoPlayPage/movies/${target.detailPath}?id=${target.subjectId}`,
    },
  });
  const playData = await playRes.json();
  const data = playData?.data;
  if (!data) return [];

  const streams = data.streams || [];
  const sources: Array<{ quality: string; url: string; provider: string; type: string }> = [];

  for (const s of streams) {
    if (s.url) {
      // Wrap through Worker /mp4 proxy (adds Referer: mzfi.me for bcdnxw)
      const CDN_PROXY_URL = process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";
      const CDN_PROXY_PORT = "3003";
      const proxyPath = `/mp4?url=${encodeURIComponent(s.url)}`;
      const proxyUrl = CDN_PROXY_URL
        ? `${CDN_PROXY_URL}${proxyPath}`
        : `${proxyPath}${proxyPath.includes("?") ? "&" : "?"}XTransformPort=${CDN_PROXY_PORT}`;
      sources.push({
        quality: `${s.id || "auto"}p`,
        url: proxyUrl,
        provider: "mzfi.me",
        type: "mp4",
      });
    }
  }

  return sources;
}

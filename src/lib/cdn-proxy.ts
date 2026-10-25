const CDN_PROXY_URL = process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";
const CDN_PROXY_PORT = "3003";
const isStaticMode = typeof window !== "undefined" && (window.location.hostname.includes("github.io") || CDN_PROXY_URL.length > 0);

function proxyUrl(path: string): string {
  if (isStaticMode && CDN_PROXY_URL) return `${CDN_PROXY_URL}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${CDN_PROXY_PORT}`;
}

export async function resolveStream(
  tmdbId: number,
  kind: "movie" | "tv" = "movie",
  season: number = 1,
  episode: number = 1
): Promise<{
  sources: Array<{ quality: string; url: string; provider: string; type: string; auth?: any }>;
  subtitles: Array<{ language: string; url: string }>;
  embedUrl?: string | null;
}> {
  const params = new URLSearchParams({ kind, season: String(season), episode: String(episode) });
  const url = proxyUrl(`/vidlink/${tmdbId}?${params}`);
  const res = await fetch(url);
  if (!res.ok) return { sources: [], subtitles: [], embedUrl: null };
  const data = await res.json();

  const hasHls = data.sources?.some((s: any) => s.type === "hls-direct");

  if (!hasHls) {
    // No HLS from vidlink → try mzfi.me (Worker handles search + play + auth)
    // mzfi has a HUGE catalog (thousands of movies) with direct MP4 URLs
    try {
      // Get title + year from TMDB (CORS-open, direct browser call)
      const tmdbEndpoint = kind === "tv" ? "tv" : "movie";
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/${tmdbEndpoint}/${tmdbId}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY || "a3ce3ae3ddb29e9417ffcc2889becf9b"}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        const title = tmdbData.title || tmdbData.name || "";
        const dateField = kind === "tv" ? "first_air_date" : "release_date";
        const year = ((tmdbData as any)[dateField] || "").slice(0, 4);

        if (title && year) {
          // Call CDN proxy's mzfi resolver
          const mzfiParams = new URLSearchParams({ kind, title, year });
          const mzfiUrl = proxyUrl(`/mzfi/${tmdbId}?${mzfiParams}`);
          const mzfiRes = await fetch(mzfiUrl, { signal: AbortSignal.timeout(15000) });
          if (mzfiRes.ok) {
            const mzfiData = await mzfiRes.json();
            if (mzfiData.sources && mzfiData.sources.length > 0) {
              // mzfi found it! Return proxied MP4 sources (ad-free!)
              return mzfiData;
            }
          }
        }
      }
    } catch {}

    // mzfi didn't have it → use vidlink.pro embed (has ads but plays)
    if (kind === "tv") {
      return { sources: [], subtitles: [], embedUrl: `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` };
    }
    return { sources: [], subtitles: [], embedUrl: `https://vidlink.pro/movie/${tmdbId}` };
  }

  return data;
}

export async function resolveIdlix(slug: string): Promise<string | null> {
  const url = proxyUrl(`/idlix/${slug}`);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedUrl || null;
}

export async function fetchMzfiCatalog(): Promise<any> {
  const url = proxyUrl("/mzfi/catalog");
  const res = await fetch(url);
  if (!res.ok) return { trending: [], recommended: [] };
  return res.json();
}

export function buildIdlixSlug(title: string, year: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[:;,\(\)\.\!\?]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}-${year}`;
}

export { isStaticMode };

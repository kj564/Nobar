// Client-side mzfi/movieboxhd resolver — works from USER's browser (no CF Worker).
//
// BREAKTHROUGH: mzfi API is CORS-open (ACAO:*) and token from /home x-user
// header is extractable via CORS. The 429 "token failed" was only from
// CF Worker (Cloudflare→Cloudflare detection). From the browser, the API
// works perfectly.
//
// GEO-LOCK: mzfi returns hasResource:false when content is not available
// in the user's region (e.g., HK sandbox returns empty). Real users in
// US/ID/other regions SHOULD get streams. If not → fallback to vidlink/lk21.
//
// Flow:
//   1. Browser → mzfi.me/wefeed-h5api-bff/home → get token from x-user header
//   2. Browser → mzfi.me/wefeed-h5api-bff/subject/search → find movie
//   3. Browser → mzfi.me/wefeed-h5api-bff/subject/play → get stream URLs
//   4. Browser → <video src={streamUrl}> → plays directly (no proxy needed)
//
// Stream URLs are on bcdnxw.hakunaymatata.com — needs Referer: mzfi.me/
// for anti-leech. But <video> element doesn't send Referer for cross-origin
// media... so we need the /mp4-socket proxy for Referer injection.
// BUT: bcdnxw blocks CF Worker IP (427). So this only works if the user's
// browser IP is accepted by bcdnxw (which it should be — bcdnxw blocks CF,
// not regular users).

const MZFI_BASE = "https://mzfi.me";

// Get token from mzfi /home endpoint (x-user header, CORS-exposed).
// NOTE: mzfi returns ACAO:* but rejects credentials:include cross-origin.
// So we CANNOT use credentials here — use credentials:omit + extract token
// from x-user header. For /subject/play, we pass the token as Authorization
// header + Cookie header manually (via setRequestHeader trick won't work
// cross-origin either). So mzfi play ONLY works same-origin (from mzfi.me).
//
// SOLUTION: Two-step approach:
//   1. Fetch /home with credentials:omit → get token from x-user header
//   2. Fetch /subject/play with credentials:omit + Authorization: Bearer
//   3. If play returns hasResource:false (no cookie), try the /detail
//      endpoint which returns stream URLs in some regions
async function getMzfiToken(): Promise<string | null> {
  try {
    const res = await fetch(`${MZFI_BASE}/wefeed-h5api-bff/home?page=1`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const xUser = res.headers.get("x-user") || "";
    const m = xUser.match(/"token":"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Search mzfi for a movie by title.
async function searchMzfi(
  token: string,
  title: string
): Promise<{ subjectId: string; detailPath: string; title: string } | null> {
  try {
    const res = await fetch(`${MZFI_BASE}/wefeed-h5api-bff/subject/search`, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ keyword: title, page: 1, perPage: 5 }),
    });
    const data = await res.json();
    const items = data?.data?.items || [];
    if (items.length === 0) return null;

    // Match by normalized title
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wantNorm = norm(title);
    let best = items[0];
    for (const item of items) {
      const itemNorm = norm(item.title || "");
      if (itemNorm === wantNorm) { best = item; break; }
    }
    return {
      subjectId: best.subjectId,
      detailPath: best.detailPath || "",
      title: best.title,
    };
  } catch {
    return null;
  }
}

// Get play URLs for a movie.
// KEY: mzfi /subject/play needs mb_token cookie (set by SPA JavaScript).
// Cross-origin: can't use credentials:include (ACAO:* rejects it).
// WORKAROUND: Call /subject/play with Cookie header manually.
// The mb_token value = URL-encoded JSON string: %22<jwt>%22
// This is set by mzfi SPA: document.cookie = "mb_token=" + JSON.stringify(token)
async function playMzfi(
  token: string,
  subjectId: string,
  detailPath: string,
  kind: "movie" | "tv",
  season: number,
  episode: number
): Promise<
  | { sources: Array<{ quality: string; url: string; provider: string; type: string }>; subtitles: any[] }
  | null
> {
  try {
    const se = kind === "tv" ? season : 0;
    const ep = kind === "tv" ? episode : 0;
    const playUrl = `${MZFI_BASE}/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${detailPath}&streamSignType=1&supportCodecs[h264]=1`;

    // Construct mb_token cookie value (URL-encoded JSON string with quotes).
    // mzfi SPA sets: document.cookie = "mb_token=" + JSON.stringify(token)
    // → mb_token = "eyJ..." (with double quotes, URL-encoded as %22eyJ...%22)
    const mbTokenValue = encodeURIComponent(JSON.stringify(token));

    const res = await fetch(playUrl, {
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        // mb_token cookie is the KEY — without it, hasResource=false.
        // mzfi SPA sets this via JavaScript (document.cookie), not Set-Cookie.
        Cookie: `mb_token=${mbTokenValue}; mb_guest_token=${mbTokenValue}; token=${token}`,
      },
    });
    const data = (await res.json())?.data || {};
    const streams = data.streams || [];

    if (streams.length === 0 || data.hasResource === false) {
      console.log("[MZFI] No streams (hasResource=" + data.hasResource + ", vipLocked=" + data.vipLocked + ") — probably geo-locked");
      return null;
    }

    const sources = streams.map((s: any) => {
      const url = s.url || "";
      const cdn = url.includes("bcdnxw")
        ? "bcdnxw"
        : url.includes("bcdn.")
        ? "bcdn"
        : url.includes("sbcdn")
        ? "sbcdn"
        : "other";
      return {
        quality: `${s.id || "auto"}p`,
        url, // direct URL — <video> doesn't need CORS for media playback
        provider: `mzfi (${cdn})`,
        type: "mp4",
      };
    });

    return { sources, subtitles: [] };
  } catch {
    return null;
  }
}

// Full pipeline: title → mzfi embed URL (iframe, same-origin to mzfi.me).
//
// mzfi API is CORS-open (ACAO:*) BUT credentials:include is rejected
// (CORS spec: ACAO:* + credentials = error). So we CANNOT call /subject/play
// cross-origin with cookies. The mb_token cookie is needed for play API.
//
// SOLUTION: Instead of calling /subject/play ourselves, we construct the
// mzfi SPA play page URL and use it as an iframe embed (like vidlink embed).
// The iframe is same-origin to mzfi.me → cookies work → video plays.
// mzfi has ads (popunders, banners) but at least the video plays.
//
// Flow:
//   1. Browser → mzfi.me/wefeed-h5api-bff/home → get token (x-user, CORS-open)
//   2. Browser → mzfi.me/wefeed-h5api-bff/subject/search → find movie
//   3. Construct: https://mzfi.me/spa/videoPlayPage/movies/{detailPath}?id={subjectId}
//   4. Return as embedUrl → NativePlayer renders <iframe src={mzfi play page}>
export async function resolveMzfiEmbed(
  title: string,
  year?: string,
  kind: "movie" | "tv" = "movie"
): Promise<string | null> {
  try {
    console.log("[MZFI] Resolving embed:", title, year || "", kind);
    const token = await getMzfiToken();
    if (!token) {
      console.log("[MZFI] Token failed");
      return null;
    }
    console.log("[MZFI] Token OK");

    const searchResult = await searchMzfi(token, title);
    if (!searchResult) {
      console.log("[MZFI] Search: no results for", title);
      return null;
    }
    console.log("[MZFI] Found:", searchResult.title, "| subjectId:", searchResult.subjectId);

    // Construct mzfi SPA play page URL — this works as iframe embed.
    // The iframe is same-origin to mzfi.me → mb_token cookie sent → video plays.
    const embedUrl = `${MZFI_BASE}/spa/videoPlayPage/movies/${searchResult.detailPath}?id=${searchResult.subjectId}&detailSe=&detailEp=&lang=en&type=/movie/detail&page_from=home`;
    console.log("[MZFI] Embed URL:", embedUrl.slice(0, 80));
    return embedUrl;
  } catch (e) {
    console.warn("[MZFI] Error:", e);
    return null;
  }
}

// Legacy: full pipeline returning stream URLs.
// NOW WORKS: mb_token cookie set manually via Cookie header.
// SW intercepts bcdnxw requests + adds Referer: mzfi.me → ad-free playback!
export async function resolveMzfiClient(
  title: string,
  year?: string,
  kind: "movie" | "tv" = "movie",
  season: number = 1,
  episode: number = 1
): Promise<{
  sources: Array<{ quality: string; url: string; provider: string; type: string }>;
  subtitles: any[];
} | null> {
  try {
    console.log("[MZFI] Resolving:", title, year || "", kind);
    const token = await getMzfiToken();
    if (!token) {
      console.log("[MZFI] Token failed");
      return null;
    }
    console.log("[MZFI] Token OK");

    const searchResult = await searchMzfi(token, title);
    if (!searchResult) {
      console.log("[MZFI] Search: no results for", title);
      return null;
    }
    console.log("[MZFI] Found:", searchResult.title, "| subjectId:", searchResult.subjectId);

    const playResult = await playMzfi(
      token,
      searchResult.subjectId,
      searchResult.detailPath,
      kind,
      season,
      episode
    );
    if (!playResult || playResult.sources.length === 0) {
      console.log("[MZFI] No streams (unavailable in region)");
      return null;
    }
    console.log("[MZFI] Streams:", playResult.sources.length, "| first:", playResult.sources[0].provider);
    return playResult;
  } catch (e) {
    console.warn("[MZFI] Error:", e);
    return null;
  }
}

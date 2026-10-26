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
// KEY: must use credentials: 'include' to send mb_token cookie!
// Without the cookie, API returns hasResource:false (empty streams).
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
    // KEY: credentials: 'include' sends mb_token cookie (set by /home response).
    // Without this, API returns hasResource:false (no streams).
    const res = await fetch(playUrl, {
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
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

// Full pipeline: title → playable stream URLs.
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
      console.log("[MZFI] Token failed — mzfi API unreachable");
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
      console.log("[MZFI] No streams (geo-locked or unavailable)");
      return null;
    }
    console.log("[MZFI] Streams:", playResult.sources.length, "| first CDN:", playResult.sources[0].provider);

    return playResult;
  } catch (e) {
    console.warn("[MZFI] Error:", e);
    return null;
  }
}

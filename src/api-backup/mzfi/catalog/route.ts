import { NextResponse } from "next/server";

// GET /api/mzfi/catalog
// Returns mzfi's curated catalog — trending + recommended movies/shows
// directly from mzfi's own BFF. These titles are GUARANTEED to have playable
// streams on mzfi (vs TMDB trending which may not be in mzfi's catalog).
//
// Data sources:
//   /wefeed-h5api-bff/subject/trending — 12 trending items
//   /wefeed-h5api-bff/subject/recommend — 10 recommended movies
//
// Both endpoints require Cookie header (not Authorization Bearer).
// Token is minted via /home?page=1 (Set-Cookie pattern).
//
// Response format:
//   { trending: [...12 items], recommended: [...10 items] }
// Each item: { subjectId, title, year, genre, imdbRating, posterUrl, subjectType }
// subjectType: 1=movie, 2=tv

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";

// In-memory cache: 30min TTL (mzfi catalog rarely changes)
// Prevents token-mint storms + rate-limiting on repeated home page loads.
type CatalogItem = {
  subjectId: string;
  title: string;
  year: string;
  genre: string;
  imdbRating: string;
  posterUrl: string;
  subjectType: number; // 1=movie, 2=tv
};

type CatalogData = {
  trending: CatalogItem[];
  recommended: CatalogItem[];
};

let cachedCatalog: { data: CatalogData; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://mzfi.me",
  Referer: "https://mzfi.me/",
};

async function getMzfiToken(): Promise<string | null> {
  const r = await fetch("https://mzfi.me/wefeed-h5api-bff/home?page=1", {
    headers: COMMON_HEADERS,
  });
  const setCookie = r.headers.get("set-cookie") || "";
  // mzfi uses cookie name "token" (not "mb_guest_token")
  const m = setCookie.match(/token=([^;]+)/);
  if (m) return m[1].replace(/%22/g, "").replace(/^"|"$/g, "");
  // Fallback: try x-user header
  const xUser = r.headers.get("x-user") || "";
  const m2 = xUser.match(/"token"\s*:\s*"([^"]+)"/);
  if (m2) return m2[1];
  return null;
}

function normalizeSubject(s: any): CatalogItem {
  return {
    subjectId: s.subjectId || s.id || "",
    title: s.title || s.name || "",
    year: (s.releaseDate || "").toString().slice(0, 4),
    genre: s.genre || "",
    imdbRating: s.imdbRatingValue || "",
    posterUrl: s.cover?.url || s.cover || "",
    subjectType: s.subjectType || 1,
  };
}

export async function GET() {
  // Fast path: cached + fresh
  if (cachedCatalog && Date.now() - cachedCatalog.ts < CACHE_TTL) {
    return NextResponse.json(cachedCatalog.data, {
      headers: { "Cache-Control": "public, max-age=1800" },
    });
  }

  try {
    const token = await getMzfiToken();
    if (!token) {
      return NextResponse.json(
        { error: "Failed to mint mzfi token" },
        { status: 502 }
      );
    }

    // Fetch trending + recommend in parallel (both need Cookie header)
    const [trendingRes, recommendRes] = await Promise.all([
      fetch("https://mzfi.me/wefeed-h5api-bff/subject/trending", {
        headers: { ...COMMON_HEADERS, Cookie: `token=${token}` },
      }),
      fetch("https://mzfi.me/wefeed-h5api-bff/subject/recommend", {
        headers: { ...COMMON_HEADERS, Cookie: `token=${token}` },
      }),
    ]);

    const trending: CatalogItem[] = [];
    const recommended: CatalogItem[] = [];

    if (trendingRes.ok) {
      const trendingData = await trendingRes.json();
      const items = trendingData?.data?.subjectList || [];
      for (const s of items) {
        trending.push(normalizeSubject(s));
      }
    }

    if (recommendRes.ok) {
      const recommendData = await recommendRes.json();
      const items = recommendData?.data?.movieItems || [];
      for (const s of items) {
        recommended.push(normalizeSubject(s));
      }
    }

    const data: CatalogData = { trending, recommended };
    cachedCatalog = { data, ts: Date.now() };

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=1800" },
    });
  } catch (err) {
    console.error("[mzfi/catalog] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch mzfi catalog" },
      { status: 502 }
    );
  }
}

// Client-side TMDB API wrapper — for static export (GitHub Pages).
//
// Migration context:
//   The app is moving from Vercel (server-side rendering) to GitHub Pages
//   (static export). TMDB API is CORS-open (Access-Control-Allow-Origin: *),
//   so it can be called directly from the browser using a public API key
//   (NEXT_PUBLIC_TMDB_API_KEY). No proxy, no server functions, no egress.
//
// This module mirrors the function signatures of src/lib/tmdb.ts but every
// function is safe to call from client components (no server-only APIs,
// no secrets). TypeScript types are imported from ./tmdb so the shapes stay
// in sync with the server-side wrapper.
//
// Caching strategy (two layers):
//   1. In-memory Map with 5min TTL — per page session, prevents duplicate
//      fetches within a single tab (matches the server-side tmdb.ts pattern).
//   2. HTTP cache via fetch(cache: "force-cache") — relies on TMDB's
//      Cache-Control headers for cross-session persistence. force-cache
//      serves from HTTP cache even when stale, which is fine for read-only
//      catalog data and avoids burning API quota on repeat visits.

import type {
  TMDBMovie,
  TMDBSeries,
  TMDBGenre,
  TMDBMovieDetail,
  TMDBSeriesDetail,
  TMDBPaged,
  Category,
} from "./tmdb";

const TMDB_BASE = "https://api.themoviedb.org/3";

// Public API key — safe to expose. TMDB keys are read-only and rate-limited;
// there is no way to escalate a leaked key into write access. The fallback
// matches the server-side tmdb.ts so the app still builds even if the env
// var isn't set during local dev or CI.
const TMDB_API_KEY =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_TMDB_API_KEY) ||
  "a3ce3ae3ddb29e9417ffcc2889becf9b";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

/**
 * Core GET helper — builds the URL, checks the in-memory cache, then hits
 * the network with `cache: "force-cache"` so the browser HTTP cache kicks
 * in (TMDB returns proper Cache-Control headers).
 *
 * Mirrors `tmdbGet()` in ./tmdb.ts but is browser-safe (no Node-only APIs).
 */
async function tmdbGetClient<T>(
  path: string,
  params: Record<string, string | number | boolean> = {},
  lang: string = "id-ID"
): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", lang);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();

  // 1. In-memory cache (per page session)
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data as T;
  }

  // 2. HTTP cache (browser) — force-cache serves from HTTP cache if available
  //    (even when stale); only hits the network if there's no cached response.
  const res = await fetch(url.toString(), { cache: "force-cache" });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as T;
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

// ─── Trending ──────────────────────────────────────────────────────────
//
// Same shape + filtering as server-side fetchTrending(): weekly trending
// movies with fake/spam entries (no poster) filtered out.

export async function fetchTrendingClient(
  page = 1
): Promise<TMDBPaged<TMDBMovie>> {
  const data = await tmdbGetClient<TMDBPaged<TMDBMovie>>(
    "/trending/movie/week",
    { page }
  );
  // Filter out fake/spam movies: real movies always have a poster.
  data.results = (data.results || []).filter((m) => m.poster_path);
  return data;
}

export async function fetchTVTrendingClient(
  page = 1
): Promise<TMDBPaged<TMDBSeries>> {
  const data = await tmdbGetClient<TMDBPaged<TMDBSeries>>(
    "/trending/tv/week",
    { page }
  );
  data.results = (data.results || []).filter((s) => s.poster_path);
  return data;
}

// ─── Search ─────────────────────────────────────────────────────────────
//
// Note: server-side searchMovies() uses /search/multi (movies + tv) and
// filters out people. The migration spec calls for /search/movie here,
// which returns movies only — simpler and cheaper, no client-side media_type
// filtering needed. Each result is typed as TMDBMovie (same as server).

export async function searchMoviesClient(
  query: string,
  page = 1
): Promise<TMDBPaged<TMDBMovie>> {
  const data = await tmdbGetClient<TMDBPaged<TMDBMovie>>("/search/movie", {
    query,
    page,
    include_adult: false,
  });
  // Filter out fake/spam entries (no poster).
  data.results = (data.results || []).filter((m) => m.poster_path);
  return data;
}

// ─── Detail pages ──────────────────────────────────────────────────────
//
// append_to_response = videos,credits,similar (per migration spec).
// Note: server-side fetchMovieDetail() also includes external_ids; the
// client wrapper intentionally omits it to keep the response smaller for
// browser fetches. If a client component needs external_ids, it can call
// a separate endpoint.

export async function fetchMovieDetailClient(
  id: number
): Promise<TMDBMovieDetail> {
  return tmdbGetClient<TMDBMovieDetail>(`/movie/${id}`, {
    append_to_response: "videos,credits,similar",
  });
}

export async function fetchTVDetailClient(
  id: number
): Promise<TMDBSeriesDetail> {
  return tmdbGetClient<TMDBSeriesDetail>(`/tv/${id}`, {
    append_to_response: "videos,credits,similar",
  });
}

// ─── Discover by genre ────────────────────────────────────────────────
//
// Same params as server-side fetchByGenre(): sort by popularity desc,
// minimum 50 votes to filter out obscure/no-vote entries.

export async function fetchByGenreClient(
  genreId: number,
  page = 1
): Promise<TMDBPaged<TMDBMovie>> {
  return tmdbGetClient<TMDBPaged<TMDBMovie>>("/discover/movie", {
    page,
    sort_by: "popularity.desc",
    vote_count_gte: 50,
    with_genres: genreId,
  });
}

// ─── Genres ────────────────────────────────────────────────────────────

export async function fetchMovieGenresClient(): Promise<TMDBGenre[]> {
  const data = await tmdbGetClient<{ genres: TMDBGenre[] }>(
    "/genre/movie/list"
  );
  return data.genres;
}

// ─── Categories ────────────────────────────────────────────────────────
//
// Hardcoded category list — mirrors what the server-side fetchCategories()
// would return (trending + all standard TMDB movie genres). Hardcoded so
// listing pages can render the category nav on first paint without an
// extra round-trip to /genre/movie/list. The genre IDs are stable (TMDB
// hasn't changed them in years) so this is safe.
//
// Shape matches `Category` from ./tmdb.ts:
//   { id, name, tmdbGenreId }

const HARDCODED_CATEGORIES: Category[] = [
  { id: "trending", name: "Trending", tmdbGenreId: null },
  { id: 28, name: "Action", tmdbGenreId: 28 },
  { id: 12, name: "Adventure", tmdbGenreId: 12 },
  { id: 16, name: "Animation", tmdbGenreId: 16 },
  { id: 35, name: "Comedy", tmdbGenreId: 35 },
  { id: 80, name: "Crime", tmdbGenreId: 80 },
  { id: 99, name: "Documentary", tmdbGenreId: 99 },
  { id: 18, name: "Drama", tmdbGenreId: 18 },
  { id: 10751, name: "Family", tmdbGenreId: 10751 },
  { id: 14, name: "Fantasy", tmdbGenreId: 14 },
  { id: 36, name: "History", tmdbGenreId: 36 },
  { id: 27, name: "Horror", tmdbGenreId: 27 },
  { id: 10402, name: "Music", tmdbGenreId: 10402 },
  { id: 9648, name: "Mystery", tmdbGenreId: 9648 },
  { id: 10749, name: "Romance", tmdbGenreId: 10749 },
  { id: 878, name: "Science Fiction", tmdbGenreId: 878 },
  { id: 10770, name: "TV Movie", tmdbGenreId: 10770 },
  { id: 53, name: "Thriller", tmdbGenreId: 53 },
  { id: 10752, name: "War", tmdbGenreId: 10752 },
  { id: 37, name: "Western", tmdbGenreId: 37 },
];

export async function fetchCategoriesClient(): Promise<Category[]> {
  // Async to match the server-side fetchCategories() signature so callers
  // can swap implementations without changing await semantics.
  return HARDCODED_CATEGORIES;
}

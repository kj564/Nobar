// TMDB client — works in browser AND Node (static export friendly).
//
// Audit context:
//  • API key: env-driven with hardcoded fallback (per user request:
//    "untuk TMDB API jangan dihapus").
//  • Cache: in-memory Map with 5min TTL (server: persistent per process;
//    browser: ephemeral per page load — HTTP cache also helps via
//    Cache-Control headers from TMDB).
//  • No third-party deps. Server-only APIs (process.env) are guarded so
//    the module is safe to import from client components.

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  (typeof process !== "undefined" && process.env?.TMDB_API_KEY) ||
  "a3ce3ae3ddb29e9417ffcc2889becf9b";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

export const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
export const TMDB_IMG_LG = "https://image.tmdb.org/t/p/w780";
export const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";

export type TMDBMovie = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
};

export type TMDBGenre = { id: number; name: string };

export type TMDBCastMember = {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order: number;
};

export type TMDBCrewMember = { id: number; name: string; job?: string };

export type TMDBMovieDetail = TMDBMovie & {
  runtime?: number | null;
  tagline?: string;
  genres?: TMDBGenre[];
  credits?: {
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
  };
  similar?: { results: TMDBMovie[] };
  videos?: { results: Array<{ id: string; key: string; site: string; type: string; name: string }> };
};

export type TMDBPaged<T> = {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
};

async function tmdbGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "id-ID");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data as T;
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as T;
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export async function fetchTrending(page = 1): Promise<TMDBPaged<TMDBMovie>> {
  return tmdbGet<TMDBPaged<TMDBMovie>>("/trending/movie/week", { page });
}

export async function fetchByGenre(genreId: number, page = 1): Promise<TMDBPaged<TMDBMovie>> {
  return tmdbGet<TMDBPaged<TMDBMovie>>("/discover/movie", {
    page,
    sort_by: "popularity.desc",
    vote_count_gte: 50,
    with_genres: genreId,
  });
}

export async function searchMovies(query: string, page = 1): Promise<TMDBPaged<TMDBMovie>> {
  return tmdbGet<TMDBPaged<TMDBMovie>>("/search/movie", {
    query,
    page,
    include_adult: "false",
  });
}

export async function fetchMovieDetail(id: number): Promise<TMDBMovieDetail> {
  return tmdbGet<TMDBMovieDetail>(`/movie/${id}`, {
    append_to_response: "videos,credits,similar",
  });
}

export const CATEGORIES = [
  { id: "trending", name: "Trending", tmdbGenreId: null as number | null },
  { id: 28, name: "Action", tmdbGenreId: 28 },
  { id: 16, name: "Animation", tmdbGenreId: 16 },
  { id: 35, name: "Comedy", tmdbGenreId: 35 },
  { id: 18, name: "Drama", tmdbGenreId: 18 },
  { id: 99, name: "Documentary", tmdbGenreId: 99 },
  { id: 27, name: "Horror", tmdbGenreId: 27 },
  { id: 10749, name: "Romance", tmdbGenreId: 10749 },
] as const;

export const SERVERS = [
  {
    id: "utama",
    name: "Server 1 (HD)",
    pattern: "https://vidsrc.to/embed/movie/{video_id}",
    quality: "1080p",
    load: 32,
    recommended: true,
  },
  {
    id: "cadangan",
    name: "Server 2 (Fast)",
    pattern: "https://vidsrc.sh/embed/movie/{video_id}",
    quality: "720p",
    load: 15,
    recommended: false,
  },
] as const;

export type Server = {
  id: string;
  name: string;
  pattern: string;
  quality: string;
  load: number;
  recommended: boolean;
};

// Server patterns for TV series — vidsrc uses /tv/ instead of /movie/
export const SERVERS_TV = [
  {
    id: "utama",
    name: "Server 1 (HD)",
    pattern: "https://vidsrc.to/embed/tv/{video_id}",
    quality: "1080p",
    load: 32,
    recommended: true,
  },
  {
    id: "cadangan",
    name: "Server 2 (Fast)",
    pattern: "https://vidsrc.sh/embed/tv/{video_id}",
    quality: "720p",
    load: 15,
    recommended: false,
  },
] as const;

export const CREATORS = [
  { name: "Aisyah Putri", role: "Dokumenter", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80" },
  { name: "Bayu Mahendra", role: "Musisi", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc664aec0?auto=format&fit=crop&w=200&q=80" },
  { name: "Koli Animation", role: "Studio Animasi", avatar: "https://images.unsplash.com/photo-1611162616475-46b9b41f9f9b?auto=format&fit=crop&w=200&q=80" },
  { name: "Reza Pamungkas", role: "Sineas", avatar: "https://images.unsplash.com/photo-1507003181164-6e864c1e1f77?auto=format&fit=crop&w=200&q=80" },
  { name: "Lintas Pantura", role: "Kolektif", avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=200&q=80" },
  { name: "Devi Anjani", role: "Sineas", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d35?auto=format&fit=crop&w=200&q=80" },
] as const;

export type Creator = { name: string; role: string; avatar: string };

export function posterUrl(path?: string | null, size: "sm" | "lg" | "orig" = "sm"): string {
  if (!path) return "https://placehold.co/500x750/1c1c20/3a3a40?text=Nobar";
  const base = size === "lg" ? TMDB_IMG_LG : size === "orig" ? TMDB_IMG_ORIG : TMDB_IMG;
  return base + path;
}

// Backdrop image URL — used by hero banner for full-width cinematic backgrounds.
export function backdropUrl(
  path?: string | null,
  size: "w780" | "w1280" | "original" = "original"
): string {
  if (!path) return "";
  const base =
    size === "w1280"
      ? "https://image.tmdb.org/t/p/w1280"
      : size === "w780"
        ? "https://image.tmdb.org/t/p/w780"
        : TMDB_IMG_ORIG;
  return base + path;
}

export function formatRuntime(minutes?: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export function formatYear(dateStr?: string | null): string {
  return dateStr ? String(dateStr).slice(0, 4) : "—";
}

export function formatViews(count?: number | null): string {
  if (!count) return "—";
  if (count >= 1e9) return (count / 1e9).toFixed(1) + "B";
  if (count >= 1e6) return (count / 1e6).toFixed(1) + "M";
  if (count >= 1e3) return (count / 1e3).toFixed(1) + "k";
  return String(count);
}

export function buildServerUrl(serverPattern: string, videoId: string | number): string {
  return serverPattern.replace("{video_id}", encodeURIComponent(String(videoId)));
}

// ──────────────────────────────────────────────────────────────────────────
// TV Series types + fetchers
// ──────────────────────────────────────────────────────────────────────────

export type TMDBSeries = {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
};

export type TMDBSeriesDetail = TMDBSeries & {
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  genres?: TMDBGenre[];
  created_by?: Array<{ id: number; name: string; profile_path?: string | null }>;
  credits?: {
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
  };
  similar?: { results: TMDBSeries[] };
  videos?: { results: Array<{ id: string; key: string; site: string; type: string; name: string }> };
};

export async function fetchTrendingTV(page = 1): Promise<TMDBPaged<TMDBSeries>> {
  return tmdbGet<TMDBPaged<TMDBSeries>>("/trending/tv/week", { page });
}

export async function fetchTVDetail(id: number): Promise<TMDBSeriesDetail> {
  return tmdbGet<TMDBSeriesDetail>(`/tv/${id}`, {
    append_to_response: "videos,credits,similar",
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Slug helper — generates URL-safe slug from title + year
// Examples:
//   slugify("The Hunt", "2012-06-15")     → "the-hunt-2012"
//   slugify("Cyberpunk: Edgerunners", "2022-09-13") → "cyberpunk-edgerunners-2022"
//   slugify("Spider-Man: Brand New Day", "2026-07-31") → "spider-man-brand-new-day-2026"
// ──────────────────────────────────────────────────────────────────────────

export function slugify(
  title: string | undefined,
  dateStr: string | undefined
): string {
  const titlePart = (title || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const year = dateStr ? String(dateStr).slice(0, 4) : "";
  return year ? `${titlePart}-${year}` : titlePart;
}

// Find a movie by slug within a list (used by detail pages to resolve
// slug → TMDB ID at build time).
export function findMovieBySlug(
  movies: TMDBMovie[],
  slug: string
): TMDBMovie | undefined {
  return movies.find((m) => slugify(m.title || m.name, m.release_date) === slug);
}

export function findSeriesBySlug(
  series: TMDBSeries[],
  slug: string
): TMDBSeries | undefined {
  return series.find((s) => slugify(s.name || s.title, s.first_air_date) === slug);
}

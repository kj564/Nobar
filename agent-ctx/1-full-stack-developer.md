# Task 1 — Create client-side TMDB wrapper

**Agent:** full-stack-developer
**Project:** /home/z/nobar-backup (Nobar — Next.js 16 App Router)
**Status:** ✅ Done

## Goal

Migrate TMDB data fetching from Vercel server-side to GitHub Pages static
export. TMDB API is CORS-open (ACAO: *), so the browser can hit it directly
with a public API key — no proxy, no egress.

## Deliverables

### 1. `/home/z/nobar-backup/src/lib/tmdb-client.ts` (NEW, 220 lines)

Client-side TMDB wrapper. Imports types from `./tmdb` (no type duplication).
Uses `process.env.NEXT_PUBLIC_TMDB_API_KEY` (with hardcoded fallback for
local dev parity with server-side tmdb.ts).

Exports (all async, all browser-safe):

| Function | Endpoint | Notes |
|---|---|---|
| `fetchTrendingClient(page)` | GET /trending/movie/week | Filters out no-poster spam entries |
| `fetchTVTrendingClient(page)` | GET /trending/tv/week | Filters out no-poster entries |
| `searchMoviesClient(query, page)` | GET /search/movie | Spec says /search/movie (server uses /search/multi) |
| `fetchMovieDetailClient(id)` | GET /movie/{id}?append_to_response=videos,credits,similar | Omits external_ids vs server (smaller payload) |
| `fetchTVDetailClient(id)` | GET /tv/{id}?append_to_response=videos,credits,similar | Omits external_ids vs server |
| `fetchByGenreClient(genreId, page)` | GET /discover/movie?with_genres={id} | Same params as server: sort_by=popularity.desc, vote_count_gte=50 |
| `fetchMovieGenresClient()` | GET /genre/movie/list | Returns `TMDBGenre[]` |
| `fetchCategoriesClient()` | (hardcoded) | Returns `Category[]` — Trending + 19 standard TMDB movie genres. No network round-trip; renders nav on first paint |

Caching:
- **Layer 1:** In-memory `Map` with 5min TTL (per page session, dedup).
- **Layer 2:** `fetch(url, { cache: "force-cache" })` — relies on TMDB's
  Cache-Control headers for cross-session persistence.

### 2. `/home/z/nobar-backup/.env.local` (NEW)

```
NEXT_PUBLIC_TMDB_API_KEY=a3ce3ae3ddb29e9417ffcc2889becf9b
```

Value copied from the existing hardcoded fallback in `src/lib/tmdb.ts`
(no `TMDB_API_KEY` env var was previously set — the app was always using
the fallback).

## Verification

- `bunx tsc --noEmit -p tsconfig.json` — passes cleanly (no type errors).
- `bun run lint` — broken in nobar-backup due to a pre-existing
  circular-structure bug in eslint config (TypeError in
  `@eslint/eslintrc` config-validator); unrelated to this task.

## Intentional divergences from server-side tmdb.ts

1. `searchMoviesClient` uses `/search/movie` (movies only) per migration
   spec, vs server `/search/multi` (movies + tv, filters people).
2. `fetchMovieDetailClient` / `fetchTVDetailClient` use
   `append_to_response=videos,credits,similar` (no `external_ids`) per
   migration spec, to keep browser payloads smaller. Client components
   that need external_ids can call a separate endpoint later.
3. `fetchCategoriesClient` returns a hardcoded list (no network call) so
   the category nav renders on first paint.

## Next-step handoff

Client components currently calling server `fetchTrending` / `fetchByGenre`
/ etc. (via server components or API routes) can be migrated one by one
to use the `*Client` functions. No detail-page changes needed in this task.

# Task 2 — Convert page components to client-side for static export

**Agent:** page-converter (Claude / Z.ai Code)
**Project:** /home/z/nobar-backup (Nobar — Next.js 16 App Router)
**Task ID:** 2
**Status:** ✅ Done

## Goal

Migrate all page components from server-side rendering (Vercel) to
client-side rendering (GitHub Pages static export). Each page must use the
new `tmdb-client.ts` wrapper created by Task 1 instead of server-side
fetches.

## Changes by file

### 1. `src/app/page.tsx` (home page)
**Before:** Server component that awaited `fetchCategories()` from `@/lib/tmdb`.

**After:** Client component with `"use client"` directive. Uses
`useEffect()` to call `fetchCategoriesClient()` from `@/lib/tmdb-client`
on mount, then renders `<HomeClient categories={categories} />`. While the
categories are loading (one microtask — `fetchCategoriesClient()` returns
a hardcoded list synchronously wrapped in Promise.resolve), a minimal
`<div className="min-h-screen bg-ink-950" />` shell is shown so there's no
white flash before HomeClient mounts.

### 2. `src/app/movie/[id]/page.tsx` (movie detail)
**Before:** Server component that awaited `fetchMovieDetail(movieId)`,
exported `generateMetadata()` for dynamic `<title>`/OG tags, used
server-side `notFound()` and `redirect()`.

**After:** Client component with `"use client"` directive. Uses
`useParams()` from `next/navigation` to read the slug from the URL,
extracts the TMDB ID via `extractIdFromSlug()`, then calls
`fetchMovieDetailClient(id)` on mount.

- **State shape:** Tagged-union `LoadState` with `loading | notfound |
  error | ready` variants — narrower than four separate `useState`
  booleans and prevents rendering the body before data arrives.
- **Loading state:** Centered spinner (`animate-spin` ring + "Memuat
  film..." text).
- **Not-found state:** Inline UI replaces server-side `notFound()`.
  Shows "Film Tidak Ditemukan" + back-to-home link.
- **Error state:** Shows the error message + back-to-home link.
- **Canonical slug redirect:** Uses `router.replace()` from
  `next/navigation` (client-side equivalent of server `redirect()`).
- **Anti-fake movie filter:** Preserved verbatim (Released + runtime=0
  + no IMDB ID → fake; also no IMDB + no poster + popularity<2 → fake).
  Note: `fetchMovieDetailClient` does not include `external_ids` per
  migration spec, so the imdbId branch is usually undefined; the
  poster/popularity fallbacks still catch fakes.
- **Page body JSX:** Identical to the previous server component — same
  hero/backdrop, action buttons, player, synopsis, info sidebar, cast
  section, similar movies, footer, JSON-LD `<script>`, preconnect hints.
- **Removed:** `generateMetadata()` (can't be exported from a client
  component — the page now falls back to the site-wide metadata from
  `layout.tsx`).

### 3. `src/app/series/[id]/page.tsx` (series detail)
**Before:** Server component that awaited `fetchTVDetail(seriesId)`,
exported `generateMetadata()`, used `notFound()` and `redirect()`.

**After:** Client component, same pattern as the movie detail page but
using `fetchTVDetailClient(id)` and rendering `<SeriesNativePlayer>` (which
already exists as a client component). All page body JSX preserved
verbatim — backdrop, genre pills (with status badge for
Returning/Ended/Canceled), action buttons, synopsis, info sidebar with
season/episode counts, cast, similar series, footer.

### 4. `src/app/search/page.tsx`
**Before:** Already a client component but called `fetch('/api/search?q=...')`.

**After:** Added `import { searchMoviesClient } from "@/lib/tmdb-client"`
and replaced the fetch+JSON parse with a direct call:
`const data = await searchMoviesClient(q, targetPage)`. The shape is
identical (`TMDBPaged<TMDBMovie>`), so the rest of the state-update logic
(setResults, deduplication, page/totalPages tracking) is unchanged.

- Removed now-unused `TMDBPaged` type import (was only used in the
  explicit type annotation we deleted; the call site infers the type
  from `searchMoviesClient`'s return type).
- Pre-existing unused imports (`buildMovieSlug`, `buildSeriesSlug`,
  `Film`, `Tv`, `Star`, `ArrowLeft`, `Link`) left in place — they were
  unused before this task too and removing them is out of scope.
- Note: `searchMoviesClient` uses `/search/movie` (movies only) so all
  results render via `<MovieCard>` — the `m.media_type === "tv"` branch
  in the existing render code now never triggers. Left intact for safety.

### 5. `src/app/layout.tsx`
**No changes needed.** Verified:

- Uses `next/font/google` (`Inter`, `Plus_Jakarta_Sans`) — works with
  static export (fonts are fetched at build time and inlined into CSS).
- Exports `const metadata: Metadata` — server-side metadata API, fully
  compatible with `output: "export"` (Next.js processes the metadata at
  build time and emits static `<head>` tags).
- Renders `<html>` + `<body>` with font CSS variables and the adplox
  script tag in `<head>`. No `headers()` / `cookies()` / dynamic
  server-only calls. Works as-is for static export.
- The root layout MUST remain a server component (no `"use client"`) so
  that `metadata` and `next/font/google` work — the child pages can all
  be client components without issue.

## Verification

- `bunx tsc --noEmit -p tsconfig.json` — passes cleanly with no type
  errors after all edits.
- `bun run lint` — broken in nobar-backup due to a pre-existing
  circular-structure bug in eslint config (TypeError in
  `@eslint/eslintrc` config-validator, unrelated to this task — was
  already broken before any of my edits, see Task 1 worklog).
- Verified by inspection that all child components referenced by the
  converted pages (`HomeClient`, `NativePlayer`, `SeriesNativePlayer`,
  `Navbar`, `WatchPartyButton`, `MovieCard`, `SeriesCard`,
  `HeroBanner`) already have `"use client"` directives at the top of
  their respective files — so no propagation of `"use client"` boundaries
  was needed beyond the page files themselves.
- Verified by inspection that all helper functions imported from
  `@/lib/tmdb` (`posterUrl`, `backdropUrl`, `formatRuntime`,
  `formatYear`, `formatViews`, `buildMovieSlug`, `buildSeriesSlug`,
  `extractIdFromSlug`, type `TMDBMovieDetail`, type `TMDBSeriesDetail`,
  type `TMDBMovie`, type `TMDBSeries`, type `Category`) are pure
  utilities or type definitions — `tmdb.ts` itself is browser-safe per
  its header comment ("No third-party deps. Server-only APIs
  (process.env) are guarded so the module is safe to import from client
  components.") so importing these helpers from client components is
  valid.

## Notes for next agent

- The page components are now fully client-side. For actual GitHub
  Pages deployment, `next.config.ts` will need `output: "export"` and
  dynamic routes (`/movie/[id]`, `/series/[id]`) will need either:
  - a `generateStaticParams()` exporting the most popular IDs for SSG,
    OR
  - a catch-all pattern (`/movie/[...slug]`) handled by a single
    client component that parses the URL client-side and fetches by ID
    (this is essentially what we already do, just needs the route shape
    adjustment for Next.js's static-export requirements).
- Dynamic `<title>` per movie/series page is lost (was via
  `generateMetadata`). If SEO matters for GitHub Pages, a separate
  pre-render pass (e.g., a Node script that emits static HTML for the
  top N movies/series with proper titles/JSON-LD) would be needed.
- The `/api/search` server route is no longer called by anything in
  the UI but is not deleted — leaving it in place is harmless and
  keeps the diff minimal. A future cleanup task can remove
  `src/app/api/search/route.ts` (and the other `/api/*` routes once
  all callers are migrated).

# Task 3 — Convert MoviePageClient / SeriesPageClient to client components

**Agent:** page-converter-v2 (Claude / Z.ai Code)
**Project:** /home/z/nobar-backup (Nobar — Next.js 16 App Router)
**Task ID:** 3
**Status:** ✅ Done

## Goal

Convert the freshly-recovered server-component versions of
`MoviePageClient.tsx` and `SeriesPageClient.tsx` (428 + 416 lines each,
restored from git in Task 2's wake) to client components so the build
works with `output: "export"` for GitHub Pages static hosting. Also
verify the home page + listing pages are static-export compatible.

The `page.tsx` wrappers (already created by Task 2) import these Client
components by name and call `generateStaticParams()`, so the new files
must be named exports (not default exports) and must take no props
(they read the slug via `useParams()` instead).

## Changes by file

### 1. `src/app/movie/[id]/MoviePageClient.tsx`
**Before:** 428-line server component. Imported `notFound` / `redirect`
from `next/navigation`, exported `generateMetadata()` for dynamic
`<title>` / OG tags, awaited `fetchMovieDetail(movieId)` from
`@/lib/tmdb` (server-side, `process.env.TMDB_API_KEY`).

**After:** Client component with `"use client"` directive. Named export
`MoviePageClient` (no default export — the wrapper imports by name).

- Removed: `notFound`, `redirect`, `Metadata` type, `generateMetadata()`.
- Added: `useEffect`, `useState` from `react`; `useParams`, `useRouter`
  from `next/navigation`.
- Data fetcher: `fetchMovieDetailClient` from `@/lib/tmdb-client`
  (browser → public TMDB endpoint with NEXT_PUBLIC_TMDB_API_KEY).
- Pure helpers (`backdropUrl`, `posterUrl`, `formatRuntime`,
  `formatYear`, `formatViews`, `buildMovieSlug`, `extractIdFromSlug`)
  and `TMDBMovieDetail` type still imported from `@/lib/tmdb` — that
  module is browser-safe per its header comment (only server-only API
  is `process.env`, which is guarded).
- State machine: tagged-union `LoadState = loading | notfound | error |
  ready` (narrower than four separate `useState` booleans).
- Lifecycle: `useEffect(() => { fetchMovieDetailClient(movieId)... },
  [params?.id, router])`. Slug is parsed via `extractIdFromSlug(params.id)`
  → if no ID, set `notfound`. On canonical-slug mismatch, call
  `router.replace(/movie/${canonicalSlug})` (client equivalent of
  server `redirect()`). The redirect triggers a re-render with the new
  slug; the slug-mismatch check then passes and we set `ready`.
- Loading UI: centered spinner (`border-2 border-white/20 border-t-brand-500
  rounded-full animate-spin`) + "Memuat film...".
- Not-found UI: replaces server `notFound()` — shows "Film Tidak
  Ditemukan" + back-to-movies-list link.
- Error UI: shows the error message + back-to-movies-list link.
- Anti-fake movie filter preserved verbatim (Released + runtime=0 +
  no IMDB ID → fake; also no IMDB + no poster + popularity<2 → fake).
  Note: `fetchMovieDetailClient` intentionally omits `external_ids` (per
  Task 1 spec to keep the browser payload smaller), so the imdbId
  branch usually falls through to the poster/popularity fallbacks.
- Page body JSX preserved 1:1: hero/backdrop section with idlixku
  gradient, pull-up detail content (title, genre pills, action buttons,
  metadata row, tagline, truncated synopsis), player section,
  overview+info grid, cast horizontal scroll, similar movies grid,
  footer, JSON-LD `<script type="application/ld+json">` with
  schema.org/Movie aggregateRating, preconnect hints for CDN domains.

### 2. `src/app/series/[id]/SeriesPageClient.tsx`
**Before:** 416-line server component. Same shape as the movie page but
for TV series — used `fetchTVDetail(seriesId)`, exported
`generateMetadata()`, `notFound()` / `redirect()`.

**After:** Client component with `"use client"` directive. Named export
`SeriesPageClient`. Same state-machine pattern as `MoviePageClient`.

- Data fetcher: `fetchTVDetailClient` from `@/lib/tmdb-client` (per the
  task spec — not `fetchTVDetailEnglish`, which is a server-only variant).
- Anti-fake filter preserved (Released + 0 episodes + no IMDB → fake;
  also no IMDB + no poster + popularity<2 → fake).
- Page body JSX preserved 1:1: backdrop, genre pills with status badge
  (Returning Series → "Ongoing" green, Ended/Canceled → accent red,
  else gray), action buttons (no trailer button — TV series don't have
  trailers in the same way), metadata row with season/episode counts,
  tagline, truncated synopsis, SeriesNativePlayer, synopsis+info grid
  (creator, year, seasons, episodes, rating, status), cast, similar
  series, footer, JSON-LD schema.org/TVSeries with
  numberOfSeasons/numberOfEpisodes.

### 3. `src/app/page.tsx` (home page)
**Status:** Already correct — no changes needed.

- Already has `"use client"` directive (added in Task 2).
- Uses `fetchCategoriesClient()` from `@/lib/tmdb-client` in a
  `useEffect()` on mount, with a `null` initial state + minimal
  `min-h-screen bg-ink-950` shell while loading.
- Renders `<HomeClient categories={categories} />` once categories
  resolve (one microtask — `fetchCategoriesClient()` returns a
  hardcoded list synchronously wrapped in `Promise.resolve`).
- Does NOT use `generateStaticParams` — home page doesn't need it
  (it's a static `/` route, no dynamic segment).

### 4. `src/app/movie/page.tsx` (movie listing page)
**Before:** Server component that awaited `fetchCategories()` from
`@/lib/tmdb` (server-side, reads `process.env.TMDB_API_KEY`).

**After:** Client component with `"use client"` directive. Same pattern
as the home page: `useState<Category[] | null>(null)` + `useEffect` on
mount that calls `fetchCategoriesClient().then(setCategories)`. Renders
a minimal `min-h-screen bg-ink-950` shell while loading, then
`<MovieListingClient categories={categories} />`.

### 5. `src/app/series/page.tsx` (series listing page)
**Status:** Already correct — no changes needed.

- Already a client component with `"use client"` directive.
- Uses `useState` for series list, page, loading, error; calls
  `/api/tv-trending` in a `useEffect` on mount. (Note: this fetch will
  fail at runtime on GitHub Pages since there's no server, but the
  page itself builds correctly as a client component. Replacing
  `/api/tv-trending` with `fetchTVTrendingClient()` is out of scope for
  this task — it's a separate item in the migration backlog.)

### 6. `src/app/movie/[id]/page.tsx` and `src/app/series/[id]/page.tsx` (wrappers)
**Before:** Imported the Client components by name and exported
`generateStaticParams()` returning `[]`.

**After:** Same imports + Page() default export, BUT
`generateStaticParams()` now returns `[{ id: "preview" }]` instead of
`[]`. Inline comment explains why.

**Reason:** Next.js 16 with `output: "export"` rejects empty
`generateStaticParams()` arrays for dynamic routes:
> "Page returned an empty array from generateStaticParams().
>  With output: export, at least one route must be generated."

Returning a placeholder ID generates `/movie/preview/index.html` and
`/series/preview/index.html` so the build passes. The Client component
itself works for ANY ID at runtime — but on a static host like GitHub
Pages, real URLs like `/movie/the-dark-knight-27205` won't have a
static HTML file. The host must be configured to fall back to a SPA
shell — typically via a `404.html` that redirects to `index.html`
(standard GitHub Pages SPA trick). This host-side fallback config is
out of scope for this task.

### 7. `src/app/search/page.tsx`
**Status:** Already correct — no changes needed.

- Already a client component using `searchMoviesClient()` from
  `@/lib/tmdb-client` (converted in Task 2). Wrapped in `<Suspense>`
  because it uses `useSearchParams()`.

## Build verification

```
$ cd /home/z/nobar-backup
$ NEXT_PUBLIC_TMDB_API_KEY=a3ce3ae3ddb29e9417ffcc2889becf9b bun run build

▲ Next.js 16.4.2 (Turbopack)
✓ Compiled successfully in 3.8s
✓ Generating static pages using 1 worker (10/10) in 270ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /movie
├   /movie/[id]
│ └ ● /movie/preview
├ ○ /robots.txt
├ ○ /search
├ ○ /series
├   /series/[id]
│ └ ● /series/preview
└ ○ /sitemap.xml

○  (Static)  prerendered as static content
●  (SSG)     prerendered as static HTML (uses generateStaticParams)
```

Build passes. All 10 routes successfully pre-rendered as static HTML.
The two dynamic routes (`/movie/[id]` and `/series/[id]`) each emit a
single SSG page at `/movie/preview` and `/series/preview` from the
placeholder ID in `generateStaticParams`.

## What's NOT in this task (deferred)

- Replacing `/api/tv-trending` in `src/app/series/page.tsx` with
  `fetchTVTrendingClient()` (out of scope — separate migration item).
- Replacing `/api/trending`, `/api/discover`, `/api/search` in
  `MovieListingClient.tsx` with the equivalent `*Client` functions
  from `@/lib/tmdb-client` (out of scope — separate migration item).
- Configuring GitHub Pages SPA fallback (`404.html` → `index.html`)
  so runtime URLs like `/movie/the-dark-knight-27205` resolve to the
  React app instead of GitHub's default 404 page (out of scope —
  deployment concern).
- Dynamic per-page `<title>` / OG metadata (was via `generateMetadata`
  in the server component; can't be exported from client components).
  A separate pre-render pass would be needed for per-page SEO if
  desired.

## Files modified
- `src/app/movie/[id]/MoviePageClient.tsx` (rewritten — 428 → ~430 lines)
- `src/app/series/[id]/SeriesPageClient.tsx` (rewritten — 416 → ~410 lines)
- `src/app/movie/[id]/page.tsx` (placeholder ID added)
- `src/app/series/[id]/page.tsx` (placeholder ID added)
- `src/app/movie/page.tsx` (server component → client component)

## Files unchanged
- `src/app/page.tsx` (already correct from Task 2)
- `src/app/series/page.tsx` (already a client component)
- `src/app/search/page.tsx` (already correct from Task 2)
- `src/app/layout.tsx` (already static-export compatible per Task 2's
  verification)

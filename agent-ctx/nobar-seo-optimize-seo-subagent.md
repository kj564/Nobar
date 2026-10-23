# Work Record — nobar-seo-optimize

**Task ID:** nobar-seo-optimize
**Agent:** seo-subagent
**Parent task:** Nobar Next.js streaming project (/home/z/my-project)

## What I did

1. **`src/app/movie/[id]/page.tsx`** — added `generateMetadata` export + JSON-LD `<script type="application/ld+json">` block (schema.org `Movie`). Function reuses `extractIdFromSlug` → `fetchMovieDetail` → `buildMovieSlug` from `@/lib/tmdb`. Returns `Metadata` with title (`${title} (${year}) — Nobar`), description (overview truncated to 160 chars), canonical alternates, OpenGraph (type `video.movie`, image = backdrop URL), Twitter card (`summary_large_image`).
2. **`src/app/series/[id]/page.tsx`** — same pattern for TV series. Title `${title} (Series) — Nobar`, OpenGraph type `video.tv_show`, JSON-LD schema.org `TVSeries` with `numberOfSeasons`, `numberOfEpisodes`, `aggregateRating` (when `vote_average > 0`).
3. **`src/app/layout.tsx`** — enhanced root `metadata` with `metadataBase`, `openGraph` (siteName, locale `id_ID`, type `website`), `twitter` (`summary_large_image`), `robots` (`index, follow`).
4. **`src/app/sitemap.ts`** — new `MetadataRoute.Sitemap` exposing `/`, `/movie/`, `/series/`, `/search` with appropriate `changeFrequency` and `priority`.
5. **`src/app/robots.ts`** — new `MetadataRoute.Robots` allowing all crawlers + sitemap URL.

## Important note about `openGraph.type`

Task description requested `openGraph.type = 'video'` for both pages. However Next.js 16's `OpenGraphType` only allows `'video.movie' | 'video.tv_show' | 'video.other' | 'video.episode' | 'article' | 'book' | 'profile' | 'music.*' | 'website'` — plain `'video'` throws `Error: Invalid OpenGraph type: video` at runtime (verified in dev.log). Used the most specific valid video subtype instead:
- Movie page: `video.movie`
- Series page: `video.tv_show`

This preserves the user's intent (mark pages as video content) while satisfying Next.js validation.

## Files changed

- `src/app/movie/[id]/page.tsx` (added imports, generateMetadata, JSON-LD block)
- `src/app/series/[id]/page.tsx` (same)
- `src/app/layout.tsx` (enhanced metadata)
- `src/app/sitemap.ts` (new)
- `src/app/robots.ts` (new)

## Verification (against running dev server on :3000)

- `GET /movie/clayface-2026-1400940` → 200, `<title>Clayface (2026) — Nobar</title>`, canonical link correct, `og:image` = backdrop URL, `og:type` = `video.movie`, twitter card present.
- `GET /series/breaking-bad-2008-1396` → 200, `<title>Breaking Bad (Series) — Nobar</title>`, JSON-LD contains `@type: TVSeries`, `numberOfSeasons: 5`, `numberOfEpisodes: 62`, `aggregateRating.ratingValue: 8.957`, `ratingCount: 18918`.
- Movie JSON-LD verified for `@type: Movie` + `aggregateRating` (ratingValue 7.6, ratingCount 89).
- `GET /sitemap.xml` → 200, contains 4 URLs with correct priorities + changeFrequency.
- `GET /robots.txt` → 200, contains `User-Agent: *`, `Allow: /`, sitemap URL.
- `agent-browser errors` → empty (no console errors).

## Pre-existing issue noted (NOT my concern)

`bun run lint` fails with "Converting circular structure to JSON" inside ESLint's react plugin config validator — this is a pre-existing ESLint config issue unrelated to the SEO changes. Dev server (Turbopack) compiles the changed files without errors.

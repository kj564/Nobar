// Movie detail route — thin wrapper that renders the client component.
//
// Routing context:
//   - Dev mode: Next.js App Router serves this page for /movie/{slug}.
//     MoviePageClient reads the slug via useParams() and fetches detail
//     client-side (TMDB API is CORS-open).
//   - GitHub Pages (static export): generateStaticParams returns only
//     [{id:"preview"}] so /movie/preview/index.html is pre-rendered.
//     Real movie URLs (e.g. /movie/the-matrix-603) have no static file
//     → host 404.html (copy of index.html) → root page.tsx SPA router
//     → lazy-loads MoviePageClient based on window.location.pathname.
//     Both paths converge on the same client component.

import { MoviePageClient } from "./MoviePageClient";

export default function MovieDetailPage() {
  return <MoviePageClient />;
}

// Pre-render a single placeholder so `next build` (output: export) doesn't
// fail with "empty generateStaticParams". Real URLs are handled by the
// SPA fallback (404.html → index.html) on GitHub Pages.
export function generateStaticParams() {
  return [{ id: "preview" }];
}

export const dynamicParams = true;

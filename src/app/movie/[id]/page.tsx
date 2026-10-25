import { MoviePageClient } from "./MoviePageClient";

// Required for static export: tell Next.js not to pre-render any specific
// movie IDs (we don't know which IDs will be visited at runtime). The client
// component handles routing + data fetching at runtime.
//
// We return a single placeholder ("preview") because Next.js 16 requires
// generateStaticParams to produce at least one route when output: "export"
// is enabled — otherwise the build fails with:
//   "Page returned an empty array from generateStaticParams().
//    With output: export, at least one route must be generated."
//
// At runtime on a static host (GitHub Pages), real URLs like
// /movie/the-dark-knight-27205 won't have a static HTML file. The host
// must be configured to fall back to a SPA shell — typically via a
// 404.html that redirects to index.html (standard GitHub Pages SPA trick).
export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function Page() {
  return <MoviePageClient />;
}

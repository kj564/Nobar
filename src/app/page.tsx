// Server component — fetches categories + pre-rendered slug list dynamically
// from TMDB at build time, then passes to client component for interactive UI.
// The slug list is used by client to filter search results so users never
// click a movie that will 404.

import { fetchCategories, fetchAllMoviesForPrerender, buildSlugSet } from "@/lib/tmdb";
import { HomeClient } from "@/components/HomeClient";

export default async function NobarPage() {
  const [categories, allMovies] = await Promise.all([
    fetchCategories(),
    fetchAllMoviesForPrerender(),
  ]);
  // Convert Set to array for serialization (Set is not serializable as
  // server→client prop in Next.js). Client converts back to Set.
  const prerenderedSlugs = Array.from(buildSlugSet(allMovies));
  return <HomeClient categories={categories} prerenderedSlugs={prerenderedSlugs} />;
}

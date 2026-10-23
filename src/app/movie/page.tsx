// Server component — fetches categories + pre-rendered slug list dynamically.
import { fetchCategories, fetchAllMoviesForPrerender, buildSlugSet } from "@/lib/tmdb";
import { MovieListingClient } from "@/components/MovieListingClient";

export default async function MovieListingPage() {
  const [categories, allMovies] = await Promise.all([
    fetchCategories(),
    fetchAllMoviesForPrerender(),
  ]);
  const prerenderedSlugs = Array.from(buildSlugSet(allMovies));
  return <MovieListingClient categories={categories} prerenderedSlugs={prerenderedSlugs} />;
}

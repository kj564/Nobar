// Server component — fetches categories dynamically from TMDB at build time.
import { fetchCategories } from "@/lib/tmdb";
import { MovieListingClient } from "@/components/MovieListingClient";

export default async function MovieListingPage() {
  const categories = await fetchCategories();
  return <MovieListingClient categories={categories} />;
}

// Server component — fetches categories dynamically.
import { fetchCategories } from "@/lib/tmdb";
import { MovieListingClient } from "@/components/MovieListingClient";

export default async function MovieListingPage() {
  const categories = await fetchCategories();
  return <MovieListingClient categories={categories} />;
}

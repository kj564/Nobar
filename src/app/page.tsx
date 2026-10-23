// Server component — fetches categories dynamically from TMDB.
// No pre-render, no slug set — dynamic routes handle everything on-demand.
import { fetchCategories } from "@/lib/tmdb";
import { HomeClient } from "@/components/HomeClient";

export default async function NobarPage() {
  const categories = await fetchCategories();
  return <HomeClient categories={categories} />;
}

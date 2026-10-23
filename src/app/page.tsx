// Server component — fetches categories dynamically at build time from TMDB
// /genre/movie/list, then passes to client component for interactive UI.
// No hardcoded categories anywhere.

import { fetchCategories } from "@/lib/tmdb";
import { HomeClient } from "@/components/HomeClient";

// Fetch at build time (static export). TMDB response is cached in lib/tmdb.ts
// (5min TTL), so multiple calls during build reuse the same data.
export default async function NobarPage() {
  const categories = await fetchCategories();
  return <HomeClient categories={categories} />;
}

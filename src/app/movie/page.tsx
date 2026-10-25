// Movie listing page — client component for GitHub Pages static export.
//
// Migration context:
//   Previously a server component that awaited `fetchCategories()` from
//   `@/lib/tmdb` (which reads the server-side TMDB_API_KEY env var and uses
//   server-only fetch). For static export we cannot do server-side data
//   fetching, so this page is now a client component that resolves the
//   category list on mount via `fetchCategoriesClient()` from
//   `@/lib/tmdb-client`.
//
//   `fetchCategoriesClient()` returns a hardcoded list (no network call) so
//   it resolves synchronously inside a microtask — the user sees a brief
//   dark shell on first paint, then the MovieListingClient UI on the next
//   tick. MovieListingClient itself handles all trending/discover/search
//   fetching via client-side calls once mounted.
"use client";

import { useEffect, useState } from "react";
import { MovieListingClient } from "@/components/MovieListingClient";
import { fetchCategoriesClient } from "@/lib/tmdb-client";
import type { Category } from "@/lib/tmdb";

export default function MovieListingPage() {
  // `null` until the client-side fetch resolves so we can render a plain
  // dark shell during the very first paint instead of triggering
  // MovieListingClient's `useState(categories[0])` with undefined.
  const [categories, setCategories] = useState<Category[] | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchCategoriesClient()
      .then((cats) => {
        if (mounted) setCategories(cats);
      })
      .catch(() => {
        if (mounted) setCategories([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!categories) {
    // Minimal dark shell — matches the page background so there's no white
    // flash before MovieListingClient mounts.
    return <div className="min-h-screen bg-ink-950" />;
  }

  return <MovieListingClient categories={categories} />;
}

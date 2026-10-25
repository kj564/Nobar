// Home page — client component for GitHub Pages static export.
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
//   blank shell on first paint, then the full HomeClient UI on the very next
//   tick. HomeClient itself handles all trending/TV/mzfi catalog fetching
//   via the CDN proxy once mounted.
"use client";

import { useEffect, useState } from "react";
import { HomeClient } from "@/components/HomeClient";
import { fetchCategoriesClient } from "@/lib/tmdb-client";
import type { Category } from "@/lib/tmdb";

export default function NobarPage() {
  // categories is `null` until the client-side fetch resolves; this lets us
  // render a plain dark shell during the very first paint instead of an
  // empty nav (which would cause HomeClient's `useState(categories[0])` to
  // initialize activeCategory to undefined).
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
    // flash before HomeClient mounts.
    return <div className="min-h-screen bg-ink-950" />;
  }

  return <HomeClient categories={categories} />;
}

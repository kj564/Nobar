"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { HomeClient } from "@/components/HomeClient";
import { fetchCategoriesClient } from "@/lib/tmdb-client";
import type { Category } from "@/lib/tmdb";

// Lazy load movie/series pages so they don't crash home page on load
const MoviePageClient = lazy(() => 
  import("@/app/movie/[id]/MoviePageClient").then(m => ({ default: m.MoviePageClient }))
);
const SeriesPageClient = lazy(() => 
  import("@/app/series/[id]/SeriesPageClient").then(m => ({ default: m.SeriesPageClient }))
);

const LoadingSpinner = () => (
  <div className="min-h-screen bg-ink-950 flex items-center justify-center">
    <div className="animate-spin w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full" />
  </div>
);

export default function Page() {
  const [route, setRoute] = useState<{type: string}>({ type: "home" });
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    function parseRoute() {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      let path = window.location.pathname;
      if (basePath && path.startsWith(basePath)) {
        path = path.slice(basePath.length) || "/";
      }
      
      if (path.match(/^\/movie\/[^/]+\/?$/) && path !== "/movie/") {
        setRoute({ type: "movie" });
      } else if (path.match(/^\/series\/[^/]+\/?$/) && path !== "/series/") {
        setRoute({ type: "series" });
      } else if (path.startsWith("/search")) {
        setRoute({ type: "search" });
      } else if (path === "/movie/" || path === "/movie") {
        setRoute({ type: "movie-list" });
      } else if (path === "/series/" || path === "/series") {
        setRoute({ type: "series-list" });
      } else {
        setRoute({ type: "home" });
      }
    }
    
    parseRoute();
    window.addEventListener("popstate", parseRoute);
    return () => window.removeEventListener("popstate", parseRoute);
  }, []);

  useEffect(() => {
    if (route.type === "home" || route.type === "movie-list") {
      fetchCategoriesClient().then(setCategories).catch(() => {});
    }
  }, [route.type]);

  if (route.type === "movie") {
    return <Suspense fallback={<LoadingSpinner />}><MoviePageClient /></Suspense>;
  }
  if (route.type === "series") {
    return <Suspense fallback={<LoadingSpinner />}><SeriesPageClient /></Suspense>;
  }
  return <HomeClient categories={categories} />;
}

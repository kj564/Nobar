"use client";

import { useEffect, useState } from "react";
import { HomeClient } from "@/components/HomeClient";
import { MoviePageClient } from "@/app/movie/[id]/MoviePageClient";
import { SeriesPageClient } from "@/app/series/[id]/SeriesPageClient";
import { fetchCategoriesClient } from "@/lib/tmdb-client";
import type { Category } from "@/lib/tmdb";

type Route = 
  | { type: "home" }
  | { type: "movie" }
  | { type: "series" }
  | { type: "search" }
  | { type: "movie-list" }
  | { type: "series-list" };

export default function Page() {
  const [route, setRoute] = useState<Route>({ type: "home" });
  const [categories, setCategories] = useState<Category[]>([]);

  // Parse URL on mount + on popstate (browser back/forward)
  useEffect(() => {
    function parseRoute() {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      let path = window.location.pathname;
      if (basePath && path.startsWith(basePath)) {
        path = path.slice(basePath.length) || "/";
      }
      
      if (path.match(/^\/movie\/[^/]+\/?$/)) {
        setRoute({ type: "movie" });
      } else if (path.match(/^\/series\/[^/]+\/?$/)) {
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

  // Fetch categories for home
  useEffect(() => {
    if (route.type === "home" || route.type === "movie-list") {
      fetchCategoriesClient().then(setCategories).catch(() => {});
    }
  }, [route.type]);

  if (route.type === "movie") {
    return <MoviePageClient />;
  }
  if (route.type === "series") {
    return <SeriesPageClient />;
  }
  // Home, search, listings — all use HomeClient for now
  return <HomeClient categories={categories} />;
}

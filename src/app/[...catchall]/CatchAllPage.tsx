"use client";

import { useEffect, useState } from "react";
import { MoviePageClient } from "@/app/movie/[id]/MoviePageClient";
import { SeriesPageClient } from "@/app/series/[id]/SeriesPageClient";

/**
 * CatchAllPage — handles ALL routes client-side for GitHub Pages SPA.
 * 
 * When GitHub Pages serves 404.html (= index.html) for unknown routes,
 * Next.js renders the home page. But we need movie/series detail pages
 * to render. This component checks window.location.pathname and renders
 * the appropriate page component.
 */
export function CatchAllPage() {
  const [route, setRoute] = useState<{type: "movie" | "series" | "home", slug: string} | null>(null);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    let path = window.location.pathname;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length) || "/";
    }
    
    // Parse route
    const movieMatch = path.match(/^\/movie\/([^/]+)/);
    const seriesMatch = path.match(/^\/series\/([^/]+)/);
    
    if (movieMatch && movieMatch[1] !== "") {
      setRoute({ type: "movie", slug: movieMatch[1] });
    } else if (seriesMatch && seriesMatch[1] !== "") {
      setRoute({ type: "series", slug: seriesMatch[1] });
    } else {
      // Not a detail page — render nothing (home page handles itself)
      setRoute({ type: "home", slug: "" });
    }
  }, []);

  if (!route) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (route.type === "movie") {
    return <MoviePageClient />;
  }
  
  if (route.type === "series") {
    return <SeriesPageClient />;
  }

  // Home page — return null (the actual home page content is already rendered)
  return null;
}

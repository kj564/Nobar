"use client";

import { useEffect } from "react";

/**
 * SPARouter — GitHub Pages SPA routing fix.
 *
 * GitHub Pages serves 404.html for unknown routes (e.g., /movie/the-matrix-1999-603/).
 * The 404.html is a minimal shell that loads the same JS bundles as index.html
 * but has NO pre-rendered content. When Next.js loads, it sees the current URL
 * and routes to the correct page.
 *
 * This component adds a fallback: if the URL path doesn't start with / (home),
 * /search, /movie (listing), /series (listing), /_next, or /robots, it's likely
 * a movie/series detail page that needs client-side routing.
 */
export function SPARouter() {
  useEffect(() => {
    const fullPath = window.location.pathname;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    
    let path = fullPath;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length) || "/";
    }
    
    console.log("[SPA] Current path:", path, "| basePath:", basePath);
    
    // If path looks like /movie/{slug}/ or /series/{slug}/, 
    // ensure Next.js router picks it up
    if (path.match(/^\/(movie|series)\/[^/]+\/?$/) && path !== "/movie/" && path !== "/series/") {
      // Force a hard navigation to trigger Next.js routing
      // Using window.location.href causes a full reload which loads the correct route
      console.log("[SPA] Detected detail route, ensuring navigation to:", path);
      // Don't redirect — just make sure Next.js knows the current path
      // by dispatching a popstate event
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }
  }, []);

  return null;
}

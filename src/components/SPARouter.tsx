"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * SPARouter — GitHub Pages SPA routing fix.
 *
 * When GitHub Pages serves 404.html (which is a copy of index.html) for
 * unknown routes like /movie/the-matrix-1999-603/, the browser loads the
 * SPA at the correct URL. But Next.js App Router hydrates the pre-rendered
 * home page content instead of navigating to the movie route.
 *
 * This component runs after hydration and checks if the current URL matches
 * a known route (movie/, series/, search). If the URL doesn't match the
 * currently rendered route, it forces a client-side navigation.
 */
export function SPARouter() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Get the ACTUAL URL from the browser (not Next.js's internal pathname)
    const fullPath = window.location.pathname;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    
    // Remove basePath from the full path
    let actualPath = fullPath;
    if (basePath && actualPath.startsWith(basePath)) {
      actualPath = actualPath.slice(basePath.length) || "/";
    }
    
    // If the actual URL path doesn't match what Next.js thinks it is,
    // navigate to the correct route
    if (actualPath !== pathname && actualPath !== "/" && actualPath.length > 1) {
      console.log("[SPA] URL mismatch — navigating:", actualPath);
      router.replace(actualPath);
    }
  }, [router, pathname]);

  return null;
}

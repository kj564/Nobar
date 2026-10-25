"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * SPARouter — GitHub Pages SPA routing fix.
 *
 * GitHub Pages serves 404.html (= index.html) for unknown routes.
 * Next.js hydrates the home page content, ignoring the actual URL.
 * This component detects the mismatch and navigates to the correct route.
 */
export function SPARouter() {
  const router = useRouter();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) return;
    
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const fullPath = window.location.pathname;
    
    let path = fullPath;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length) || "/";
    }
    
    // Only navigate for detail pages (not home, listing, search, etc.)
    if (
      path.match(/^\/(movie|series)\/[^/]+\/?$/) &&
      path !== "/movie/" &&
      path !== "/series/"
    ) {
      hasNavigated.current = true;
      console.log("[SPA] Navigating to:", path);
      router.replace(path);
    }
  }, [router]);

  return null;
}

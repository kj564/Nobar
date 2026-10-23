import type { MetadataRoute } from "next";

// ─── SEO: robots.txt ────────────────────────────────────────────────────────
// Next.js surfaces this at /robots.txt automatically. Allow all crawlers
// to access the entire site and point them at our sitemap for discovery.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://nobar-stream.vercel.app/sitemap.xml",
  };
}

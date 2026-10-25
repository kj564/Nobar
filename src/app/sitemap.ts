import type { MetadataRoute } from "next";
export const dynamic = "force-static";

// ─── SEO: sitemap.xml ────────────────────────────────────────────────────────
// Next.js will surface this at /sitemap.xml automatically. We expose the
// top-level navigational routes (homepage, movie/series listings, search)
// rather than every detail page, to keep the sitemap lean and current.
// Detail pages are linked from those listing pages and are discoverable by
// crawlers via in-page links.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://nobar-stream.vercel.app";
  const lastModified = new Date();

  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/movie/`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${base}/series/`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${base}/search`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];
}

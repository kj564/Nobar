import { NextResponse } from "next/server";
import { fetchMovieDetailEnglish, fetchTVDetailEnglish } from "@/lib/tmdb";

// GET /api/idlix/resolve?id={tmdbId}&kind=movie|tv&season=1&episode=1
// Resolves a TMDB ID → Idlix old (idlix.tv direct IP) → vidhide.org embed URL.
//
// HOW IT WORKS:
//   1. Fetch TMDB title + year (English locale)
//   2. Construct slug: title-lowercased-and-hyphenated-{year}
//   3. Fetch http://178.62.87.194/{slug}/ (direct IP, no Cloudflare)
//   4. Parse the movie page HTML for <iframe src="https://vidhide.org/embed/{id}">
//   5. Return the vidhide embed URL — browser iframes it directly (zero Vercel egress)
//
// WHY THIS WORKS:
//   - idlix.tv redirects to direct IP 178.62.87.194 (bypasses z2.idlixku.com CF)
//   - The old WordPress site has NO Cloudflare protection
//   - vidhide.org has NO X-Frame-Options (iframeable)
//   - vidhide serves video segments directly from its own CDN
//   - Nobar doesn't proxy any video data (zero egress!)
//
// LIMITATIONS:
//   - Only ~107 movies on old Idlix (limited catalog)
//   - WP search is broken (doesn't filter by query) — we use slug-based URL
//   - Some movies have non-standard slugs (need variations)
//   - For TV: episode URLs use a different pattern (may need separate resolver)

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const runtime = "nodejs";

const IDLIX_BASE = "http://178.62.87.194";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

type IdlixResult = {
  embedUrl: string | null;
  title: string;
  year: string;
  slug: string;
  status: "found" | "not_found" | "error";
};

/**
 * Slugify a movie/TV title for Idlix URL construction.
 * Pattern: lowercase, replace non-alphanum with hyphens, collapse multiple hyphens.
 * Examples:
 *   "Inside Out 2" (2024) → "inside-out-2-2024"
 *   "Top Gun: Maverick" (2022) → "top-gun-maverick-2022"
 *   "The Batman" (2022) → "the-batman-2022"
 */
function buildSlug(title: string, year: string): string {
  const slug = title
    .toLowerCase()
    // Replace colons, commas, parentheses, periods, apostrophes with hyphens
    .replace(/[''`]/g, "")
    .replace(/[:;,\(\)\.\!\?]/g, " ")
    // Replace "&" with "and"
    .replace(/&/g, "and")
    // Replace any non-alphanumeric with hyphen
    .replace(/[^a-z0-9]+/g, "-")
    // Collapse multiple hyphens
    .replace(/-+/g, "-")
    // Trim leading/trailing hyphens
 .replace(/^-+|-+$/g, "");
  return `${slug}-${year}`;
}

/**
 * Extract vidhide.org embed URL from an Idlix movie page HTML.
 * Pattern: <iframe src="https://vidhide.org/embed/{id}">
 */
function extractVidhideEmbed(html: string): string | null {
  const m = html.match(/<iframe[^>]+src="(https:\/\/vidhide\.org\/embed\/[a-z0-9]+)"/i);
  return m ? m[1] : null;
}

/**
 * Try fetching an Idlix movie page by slug. Returns the HTML if 200, null otherwise.
 */
async function fetchIdlixPage(slug: string): Promise<string | null> {
  const url = `${IDLIX_BASE}/${slug}/`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Verify it's actually a movie page (not a 404 page that returns 200)
    // Idlix 404 pages also return 200, but they have "Laman tidak ditemukan" in title
    if (html.includes("Laman tidak ditemukan") || html.includes("404 Not Found")) {
      return null;
    }
    return html;
  } catch {
    return null;
  }
}

/**
 * Generate slug variations to try when the first one fails.
 * Examples:
 *   "the-batman-2022" → ["the-batman-2022", "batman-2022"]  (strip "the")
 *   "dune-part-two-2024" → ["dune-part-two-2024", "dune-part-2-2024"]  (word→digit)
 */
function slugVariations(slug: string): string[] {
  const variants = [slug];
  // Strip leading "the-" / "a-" / "an-"
  if (slug.startsWith("the-")) variants.push(slug.replace(/^the-/, ""));
  if (slug.startsWith("a-")) variants.push(slug.replace(/^a-/, ""));
  if (slug.startsWith("an-")) variants.push(slug.replace(/^an-/, ""));
  // Word → digit conversions
  variants.push(slug.replace(/\bpart-one\b/, "part-1").replace(/\bpart-two\b/, "part-2").replace(/\bpart-three\b/, "part-3"));
  variants.push(slug.replace(/\b-one\b/, "-1").replace(/\b-two\b/, "-2").replace(/\b-three\b/, "-3"));
  // Strip subtitle after colon (e.g., "mission-impossible-dead-reckoning" → "mission-impossible")
  // Already handled by the colon replacement above, but as fallback:
  // Return unique
  return [...new Set(variants)];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = url.searchParams.get("season") || "1";
  const episode = url.searchParams.get("episode") || "1";

  if (!id) {
    return NextResponse.json({ error: "id parameter required" }, { status: 400 });
  }

  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    // Step 1: Fetch TMDB title + year
    const detail = kind === "tv"
      ? await fetchTVDetailEnglish(tmdbId)
      : await fetchMovieDetailEnglish(tmdbId);

    const title = detail.title || detail.name || "";
    const dateField = kind === "tv" ? "first_air_date" : "release_date";
    const dateVal = (detail as any)[dateField] as string | undefined;
    const year = dateVal ? String(dateVal).slice(0, 4) : "";

    if (!title || !year) {
      return NextResponse.json({
        embedUrl: null,
        status: "error",
        message: "Could not determine title or year from TMDB",
      } as IdlixResult & { message: string });
    }

    // Step 2: Try slug variations
    const baseSlug = buildSlug(title, year);
    const variants = slugVariations(baseSlug);

    let foundHtml: string | null = null;
    let matchedSlug = "";
    for (const slug of variants) {
      const html = await fetchIdlixPage(slug);
      if (html) {
        foundHtml = html;
        matchedSlug = slug;
        break;
      }
    }

    if (!foundHtml) {
      return NextResponse.json({
        embedUrl: null,
        title,
        year,
        slug: baseSlug,
        status: "not_found" as const,
        message: `No Idlix page found for "${title} (${year})". Tried: ${variants.join(", ")}`,
      } as IdlixResult & { message: string });
    }

    // Step 3: Extract vidhide embed URL
    const embedUrl = extractVidhideEmbed(foundHtml);
    if (!embedUrl) {
      return NextResponse.json({
        embedUrl: null,
        title,
        year,
        slug: matchedSlug,
        status: "not_found" as const,
        message: "Idlix page found but no vidhide iframe",
      } as IdlixResult & { message: string });
    }

    return NextResponse.json({
      embedUrl,
      title,
      year,
      slug: matchedSlug,
      status: "found" as const,
    } as IdlixResult);
  } catch (err) {
    console.error("[idlix/resolve] error:", err);
    return NextResponse.json(
      { error: "Failed to resolve Idlix URL" },
      { status: 502 }
    );
  }
}

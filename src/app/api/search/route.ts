import { NextResponse } from "next/server";
import { searchMovies } from "@/lib/tmdb";

// GET /api/search?q=spider&page=1
// Wraps TMDB /search/movie. Dynamic (not cached at edge) because search
// queries are user-specific + highly variable.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      return NextResponse.json(
        { error: "Missing 'q' query param", results: [], page: 1, total_pages: 1, total_results: 0 },
        { status: 400 }
      );
    }

    const rawPage = url.searchParams.get("page");
    const page = Number.isFinite(Number(rawPage)) && Number(rawPage) > 0
      ? Math.min(Number(rawPage), 500)
      : 1;

    const data = await searchMovies(q, page);

    return NextResponse.json(data, {
      headers: {
        // Search results: short browser cache only, no shared edge cache.
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to search movies";
    return NextResponse.json(
      { error: message, results: [], page: 1, total_pages: 1, total_results: 0 },
      { status: 500 }
    );
  }
}

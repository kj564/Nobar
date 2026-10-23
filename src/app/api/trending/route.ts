import { NextResponse } from "next/server";
import { fetchTrending } from "@/lib/tmdb";

// GET /api/trending?page=1
// Wraps TMDB /trending/movie/week with 5-minute ISR + Cache-Control.
// Server-side: shared in-memory cache + edge/CDN cache across all users.

export const revalidate = 300; // 5-minute ISR

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawPage = url.searchParams.get("page");
    const page = Number.isFinite(Number(rawPage)) && Number(rawPage) > 0
      ? Math.min(Number(rawPage), 500)
      : 1;

    const data = await fetchTrending(page);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch trending";
    return NextResponse.json(
      { error: message, results: [], page: 1, total_pages: 1, total_results: 0 },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { fetchTrendingTV } from "@/lib/tmdb";

// GET /api/tv-trending?page=1
// Wraps TMDB /trending/tv/week with 5-minute ISR + Cache-Control.

export const revalidate = 300; // 5-minute ISR

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawPage = url.searchParams.get("page");
    const page = Number.isFinite(Number(rawPage)) && Number(rawPage) > 0
      ? Math.min(Number(rawPage), 500)
      : 1;

    const data = await fetchTrendingTV(page);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch TV trending";
    return NextResponse.json(
      { error: message, results: [], page: 1, total_pages: 1, total_results: 0 },
      { status: 500 }
    );
  }
}

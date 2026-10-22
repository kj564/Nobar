import { NextResponse } from "next/server";
import { searchMovies } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const page = Number(url.searchParams.get("page") || "1");
  if (!q) {
    return NextResponse.json({ page: 1, total_pages: 0, total_results: 0, results: [] });
  }
  try {
    const data = await searchMovies(q, page);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TMDB fetch failed" },
      { status: 502 }
    );
  }
}

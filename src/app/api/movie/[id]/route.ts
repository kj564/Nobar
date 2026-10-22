import { NextResponse } from "next/server";
import { fetchMovieDetail } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const movieId = Number(id);
  if (!Number.isFinite(movieId)) {
    return NextResponse.json({ error: "invalid movie id" }, { status: 400 });
  }
  try {
    const data = await fetchMovieDetail(movieId);
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

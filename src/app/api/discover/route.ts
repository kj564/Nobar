import { NextResponse } from "next/server";
import { fetchByGenre } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const genre = url.searchParams.get("genre");
  const page = Number(url.searchParams.get("page") || "1");
  if (!genre) {
    return NextResponse.json({ error: "genre query required" }, { status: 400 });
  }
  try {
    const data = await fetchByGenre(Number(genre), page);
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

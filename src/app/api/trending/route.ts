import { NextResponse } from "next/server";
import { fetchTrending } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || "1");
  try {
    const data = await fetchTrending(page);
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

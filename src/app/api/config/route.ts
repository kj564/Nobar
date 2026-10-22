import { NextResponse } from "next/server";
import { SERVERS, CREATORS } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ servers: SERVERS, creators: CREATORS });
}

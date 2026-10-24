import ZAI from "z-ai-web-dev-sdk";
import { NextResponse } from "next/server";

// GET /api/subtitles/translate?url={srt_url}
// Fetches English SRT, translates to Indonesian via LLM, returns WebVTT.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SrtEntry = { index: number; start: string; end: string; text: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const srtUrl = url.searchParams.get("url");
  if (!srtUrl) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const fetchUrl = srtUrl.startsWith("http") ? srtUrl : `https://www.subtitlecat.com${srtUrl}`;
    const res = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.subtitlecat.com/",
      },
    });
    if (!res.ok) return NextResponse.json({ error: "SRT fetch failed" }, { status: 502 });

    const srtText = await res.text();
    const entries = parseSrt(srtText);
    if (entries.length === 0) return NextResponse.json({ error: "No entries" }, { status: 400 });

    const zai = await ZAI.create();
    const allTexts = entries.map((e) => e.text);
    const BATCH = 50;
    const translated: string[] = [];

    for (let i = 0; i < allTexts.length; i += BATCH) {
      const batch = allTexts.slice(i, i + BATCH);
      const numbered = batch.map((t, idx) => `${i + idx + 1}. ${t}`).join("\n");
      try {
        const response = await zai.chat.completions.create({
          messages: [
            { role: "system", content: "You are a subtitle translator. Translate each numbered line from English to Indonesian (Bahasa Indonesia). Output ONLY the translated text with line numbers, one per line. Keep it natural and conversational. No explanations. Preserve [sound effects] and (parentheses) as-is." },
            { role: "user", content: numbered },
          ],
          thinking: { type: "disabled" },
        });
        const text = response.choices[0]?.message?.content || "";
        const lines = text.split("\n").map((l: string) => l.replace(/^\d+\.\s*/, "").trim()).filter((l: string) => l);
        if (lines.length === batch.length) translated.push(...lines);
        else translated.push(...batch);
      } catch {
        translated.push(...batch);
      }
    }

    const vtt = toVtt(entries.map((e, i) => ({ ...e, text: translated[i] || e.text })));
    return new NextResponse(vtt, {
      headers: { "Content-Type": "text/vtt; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    console.error("[translate] error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}

function parseSrt(srt: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const blocks = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    let idx = 0, timeLine = "", textLines: string[] = [];
    if (lines[0].match(/^\d+$/)) { idx = parseInt(lines[0], 10); timeLine = lines[1] || ""; textLines = lines.slice(2); }
    else { timeLine = lines[0]; textLines = lines.slice(1); idx = entries.length + 1; }
    const m = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!m) continue;
    entries.push({ index: idx, start: m[1].replace(",", "."), end: m[2].replace(",", "."), text: textLines.join(" ").trim() });
  }
  return entries;
}

function toVtt(entries: SrtEntry[]): string {
  let vtt = "WEBVTT\n\n";
  for (const e of entries) { vtt += `${e.start} --> ${e.end}\n${e.text}\n\n`; }
  return vtt;
}

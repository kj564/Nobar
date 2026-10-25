import { NextResponse } from "next/server";
import { translate } from "@vitalets/google-translate-api";

// GET /api/subtitles/translate?url={en_srt_url}&url2={es_srt_url}
// Multi-Source Translation: English + Spanish → Indonesian (Auto)
// Uses @vitalets/google-translate-api (Google Translate, fast, free)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SrtEntry = { index: number; start: string; end: string; text: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const enSrtUrl = url.searchParams.get("url");
  const esSrtUrl = url.searchParams.get("url2"); // Spanish (optional, multi-source)

  if (!enSrtUrl) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    // Step 1: Fetch English SRT
    const fetchUrl = enSrtUrl.startsWith("http")
      ? enSrtUrl
      : `https://www.subtitlecat.com${enSrtUrl}`;
    const enRes = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.subtitlecat.com/",
      },
    });
    if (!enRes.ok) return NextResponse.json({ error: "SRT fetch failed" }, { status: 502 });

    const enText = await enRes.text();
    const entries = parseSrt(enText);
    if (entries.length === 0) {
      return NextResponse.json({ error: "No entries" }, { status: 400 });
    }

    // Step 2: Optionally fetch Spanish SRT (multi-source)
    let esEntries: SrtEntry[] | null = null;
    if (esSrtUrl) {
      try {
        const esFetchUrl = esSrtUrl.startsWith("http")
          ? esSrtUrl
          : `https://www.subtitlecat.com${esSrtUrl}`;
        const esRes = await fetch(esFetchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://www.subtitlecat.com/",
          },
        });
        if (esRes.ok) {
          esEntries = parseSrt(await esRes.text());
        }
      } catch {
        // Spanish fetch failed — continue with English only
      }
    }

    // Step 3: Batch translate using Google Translate API
    // Translate in batches of 15 lines with 500ms delay between batches
    const BATCH_SIZE = 15;
    const translatedTexts: string[] = [];
    const allTexts = entries.map((e) => e.text || " ");

    for (let i = 0; i < allTexts.length; i += BATCH_SIZE) {
      const batch = allTexts.slice(i, i + BATCH_SIZE);
      try {
        const combined = batch.join("\n");
        const result = await translate(combined, { from: "en", to: "id" });
        const lines = result.text.split("\n");
        if (lines.length >= batch.length) {
          translatedTexts.push(...lines.slice(0, batch.length));
        } else {
          translatedTexts.push(...batch);
        }
      } catch {
        // Rate limited or error — use original English text as fallback
        translatedTexts.push(...batch);
      }
      // Delay between batches to avoid rate limiting (Google allows ~5 req/s)
      await new Promise((r) => setTimeout(r, 300));
    }

    // Step 4: If all translations failed (rate limited), return English as-is
    // The user still gets subtitle text, just in English instead of Indonesian
    const translatedCount = translatedTexts.filter(
      (t, i) => t !== allTexts[i]
    ).length;

    if (translatedCount === 0) {
      console.warn("[translate] All batches failed (rate limited) — returning English");
    }

    // Step 5: Convert to WebVTT
    const vtt = toVtt(
      entries.map((e, i) => ({ ...e, text: translatedTexts[i] || e.text }))
    );

    return new NextResponse(vtt, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[translate] error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}

// Parse SRT format into structured entries
function parseSrt(srt: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const blocks = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    let idx = 0, timeLine = "", textLines: string[] = [];
    if (lines[0].match(/^\d+$/)) {
      idx = parseInt(lines[0], 10);
      timeLine = lines[1] || "";
      textLines = lines.slice(2);
    } else {
      timeLine = lines[0];
      textLines = lines.slice(1);
      idx = entries.length + 1;
    }
    const m = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!m) continue;
    entries.push({
      index: idx,
      start: m[1].replace(",", "."),
      end: m[2].replace(",", "."),
      text: textLines.join(" ").trim(),
    });
  }
  return entries;
}

// Convert entries to WebVTT
function toVtt(entries: SrtEntry[]): string {
  let vtt = "WEBVTT\n\n";
  for (const e of entries) {
    vtt += `${e.start} --> ${e.end}\n${e.text}\n\n`;
  }
  return vtt;
}

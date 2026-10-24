import { NextResponse } from "next/server";

// GET /api/vidlink/[id]?kind=movie|tv&season=1&episode=1
// vidlink.pro direct MP4 provider — runs fu.wasm server-side to generate
// auth token, calls vidlink.pro API, returns direct MP4 URLs.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let wasmReady: Promise<void> | null = null;

async function initWasm() {
  if (wasmReady) return wasmReady;

  wasmReady = (async () => {
    const fs = await import("fs");
    const path = await import("path");

    const bridgeCode = fs.readFileSync(
      path.join(process.cwd(), "lib/vidlink-wasm/wasm-bridge.js"),
      "utf8"
    );

    // Stub browser APIs for Node.js — only if not already set
    // (avoid overwriting real document in dev mode Turbopack runtime)
    if (!(globalThis as any).window) (globalThis as any).window = globalThis;
    if (!(globalThis as any).document || typeof (globalThis as any).document.querySelector !== 'function') {
      (globalThis as any).document = {
        createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] }),
        getElementById: () => null,
        getElementsByTagName: () => [],
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { appendChild: () => {} },
        head: { appendChild: () => {} },
      };
    }
    // navigator is read-only in Next.js runtime — use Object.defineProperty
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node', plugins: { namedItem: () => null } },
        writable: true,
        configurable: true,
      });
    } catch {}
    // Stub window.location (Go WASM accesses it)
    if (!(globalThis as any).location) {
      (globalThis as any).location = {
        protocol: 'https:',
        hostname: 'localhost',
        origin: 'https://localhost',
        href: 'https://localhost/',
        pathname: '/',
        search: '',
        hash: '',
      };
    }

    eval(bridgeCode);

    const sodium = (await import("libsodium-wrappers")).default;
    await sodium.ready;
    (globalThis as any).sodium = sodium;

    const wasmBuffer = fs.readFileSync(
      path.join(process.cwd(), "lib/vidlink-wasm/fu.wasm")
    );
    const dm = new (globalThis as any).Dm();
    const { instance } = await WebAssembly.instantiate(wasmBuffer, dm.importObject);
    dm.run(instance);

    await new Promise((r) => setTimeout(r, 2000));

    if (typeof (globalThis as any).getAdv !== "function") {
      throw new Error("getAdv not registered by WASM");
    }
  })();

  return wasmReady;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "movie") as "movie" | "tv";
  const season = url.searchParams.get("season") || "1";
  const episode = url.searchParams.get("episode") || "1";

  try {
    await initWasm();

    const token = (globalThis as any).getAdv(String(tmdbId));
    if (!token) {
      return NextResponse.json({ sources: [] });
    }

    const apiPath =
      kind === "tv"
        ? `/api/b/tv/${tmdbId}/${season}/${episode}/${token}`
        : `/api/b/movie/${token}`;
    const apiUrl = `https://vidlink.pro${apiPath}?multiLang=1`; // multiLang=1 for captions

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        Referer: `https://vidlink.pro/${kind}/${tmdbId}`,
      },
    });

    const text = await res.text();
    if (text === "null" || text.length < 10) {
      return NextResponse.json({ sources: [] });
    }

    const json = JSON.parse(text);
    const qualities = json?.stream?.qualities || {};

    const sources: Array<{
      quality: string;
      url: string;
      provider: string;
      type: string;
    }> = [];

    for (const [quality, data] of Object.entries(qualities)) {
      const qData = data as any;
      if (qData?.url && qData?.type === "mp4") {
        sources.push({
          quality: `${quality}p`,
          url: `/api/proxy?url=${encodeURIComponent(qData.url)}`,
          provider: "vidlink.pro",
          type: "mp4",
        });
      }
    }

    if (json?.stream?.playlist) {
      sources.push({
        quality: "HLS",
        url: `/api/proxy?url=${encodeURIComponent(json.stream.playlist)}`,
        provider: "vidlink.pro",
        type: "hls",
      });
    }

    // Extract captions (subtitles) from vidlink.pro response
    const captions = json?.stream?.captions || [];
    const subtitles: Array<{ language: string; url: string }> = captions.map((c: any) => ({
      language: c.language || "Unknown",
      url: `/api/subtitle?url=${encodeURIComponent(c.url)}`,
    }));

    return NextResponse.json({ sources, subtitles });
  } catch (err) {
    console.error("[vidlink] error:", err);
    return NextResponse.json({ sources: [] });
  }
}

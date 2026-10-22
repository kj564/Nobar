import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const STREAM_URL = 'http://localhost:3000/api/stream';

function vttCachePath(): string {
  return path.join(os.tmpdir(), 'video-subtitle.vtt');
}

function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^\s*\uFEFF/m, '')
    .replace(/\r+/g, '')
    .split('\n')
    .map((line) => line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/, '$1.$2'))
    .join('\n');
  return `WEBVTT\n\n${body.trim()}\n`;
}

// Singleton in-memory lock: only one extraction runs at a time across
// requests within the same Node.js process. Subsequent callers await
// the same promise.
let extractionPromise: Promise<string> | null = null;

async function extractSubtitleInner(): Promise<string> {
  const cachePath = vttCachePath();

  if (existsSync(cachePath)) {
    try {
      const cached = await readFile(cachePath, 'utf8');
      if (cached.startsWith('WEBVTT') && cached.length > 50) return cached;
    } catch {
      // ignore
    }
  }

  const tmpDir = path.join(os.tmpdir(), 'subtitle-extract');
  await mkdir(tmpDir, { recursive: true });
  const srtPath = path.join(tmpDir, `sub-${Date.now()}.srt`);

  return new Promise<string>((resolve, reject) => {
    // Extract first 30 minutes of subtitles. Reading the full 2h+ stream
    // would take ~40 min; limiting to 30 min keeps extraction under ~2 min
    // while covering the opening of the film (enough for most viewings).
    const args = [
      '-v', 'error',
      '-i', STREAM_URL,
      '-map', '0:2',
      '-t', '1800',
      '-f', 'srt',
      '-y',
      srtPath,
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    ff.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const timeout = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('ffmpeg extraction timed out (3 min)'));
    }, 180000);

    ff.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ff.on('close', async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const srt = await readFile(srtPath, 'utf8');
        const vtt = srtToVtt(srt);
        await writeFile(cachePath, vtt, 'utf8');
        try {
          await unlink(srtPath);
        } catch {}
        resolve(vtt);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function extractSubtitle(): Promise<string> {
  // Check cache once more under no lock — fast path.
  const cachePath = vttCachePath();
  if (existsSync(cachePath)) {
    try {
      const cached = await readFile(cachePath, 'utf8');
      if (cached.startsWith('WEBVTT') && cached.length > 50) return cached;
    } catch {
      // ignore
    }
  }

  if (!extractionPromise) {
    extractionPromise = extractSubtitleInner().finally(() => {
      extractionPromise = null;
    });
  }
  return extractionPromise;
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === '1';
  if (refresh && existsSync(vttCachePath())) {
    try {
      await unlink(vttCachePath());
    } catch {}
  }

  try {
    const vtt = await extractSubtitle();
    const cueCount = (vtt.match(/^\d{2}:\d{2}:\d{2}\.\d{3} -->/gm) || []).length;
    return new NextResponse(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Subtitle-Cues': String(cueCount),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed to extract subtitle', detail: message },
      { status: 500 }
    );
  }
}

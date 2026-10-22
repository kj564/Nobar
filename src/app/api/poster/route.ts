import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFile, mkdir, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const STREAM_URL = 'http://localhost:3000/api/stream';

function posterCachePath(): string {
  return path.join(os.tmpdir(), 'video-poster.jpg');
}

async function extractPoster(): Promise<Buffer> {
  const cachePath = posterCachePath();
  if (existsSync(cachePath)) {
    try {
      const cached = await readFile(cachePath);
      if (cached.length > 1000) return cached;
    } catch {
      // ignore
    }
  }

  const tmpDir = path.join(os.tmpdir(), 'poster-extract');
  await mkdir(tmpDir, { recursive: true });
  const imgPath = path.join(tmpDir, `poster-${Date.now()}.jpg`);

  return new Promise<Buffer>((resolve, reject) => {
    // Seek to ~5min in to skip intros/logos, grab one high-quality frame.
    const args = [
      '-v', 'error',
      '-ss', '00:05:00',
      '-i', STREAM_URL,
      '-frames:v', '1',
      '-q:v', '3',
      '-y',
      imgPath,
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    ff.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const timeout = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('poster extraction timed out'));
    }, 90000);

    ff.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ff.on('close', async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
        return;
      }
      try {
        const buf = await readFile(imgPath);
        // Persist to cache path
        try {
          await import('fs/promises').then((m) => m.writeFile(cachePath, buf));
        } catch {}
        try {
          await unlink(imgPath);
        } catch {}
        resolve(buf);
      } catch (e) {
        reject(e);
      }
    });
  });
}

export async function GET() {
  try {
    const buf = await extractPoster();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed to extract poster', detail: message },
      { status: 500 }
    );
  }
}

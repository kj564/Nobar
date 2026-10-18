import { NextRequest } from 'next/server';

const FILE_ID = '1CNfppo9jzgPqSrmZWJh7PYzx2RbN9hpa';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const range = request.headers.get('range');

  // Google Drive direct download endpoint for public files.
  // `confirm=t` bypasses the large-file confirmation page.
  const driveUrl = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`;

  const reqHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: '*/*',
  };
  if (range) {
    reqHeaders['Range'] = range;
  }

  let upstream: Response;
  try {
    upstream = await fetch(driveUrl, {
      headers: reqHeaders,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response('Failed to reach Google Drive', { status: 502 });
  }

  // If Google returned the confirmation HTML page, try the alternate endpoint.
  const ct = upstream.headers.get('content-type') || '';
  if (ct.includes('text/html') && upstream.status === 200) {
    const altUrl = `https://drive.google.com/uc?export=download&id=${FILE_ID}&confirm=t`;
    try {
      upstream = await fetch(altUrl, {
        headers: reqHeaders,
        redirect: 'follow',
      });
    } catch {
      // fall through with original response
    }
  }

  const resHeaders = new Headers();
  // We know this is a video file — force the correct content-type so the
  // browser's <video> element treats it as media (Google Drive serves the
  // raw bytes as application/octet-stream, which some browsers reject).
  resHeaders.set('Content-Type', 'video/mp4');
  resHeaders.set('Accept-Ranges', 'bytes');

  const contentRange = upstream.headers.get('content-range');
  const contentLength = upstream.headers.get('content-length');
  if (contentRange) resHeaders.set('Content-Range', contentRange);
  if (contentLength) resHeaders.set('Content-Length', contentLength);

  resHeaders.set('Cache-Control', 'public, max-age=3600');
  resHeaders.set('Access-Control-Allow-Origin', '*');

  if (!upstream.body) {
    return new Response('Empty upstream body', { status: 502 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

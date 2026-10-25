// Cloudflare Worker: mzfi CDN Referer injector
// Deploy: wrangler deploy
// Free tier: 100,000 requests/day

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // The actual CDN URL is passed as ?url=...
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response('Missing url param', { status: 400 });
    }
    
    // Map CDN domain → required Referer
    let referer = 'https://mzfi.me/';
    let origin = 'https://mzfi.me';
    if (targetUrl.includes('bcdn.hakunaymatata.com')) {
      // vidlink MP4 — REJECTS browser UA. Send no UA at all.
      referer = '';
      origin = '';
    } else if (targetUrl.includes('sbcdnw.hakunaymatata.com')) {
      referer = 'https://movieboxhd.net/';
      origin = 'https://movieboxhd.net';
    } else if (targetUrl.includes('bcdnxw.hakunaymatata.com')) {
      referer = 'https://mzfi.me/';
      origin = 'https://mzfi.me';
    }
    
    // Build headers
    const headers = new Headers();
    headers.set('Accept', '*/*');
    headers.set('Accept-Language', 'en-US,en;q=0.9');
    if (referer) {
      headers.set('Referer', referer);
      headers.set('Origin', origin);
    }
    // For bcdn (vidlink MP4) — no UA (CDN rejects browser UA with 428)
    if (!targetUrl.includes('bcdn.hakunaymatata.com')) {
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    }
    
    // Pass through Range header for video seeking
    const range = request.headers.get('range');
    if (range) headers.set('Range', range);
    
    // Pass through X-MB-Token for sbcdnw DASH
    const mbToken = url.searchParams.get('mbtoken');
    if (mbToken) headers.set('X-MB-Token', mbToken);
    
    // Fetch from CDN
    const cdnRes = await fetch(targetUrl, { headers, redirect: 'follow' });
    
    // Return with CORS headers (browser can now read the response)
    const respHeaders = new Headers(cdnRes.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Range');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    respHeaders.set('Cache-Control', 'public, max-age=3600');
    
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: respHeaders });
    }
    
    return new Response(cdnRes.body, { status: cdnRes.status, headers: respHeaders });
  }
};

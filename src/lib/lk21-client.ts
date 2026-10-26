// Client-side lk21 resolver — applies lk21's OWN approach:
// fetch encrypted config + key, decrypt IN THE BROWSER via WebCrypto.
//
// Why this works without our own server:
//   - lk21official.fun (catalog)         → CORS-blocked, but corsproxy.io proxies it
//   - putarin.biz/e/{code} (embed page)  → CORS-blocked, but corsproxy.io proxies it
//   - putarin.biz/api/pk (AES key)       → CORS-blocked, but corsproxy.io proxies it
//   - putarin.biz/api/hls (m3u8)         → CORS-OPEN (ACAO: *), browser fetches directly
//   - lowhls9.stream121.space (segments) → CORS-OPEN (ACAO: *), hls.js fetches directly
//
// The AES-256-GCM decryption happens IN THE BROWSER via window.crypto.subtle
// (WebCrypto API). This is exactly what lk21's px.js does — we're just
// replicating it in our own code instead of loading their script.
//
// Fallback: if corsproxy.io is down or lk21 changes structure, the cdn-proxy
// server resolver (/lk21/resolve via :3003) is used as a backup.
//
// See RESEARCH.md for the full reverse-engineering write-up.

const LK21_BASE = "https://lk21official.fun";
const CORS_PROXIES = [
  "https://corsproxy.io/?url=",
  "https://api.allorigins.win/raw?url=",
  "https://api.codetabs.com/v1/proxy/?url=",
];

// Pick a CORS proxy. We try corsproxy.io first (most reliable in testing),
// fall back to the others if it's down.
let proxyIdx = 0;
function corsProxyUrl(url: string): string {
  const proxy = CORS_PROXIES[proxyIdx % CORS_PROXIES.length];
  return proxy + encodeURIComponent(url);
}

async function fetchViaProxy(url: string, timeoutMs = 15000): Promise<string> {
  // Try the current proxy first; on failure, rotate to the next.
  for (let attempt = 0; attempt < CORS_PROXIES.length; attempt++) {
    try {
      const res = await fetch(corsProxyUrl(url), {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
    } catch {
      // Rotate to next proxy for next attempt.
    }
    proxyIdx++;
  }
  throw new Error(`All CORS proxies failed for ${url}`);
}

// base64 → Uint8Array (handles JSON-escaped \/ and URL-safe chars)
function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/\\\//g, "/").replace(/-/g, "+").replace(/_/g, "/");
  const b = atob(clean);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

// hex string → Uint8Array
function hexToBytes(s: string): Uint8Array {
  const u = new Uint8Array(s.length >> 1);
  for (let i = 0; i < u.length; i++) {
    u[i] = parseInt(s.substr(i << 1, 2), 16);
  }
  return u;
}

// ─── Step 1: Search lk21 catalog via CORS proxy ──────────────────────
async function searchLk21(query: string): Promise<
  Array<{ slug: string; title: string; url: string }>
> {
  const html = await fetchViaProxy(`${LK21_BASE}/?s=${encodeURIComponent(query)}`);
  const results: Array<{ slug: string; title: string; url: string }> = [];
  const seen = new Set<string>();

  const re = /href="https:\/\/lk21official\.fun\/([^"/]+)\/"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    if (
      /^(wp-json|wp-admin|wp-content|wp-includes|wp-login|feed|rss|search|page|category|tag|abjad|genre|country|year|populer|latest|rating|release|most-commented|top-movie-today|quality|series-terbaru|privacy-policy|dmca|about|contact|disclaimer|sitemap|serial-terbaru|film-terbaru)$/i.test(
        slug
      )
    ) {
      continue;
    }
    seen.add(slug);
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    results.push({ slug, title, url: `${LK21_BASE}/${slug}/` });
  }
  return results;
}

// ─── Step 2: Fetch movie detail page, extract putarin embed code ────
async function extractPutarinCode(
  movieUrl: string
): Promise<{ code: string; domain: string } | null> {
  const html = await fetchViaProxy(movieUrl);
  const m = html.match(
    /src="(https?:\/\/putarin\.(biz|xyz)\/e\/([A-Za-z0-9_-]+))"/
  );
  if (!m) return null;
  return { code: m[3], domain: m[2] };
}

// ─── Step 3+4: Fetch putarin embed, extract __PX blob + AES key ──────
// Both the embed page AND /api/pk are CORS-blocked, so we proxy both.
async function extractPXBlob(
  code: string,
  domain: string
): Promise<{ n: string; d: string; base: string }> {
  const base = `https://putarin.${domain}`;
  const html = await fetchViaProxy(`${base}/e/${code}`);
  const m = html.match(
    /window\.__PX\s*=\s*\{"n":"([^"]+)","d":"([^"]+)","v":"[^"]*"\}/
  );
  if (!m) throw new Error("Could not parse __PX from putarin page");
  return { n: m[1], d: m[2], base };
}

async function fetchPk(nonce: string, base: string): Promise<string> {
  const key = await fetchViaProxy(`${base}/api/pk?n=${encodeURIComponent(nonce)}`);
  const trimmed = key.trim();
  if (trimmed.length < 64) throw new Error(`Key too short: ${trimmed.length}`);
  return trimmed;
}

// ─── Step 5: AES-256-GCM decrypt IN THE BROWSER via WebCrypto ────────
// This is the key insight from lk21's approach: the decryption happens
// client-side. lk21's px.js does this exact same thing — we're just
// replicating it. The key never touches our server.
async function decryptPlayer(
  px: { n: string; d: string; base: string }
): Promise<{ file: string; type: string }> {
  const keyHex = await fetchPk(px.n, px.base);
  const raw = b64ToBytes(px.d);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const keyBytes = hexToBytes(keyHex);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const ptBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ct
  );
  const text = new TextDecoder().decode(ptBuffer);
  return JSON.parse(text);
}

// ─── Full pipeline: title → playable HLS URL (ZERO server round-trips) ──
export async function resolveLk21Client(
  title: string,
  year?: string
): Promise<{
  sources: Array<{ quality: string; url: string; provider: string; type: string }>;
  subtitles: Array<{ language: string; url: string }>;
} | null> {
  try {
    // 1. Search lk21 catalog (via CORS proxy).
    const results = await searchLk21(title);
    if (results.length === 0) return null;

    // 2. Pick best match (normalized title, year tiebreaker).
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wantNorm = norm(title);
    let best: { slug: string; url: string } | null = null;
    let bestScore = 0;
    for (const r of results) {
      const slugNorm = norm(r.slug);
      let score = 0;
      if (slugNorm === wantNorm) score = 100;
      else if (slugNorm.startsWith(wantNorm) || wantNorm.startsWith(slugNorm)) score = 80;
      else if (slugNorm.includes(wantNorm) || wantNorm.includes(slugNorm)) score = 60;
      if (year && slugNorm.endsWith(norm(year))) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (!best || bestScore < 60) return null;

    // 3. Fetch movie detail → extract putarin embed code + domain.
    const putarin = await extractPutarinCode(best.url);
    if (!putarin) return null;

    // 4. Fetch putarin embed → extract __PX blob.
    const px = await extractPXBlob(putarin.code, putarin.domain);

    // 5. Decrypt PLAYER config IN THE BROWSER via WebCrypto.
    const player = await decryptPlayer(px);

    // 6. Build the absolute HLS URL.
    let hlsUrl = player.file;
    if (hlsUrl.startsWith("/")) {
      hlsUrl = px.base + hlsUrl;
    }

    return {
      sources: [
        {
          quality: "Auto",
          url: hlsUrl,
          provider: `lk21 (putarin.${putarin.domain})`,
          type: "hls-direct", // CORS-open, browser plays via hls.js
        },
      ],
      subtitles: [],
    };
  } catch (e) {
    console.warn("[NOBAR] client-side lk21 resolve failed:", e);
    return null;
  }
}

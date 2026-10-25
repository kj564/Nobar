# vidlink.pro — Complete Reverse Engineering Report

**Date:** Oct 25, 2026  
**Status:** ✅ FULLY REVERSED end-to-end  
**Berlian found:** ZERO-VERCEL-EGRESS path via CloudFront cookie → URL query conversion

---

## Executive Summary

vidlink.pro's entire video delivery architecture has been completely reverse-engineered.
The most critical discovery is that the **CloudFront-Policy cookie** returned by the API can
be **converted into URL query parameters**, enabling the browser to fetch HLS segments
**directly from sacdn.hakunaymatata.com** without any server-side proxy. This eliminates
Vercel egress for video segments — only a tiny ~8KB JSON API response travels through
Vercel.

### Comparison: Before vs After

| Metric | Before (current code) | After (this RE) |
|---|---|---|
| Token generation | fu.wasm (2.4MB, 3s startup) | libsodium (instant, <1ms) |
| Video egress via Vercel | 100% (all segments proxied) | ~0% (browser fetches directly) |
| Subtitle egress | 100% (proxied via /api/subtitle) | 0% (URL-embedded auth) |
| Browser player | hls.js (forced through /api/proxy) | hls.js with custom loader (direct CDN) |
| Total egress per 2hr movie | ~4 GB | ~8 KB (API JSON only) |

---

## 1. Token Generation (Pure Sodium, No WASM)

### Token Formula (VERIFIED bit-for-bit against WASM)

```
nonce = 24 × 0x00  (deterministic, all zeros)
msg   = ascii(movieId) + b"\x00\x00\x00\x00" + struct.pack(">I", unix_timestamp)
ct    = crypto_secretbox_easy(msg, nonce, KEY)   # 16-byte MAC + len(msg) bytes
token = base64url(nonce + ct)                    # 51 bytes → 68 chars
```

### Constants

- **KEY** (32 bytes, extracted from fu.wasm data section, STATIC for all movies):
  ```
  c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd
  ```
- **Nonce**: 24 zero bytes (deterministic — same movieId+timestamp always produces same token)
- **Timestamp**: current Unix time + 5 seconds (FUTURE timestamp required! See §1.2)

### 1.1 Critical Discovery: Timestamp must be in the FUTURE

The worklog from Oct 24 incorrectly stated the message suffix was a constant `\x6a\xdd\xa0\x55`.
This was actually a Unix timestamp that happened to match at the time of testing.

**Verified behavior** (Oct 25, 2026):
| Timestamp offset | API response |
|---|---|
| -30s, -10s, -5s | `null` (rejected) |
| 0s (current time) | `null` (rejected — race condition with server clock) |
| **+5s** | ✅ `200 OK` + full stream JSON |
| **+10s** | ✅ `200 OK` + full stream JSON |

**Why WASM works but pure-sodium "offset=0" fails**: WASM captures the timestamp at startup
(~2.5s before getAdv is called), so by the time the API request arrives at vidlink.pro's
server, the token's timestamp is already ~3 seconds in the past RELATIVE TO MY CLOCK but
might be ~0 or +1s relative to the server's clock (clock skew). Adding +5s explicitly
ensures the timestamp is always in the future from the server's perspective.

### 1.2 Pure-Sodium Implementation

```javascript
const sodium = require('libsodium-wrappers');
await sodium.ready;

const KEY = Uint8Array.from(Buffer.from(
  'c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd', 'hex'
));

function mintToken(movieId) {
  const nonce = new Uint8Array(24);  // 24 zeros
  const idBytes = Buffer.from(String(movieId), 'ascii');
  const pad = Buffer.from([0, 0, 0, 0]);
  const tsBuf = Buffer.alloc(4);
  tsBuf.writeUInt32BE(Math.floor(Date.now() / 1000) + 5);  // +5s future!
  const msg = Buffer.concat([idBytes, pad, tsBuf]);

  const ct = sodium.crypto_secretbox_easy(msg, nonce, KEY);
  const ctBuf = Buffer.alloc(ct.length); ctBuf.set(ct);  // avoid ArrayBuffer view bug
  const nonceBuf = Buffer.alloc(24); nonceBuf.set(nonce);
  const combined = Buffer.concat([nonceBuf, ctBuf]);

  return combined.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

**Critical implementation note**: `Buffer.from(uint8array)` in Node.js can sometimes grab
the underlying ArrayBuffer rather than the view. Always use `Buffer.alloc(len)` + `.set(u8)`
to ensure correct length.

### 1.3 Verification: Pure-Sodium vs WASM

Forced same-timestamp comparison (5 IDs):
```
[603]    ts=1792910325  match=YES ✓
[550]    ts=1792910325  match=YES ✓
[135397] ts=1792910325  match=YES ✓
[12345]  ts=1792910325  match=YES ✓
[999999] ts=1792910325  match=YES ✓
```

---

## 2. API Endpoint

### 2.1 Movie

```
GET https://vidlink.pro/api/b/movie/{token}?multiLang=1

Headers:
  User-Agent: Mozilla/5.0 ... Chrome/120.0.0.0 ...
  Accept: application/json
  Referer: https://vidlink.pro/movie/{tmdbId}
  X-Playback-Environment: hls      ← returns HLS playlist + CloudFront cookie
                                     (omit or use "standard" for MP4 only)
```

### 2.2 TV

```
GET https://vidlink.pro/api/b/tv/{tmdbId}/{season}/{episode}/{token}?multiLang=1
```

### 2.3 Response Format (X-Playback-Environment: hls)

```json
{
  "sourceId": "mwVault",
  "stream": {
    "id": "primary",
    "type": "hls",
    "deliveryType": "hls",
    "playlist": "https://sacdn.hakunaymatata.com/hls/{id}/local.m3u8",
    "playlistHeaders": {
      "Cookie": "CloudFront-Policy=...;CloudFront-Signature=...;CloudFront-Key-Pair-Id=KMHN1LQ1HEUPL;",
      "Origin": "https://sacdn.hakunaymatata.com",
      "Referer": "https://sacdn.hakunaymatata.com/"
    },
    "requiresProxy": true,
    "captions": [
      {
        "id": "...",
        "url": "https://cacdn.hakunaymatata.com/subtitle/{hash}.srt?Policy=...&Signature=...&Key-Pair-Id=...",
        "language": "English",
        "type": "srt",
        "hasCorsRestrictions": false
      }
    ]
  }
}
```

---

## 3. THE BERLIAN: CloudFront Cookie → URL Query Conversion

### 3.1 The Problem

The API returns `playlistHeaders.Cookie` containing:
```
CloudFront-Policy=...;CloudFront-Signature=...;CloudFront-Key-Pair-Id=...;
```

To play the HLS stream, the browser needs to send this Cookie with every request to
`sacdn.hakunaymatata.com`. But:

1. **Cookie is a forbidden request header** — JavaScript `fetch()` cannot set it cross-origin.
2. **`document.cookie` can't set cross-domain cookies** — nobar-stream.vercel.app
   cannot set cookies for sacdn.hakunaymatata.com.
3. **`<video crossorigin="use-credentials">`** requires `Access-Control-Allow-Credentials: true`
   AND `Access-Control-Allow-Origin: <specific origin>` (not `*`).

### 3.2 The Solution

**CloudFront signed URLs support BOTH cookie-based AND URL-query-based authentication.**

The cookie names are `CloudFront-Policy`, `CloudFront-Signature`, `CloudFront-Key-Pair-Id`.
The URL query parameter names are `Policy`, `Signature`, `Key-Pair-Id` (drop the `CloudFront-` prefix!).

### 3.3 Conversion Formula

```javascript
const cookie = response.stream.playlistHeaders.Cookie;
const policy    = (cookie.match(/CloudFront-Policy=([^;]+)/)     || [])[1];
const signature = (cookie.match(/CloudFront-Signature=([^;]+)/)  || [])[1];
const keyPairId = (cookie.match(/CloudFront-Key-Pair-Id=([^;]+)/)|| [])[1];

// Build signed URL — values are ALREADY base64url-safe, do NOT URL-encode them!
const signedUrl = response.stream.playlist
  + '?Policy=' + policy
  + '&Signature=' + signature
  + '&Key-Pair-Id=' + keyPairId;
```

### 3.4 Verification (Oct 25, 2026)

| Resource | Status | Size | ACAO | Auth Method |
|---|---|---|---|---|
| m3u8 manifest | 200 | 36966 bytes | `*` | URL query (no Cookie header) |
| HLS segment (.ts) | 206 (Range honored) | 1024 bytes | `*` | URL query (no Cookie header) |
| Subtitle (.srt) | 200 | 92281 bytes | `*` | URL-embedded (from API response) |

**ALL THREE work directly from the browser with NO server-side proxy.**

### 3.5 Why This Works

1. `sacdn.hakunaymatata.com` (CloudFront) sends `Access-Control-Allow-Origin: *` —
   the browser can read cross-origin responses.
2. CloudFront's signed URL authentication accepts the `Policy`/`Signature`/`Key-Pair-Id`
   as URL query parameters — no Cookie header needed.
3. The Policy JSON authorizes the entire `/hls/{id}/*` path prefix:
   ```json
   {
     "Statement": [{
       "Resource": "https://sacdn.hakunaymatata.com/hls/7976741359531216672-0-0-1080-998/*",
       "Condition": {"DateLessThan": {"AWS:EpochTime": 1793466207}}
     }]
   }
   ```
   So ONE signed URL works for the m3u8 AND ALL segments under the same path.
4. Subtitle CDN (`cacdn.hakunaymatata.com`) uses URL-embedded auth directly from the
   API response — no conversion needed.

### 3.6 Critical Implementation Detail: hls.js Segment URL Auth Injection

The m3u8 manifest contains RELATIVE segment paths:
```
#EXTINF:10.000000,
3356-17136-1080P_00001.ts
```

When hls.js resolves these relative to the m3u8 URL, **the query parameters are dropped**
(per URL resolution rules). So segments need their auth re-injected.

**Solution: Custom hls.js fragment loader**

```javascript
const AUTH_QUERY = 'Policy=' + policy + '&Signature=' + signature + '&Key-Pair-Id=' + keyPairId;

class AuthInjectLoader extends Hls.DefaultConfig.loader {
  load(context, config, callbacks) {
    if (context.url && context.url.includes('.ts') && !context.url.includes('Policy=')) {
      const sep = context.url.includes('?') ? '&' : '?';
      context.url = context.url + sep + AUTH_QUERY;
    }
    super.load(context, config, callbacks);
  }
}

const hls = new Hls({ fLoader: AuthInjectLoader });
hls.loadSource(signedM3u8Url);  // m3u8 with auth in URL query
```

**Alternative: Server-side m3u8 rewrite** (simpler, ~37KB egress per movie):
1. Server fetches m3u8 manifest (with Cookie header, server-side)
2. Server rewrites each segment URL to absolute + append `?Policy=...&Signature=...&Key-Pair-Id=...`
3. Server returns rewritten m3u8 to browser
4. Browser uses hls.js with DEFAULT config (no custom loader needed)

---

## 4. Surge Proxy (vidlink.pro's Own Solution) — Documented but NOT Recommended

The vidlink.pro SPA itself uses a public proxy at `surge.flooderrr.store`:

```
https://surge.flooderrr.store/proxy/hls/{path}?headers={base64_json}&host={origin}
```

Where the `headers` JSON contains:
```json
{
  "Cookie": "CloudFront-Policy=...;CloudFront-Signature=...;CloudFront-Key-Pair-Id=...",
  "Origin": "https://sacdn.hakunaymatata.com",
  "Referer": "https://sacdn.hakunaymatata.com/"
}
```

### Why we DON'T use surge:

1. **Cloudflare bot protection** — `surge.flooderrr.store` returns 403 to non-browser clients (curl, Node.js fetch).
2. **No CORS** — surge does NOT send `Access-Control-Allow-Origin` for cross-origin requests.
   - Verified: `fetch(surgeUrl, {mode: 'cors'})` from `example.com` → `Failed to fetch`
   - `fetch(surgeUrl, {mode: 'no-cors'})` → opaque response (JS can't read)
3. **Only works for vidlink.pro origin** — vidlink.pro SPA's same-origin requests succeed because
   surge probably sends `ACAO: https://vidlink.pro` specifically.
4. **`<video src>` works in Safari** (native HLS, no CORS needed for media), but
   **fails in Chrome** (no native HLS, hls.js needs CORS).

The CloudFront-cookie-to-URL-query conversion (§3) is strictly superior — no proxy needed at all.

---

## 5. Complete Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        NOBAR STREAM (Vercel)                       │
│                                                                    │
│  /api/vidlink/[id]  ← Server-only job (~8KB response, <50ms):     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. Mint token via sodium (no WASM) — <1ms                    │  │
│  │    nonce=0×24, msg=movieId+\0×4+BE(now+5s), KEY=STATIC       │  │
│  │    token = base64url(nonce + secretbox_easy(msg,nonce,KEY))   │  │
│  │                                                              │  │
│  │ 2. fetch https://vidlink.pro/api/b/movie/{token}?multiLang=1│  │
│  │    Headers: X-Playback-Environment: hls                      │  │
│  │                                                              │  │
│  │ 3. Parse response: extract playlist + CloudFront cookie      │  │
│  │                                                              │  │
│  │ 4. Convert cookie → URL query params:                       │  │
│  │    CloudFront-Policy= → Policy=                              │  │
│  │    CloudFront-Signature= → Signature=                        │  │
│  │    CloudFront-Key-Pair-Id= → Key-Pair-Id=                    │  │
│  │                                                              │  │
│  │ 5. Return JSON to browser:                                   │  │
│  │    { m3u8_url: signed_url,                                  │  │
│  │      policy, signature, keyPairId,                           │  │
│  │      subtitles: [{url, language}, ...] }                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              │ 8KB JSON
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                          BROWSER                                   │
│                                                                    │
│  hls.js with custom fLoader:                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. Load m3u8 from sacdn (signed URL with auth query)         │  │
│  │    → 200 OK, ACAO:*, no Cookie header needed                 │  │
│  │                                                              │  │
│  │ 2. For each .ts segment, append auth query:                  │  │
│  │    url += '?Policy=...&Signature=...&Key-Pair-Id=...'        │  │
│  │    → 206 Partial Content, ACAO:*                              │  │
│  │                                                              │  │
│  │ 3. Load subtitles from cacdn (URL-embedded auth, no loader)  │  │
│  │    → 200 OK, ACAO:*                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              │ direct segment fetches (NO Vercel egress!)
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                  sacdn.hakunaymatata.com (CloudFront)              │
│                  cacdn.hakunaymatata.com (subtitles)               │
│                  bcdn.hakunaymatata.com (MP4 alt path)             │
│                                                                    │
│  - CORS: Access-Control-Allow-Origin: *                            │
│  - Auth: CloudFront signed URL (Policy/Signature/Key-Pair-Id)      │
│  - Cache: 360-day CloudFront edge cache                            │
│  - Range: supported (206 Partial Content)                          │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. Subtitles (cacdn.hakunaymatata.com)

Subtitles are the EASIEST case — they work directly from the browser with zero server involvement:

- URL format: `https://cacdn.hakunaymatata.com/subtitle/{hash}.srt?Policy=...&Signature=...&Key-Pair-Id=...`
- Auth is URL-embedded (signed URL format, not cookie)
- `hasCorsRestrictions: false` flag in API response
- Verified: `Access-Control-Allow-Origin: *`, 200 OK, 92KB subtitle file fetched directly

**No proxy needed for subtitles.**

---

## 7. Token Decoding Reference

For debugging, here's how to decode a vidlink.pro token:

```javascript
const sodium = require('libsodium-wrappers');
await sodium.ready;

const KEY = Uint8Array.from(Buffer.from(
  'c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd', 'hex'
));

function decodeToken(token) {
  const buf = Buffer.from(
    token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - token.length % 4) % 4),
    'base64'
  );
  const nonce = buf.slice(0, 24);          // 24 zero bytes
  const ct = buf.slice(24);                // 27 bytes (16 MAC + 11 msg)
  const msg = sodium.crypto_secretbox_open_easy(ct, nonce, KEY);
  const msgBuf = Buffer.from(msg);

  const idEnd = msgBuf.indexOf(0);         // find first null byte
  const movieId = msgBuf.slice(0, idEnd).toString('ascii');
  const ts = msgBuf.readUInt32BE(msgBuf.length - 4);  // last 4 bytes, big-endian

  return { movieId, timestamp: ts, date: new Date(ts * 1000).toISOString() };
}
```

---

## 8. Files & Artifacts

- `/home/z/vidlink-re-v2/mint-pure-sodium-v2.cjs` — working pure-sodium token minter
- `/home/z/vidlink-re-v2/compare.cjs` — side-by-side WASM vs sodium verification
- `/home/z/vidlink-re-v2/final-api-response.json` — sample API response with HLS playlist + cookie
- `/tmp/vl-chunks/` — vidlink.pro SPA JS chunks (page-3041cae3d18df8ad.js contains the API call + surge URL rewriter)
- `/home/z/nobar-backup/lib/vidlink-wasm/fu.wasm` — original WASM (now obsolete, can be removed)

---

## 9. Recommendations for Nobar Implementation

### Phase 1: Pure-Sodium Migration (immediate, low-risk)
1. Replace `initWasm()` + `getAdv()` with pure-sodium `mintToken()` in `/api/vidlink/[id]/route.ts`
2. Delete `lib/vidlink-wasm/` (2.4MB saved in repo + 3s startup eliminated)
3. Remove the WASM bridge stubs (document, navigator, location)
4. Existing MP4 path (`requiresProxy: true` → `/api/proxy?url=...`) still works for backward compat

### Phase 2: Zero-Egress HLS (high-impact)
1. Add `X-Playback-Environment: hls` header to API call
2. Parse `playlistHeaders.Cookie` → extract Policy/Signature/Key-Pair-Id
3. Build signed m3u8 URL: `{playlist}?Policy=...&Signature=...&Key-Pair-Id=...`
4. Return to client as `{ m3u8_url, policy, signature, keyPairId, subtitles }`
5. In `NativePlayer.tsx`, configure hls.js with custom `fLoader` that appends auth to `.ts` URLs
6. Subtitles: pass URLs directly (no /api/subtitle proxy needed)

### Phase 3: Optional Cloudflare Worker (Chrome fallback)
If the custom loader approach has issues, deploy a tiny Cloudflare Worker that:
1. Receives m3u8 request from browser
2. Fetches m3u8 from sacdn (server-side, with Cookie)
3. Rewrites segment URLs to include auth query
4. Returns rewritten m3u8 with `ACAO: *`
5. Free tier: 100k req/day (~140 movies/day)

---

## 10. History of Findings

- **Oct 24, 2026** (worklog `RE-mzfi-harder`): Initial vidlink RE — extracted KEY, claimed token was
  deterministic with constant suffix `\x6a\xdd\xa0\x55`. Self-minted tokens verified to match WASM.
- **Oct 25, 2026** (this report): Discovered the constant suffix was actually a TIMESTAMP that
  happened to match. Re-verified formula with proper timestamp handling. Discovered the +5s future
  timestamp requirement. Discovered CloudFront cookie → URL query conversion (the true berlian).
  Verified end-to-end zero-egress playback path.

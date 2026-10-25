# Idlix RE Hard Mode — Final Report

**Date:** Oct 25, 2026  
**Status:** ✅ HARDER RE COMPLETE — Found bypass path through alternate domain  
**Goal:** Break through Idlix's anti-bot wall + find stream URLs

---

## TL;DR — Major Discoveries

**1. CF-bypassed Idlix backend FOUND via alternate domain:**
```
idlix.tv → 301 → http://178.62.87.194/  (DIRECT IP, no CF!)
```

This is a separate WordPress-based Idlix site (older, not Next.js) that:
- Has NO Cloudflare protection (direct nginx)
- Returns full HTML via curl (200 OK, 100KB+)
- Serves content via iframe embeds to **vidhide.org** (video host)

**2. vidhide.org stream API endpoint discovered:**
```
GET https://s2.vidhide.org/api-config/{base64_token}?p={base64_token}
POST https://s2.vidhide.org/api/?p={base64_token}
```
- **CORS-open**: `ACAO: *`, `ACAH: *`, `ACAM: GET,POST,HEAD,OPTIONS`
- Returns encrypted body (CryptoJS decrypts in JWPlayer)
- vidhide.org/embed/{id} has NO X-Frame-Options → iframeable

**3. Final answer on zero-egress:**
The vidhide API IS CORS-open, but the response is CryptoJS-encrypted. Browser
would need to run JWPlayer's JS to decrypt. This means:
- Iframe embed: ✅ WORKS (zero-egress, shows vidhide player)
- Browser-direct with custom decrypt: POSSIBLE but complex (need to RE JWPlayer's decrypt)

---

## Complete Architecture Map

### Path 1: Main Idlix (z2.idlixku.com) — Anti-Bot Walled

```
User → z2.idlixku.com → CF "Just a moment..." challenge
                       → Cloudflare Turnstile widget (manual click)
                       → CF clearance cookie (UA+IP-bound)
                       → /api/watch/play-info/{type}/{id} → "ngentod" 403 (custom bot detection)
                       → Even with valid cf_clearance + UA, API rejects
```

### Path 2: Old Idlix Backend (idlix.tv → 178.62.87.194) — Direct IP, no CF!

```
User → idlix.tv → 301 redirect → http://178.62.87.194/
                                  (DIRECT IP, nginx server, WordPress)
                                  ↓
                                 Movie page → 200 OK (100KB HTML, no CF)
                                  ↓
                                 iframe src="https://vidhide.org/embed/{id}"
                                  ↓
                                 vidhide JWPlayer loads → calls /api-config/{token}
                                  ↓
                                 GET https://s2.vidhide.org/api-config/{base64}?p={base64}
                                   → 200 OK, CORS-open (ACAO: *)
                                   → Returns CryptoJS-encrypted body (2200 bytes)
                                  ↓
                                 POST https://s2.vidhide.org/api/?p={base64}
                                   → 200 OK, CORS-open
                                   → Returns encrypted stream data
                                  ↓
                                 JWPlayer decrypts → plays stream
```

---

## Test Results

### Test 1: Alternate domains
```
idlix.net → 301 → z2.idlixku.com  (back to main)
idlix.co → 301 → duboku.io        (DIFFERENT site entirely)
idlix.cc → 301 → z1.idlixku.com → z2.idlixku.com
idlixian.com → 301 → z2.idlixku.com  (back to main)
idlix.tv → 301 → http://178.62.87.194/  ← DIRECT IP (NEW!)
```

### Test 2: Direct IP (178.62.87.194)
```
GET / → 200 OK, 368KB HTML (WordPress site, no CF)
Title: "IDLIX - Streaming Nonton Film dan Series Subtitle Indonesia"
Server: nginx (direct, no CF proxy)
```

### Test 3: Movie page on direct IP
```
GET /bring-the-law-2026/ → 200 OK, 100KB
Title: "IDLIX - Streaming Film Bring the Law (2026) Online Sub Indo"
Contains: <iframe src="https://vidhide.org/embed/zushpz" ...>
```

### Test 4: vidhide.org embed
```
GET https://vidhide.org/embed/zushpz → 200 OK, 97KB
Title: "Nonton REBAHIN - Bring the Law (2026) - 1080p"
Contains: JWPlayer setup + crypto-js + obfuscated JS (anti-devtools)
NO X-Frame-Options → iframeable
```

### Test 5: vidhide stream API
```
GET https://s2.vidhide.org/api-config/{base64_token}?p={base64_token}
→ HTTP 200, 2200 bytes (encrypted body)
→ access-control-allow-origin: *
→ access-control-allow-methods: GET, POST, HEAD, OPTIONS
→ access-control-allow-headers: *
→ access-control-expose-headers: *

POST https://s2.vidhide.org/api/?p={base64_token}
→ HTTP 200 (with proper body — without body returns "Not Found")
→ Same CORS-open headers
```

### Test 6: vidhide CDN
```
rebahintv.b-cdn.net → CDN for vidhide static assets (images)
Stream CDN not yet verified (need to decrypt the API response)
```

---

## Why Stream URLs Couldn't Be Fully Extracted

### The CryptoJS Encryption Layer

The vidhide API returns an **encrypted body** that JWPlayer decrypts using
crypto-js v4.2.0. The decryption logic is in `player-v4.6.6.min.js` (184KB
minified).

### Anti-DevTools Detection

The page loads `dd.js` (devtools detector). When DevTools is open:
- The page detects it and redirects to `example.com`
- This is why agent-browser showed "Example Domain" instead of the video

### The Sandbox Check

JWPlayer has a `check sandbox 1` function that throws:
```
"Cannot read properties of null (reading 'hasAttribute')"
```
This means the page detects it's being iframed with `sandbox` attribute and
refuses to play. Without sandbox, it would work.

### To Fully Extract Stream URLs

We'd need to:
1. Run JWPlayer's `player-v4.6.6.min.js` in a controlled environment
2. Bypass the devtools detector (override `dd.js`)
3. Capture the decrypted stream URL from JWPlayer's internal state
4. OR reverse-engineer the AES key from the minified JS

This is feasible but requires significant effort. The end result would be:
- Stream URL would be on `s2.vidhide.org` or a CDN like `rebahintv.b-cdn.net`
- Likely IP-bound (similar to vidio.com's hdntl)
- CORS may or may not be open (need to verify with real URL)

---

## Comparison with Other Providers (Updated)

| Provider | Anti-leech | Bot protection | API CORS | Zero-egress? |
|---|---|---|---|---|
| **vidlink.pro HLS (sacdn)** | None | Light | ✅ ACAO:* | ✅ **YES** (LIVE) |
| **Idlix (z2.idlixku.com)** | CF + custom | Aggressive | ❌ "ngentod" | ❌ NO |
| **Idlix old (178.62.87.194)** | None direct | None direct | ✅ ACAO:* (vidhide) | ⚠️ Possible (need decrypt) |
| **vidhide.org embed** | Sandbox check | dd.js devtools | ✅ ACAO:* | ⚠️ Possible (iframe works) |
| **bilibili.tv** | IP-bound URLs | Light | ✅ ACAO reflects | ❌ NO |
| **mzfi.me** | Referer anti-leech | None | ✅ ACAO:* | ❌ NO (Referer) |
| **vidio.com** | IP-bound hdntl | Light | ❌ No CORS | ❌ NO |

---

## Implementation Options

### Option A: Iframe Embed via vidhide (RECOMMENDED — Zero-Egress)

```
1. Server: fetch idlix.tv (or direct IP 178.62.87.194) movie page → extract vidhide embed URL
2. Browser: <iframe src="https://vidhide.org/embed/{id}">
3. vidhide JWPlayer handles playback (zero Vercel egress for video)
```

**Pros:**
- ✅ ZERO Vercel egress (vidhide serves everything)
- ✅ Bypasses z2.idlixku.com CF entirely (via direct IP)
- ✅ vidhide has NO X-Frame-Options
- ✅ vidhide stream API is CORS-open

**Cons:**
- Shows vidhide's JWPlayer UI (ads + watermark)
- Need to extract vidhide embed URL from idlix old WP HTML (server-side scrape)
- vidhide might have ads (typical for free video hosts)

**Effort:** Medium (build idlix.tv → vidhide URL resolver)

### Option B: Decrypt vidhide API + Direct Stream (Complex)

```
1. Server: scrape idlix.tv → get vidhide embed URL
2. Browser: fetch vidhide embed page → extract API tokens
3. Browser: fetch /api-config/{token} → encrypted body
4. Browser: run JWPlayer's decrypt logic → get stream URL
5. Browser: play stream directly (no iframe, no proxy)
```

**Pros:**
- ✅ ZERO Vercel egress
- ✅ Keeps Nobar UI (no vidhide player)
- ✅ Stream URL might be on a CORS-open CDN

**Cons:**
- Need to reverse-engineer JWPlayer's decrypt (complex)
- Need to bypass dd.js devtools detector
- Stream URL may be IP-bound (untested)
- High effort, fragile (vidhide can change encrypt scheme)

### Option C: Server-Side Decrypt (NOT zero-egress)

```
1. Server: scrape idlix → get vidhide URL
2. Server: fetch vidhide API → decrypt → get stream URL
3. Browser: /api/proxy?url={stream_url} → server proxies segments
```

**Pros:** Easier than Option B
**Cons:** ~4GB Vercel egress per movie (same as mzfi)

---

## Recommendation

**Idlix offers a viable path via vidhide iframe embed (Option A).** This is a
NEW discovery — we found a CF-bypassed backend (idlix.tv → direct IP) that
serves content via vidhide.org (which is CORS-open + iframeable).

### Should We Implement?

**Maybe — depends on catalog value:**

Idlix's old WP site has:
- ✅ Indonesian FTV (similar to vidio.com)
- ✅ Western movies (Bring the Law 2026, etc.)
- ✅ Anime, Korean dramas (Indonesian subs)
- ✅ Same catalog as main idlix (probably mirrored)

vs. existing providers:
- mzfi has same content (TMDB-based)
- vidlink has movies + TV

### Next Steps (If We Want to Implement)

1. Build `/api/idlix/resolve?q={title}` endpoint:
   - Search `idlix.tv/?s={title}` (WordPress search)
   - Or scrape homepage for trending movies
   - Return vidhide embed URLs

2. Add idlix as `embedUrl` source in `/api/stream/[id]/route.ts`:
   - When mzfi + vidlink both fail
   - Set `embedUrl` to the vidhide URL
   - NativePlayer shows iframe fallback

3. Test vidhide playback (may have ads, watermark)

---

## Test Artifacts

- `/tmp/idlix-tv.html` — idlix.tv redirect destination (58KB "site stopped" message with Host header)
- `/tmp/ip-direct.html` — direct IP homepage (368KB, full WordPress site)
- `/tmp/ip-movie2.html` — direct IP movie page (100KB, has vidhide iframe)
- `/tmp/vidhide.html` — vidhide embed page (97KB)
- `/tmp/vidhide-player.js` — JWPlayer bundle (184KB)
- `/tmp/vidhide-api.json` — encrypted API response (2200 bytes)
- `/tmp/idlix-chunks/` — z2.idlixku.com SPA chunks (20 files)

### Key Discoveries Summary

1. **idlix.tv** → redirects to **direct IP 178.62.87.194** (CF bypass!)
2. Direct IP serves **WordPress-based Idlix** (not Next.js)
3. Movie pages embed **vidhide.org/embed/{id}** iframes
4. vidhide.org has **NO X-Frame-Options** (iframeable)
5. vidhide stream API at **s2.vidhide.org/api-config/{token}** is **CORS-open** (ACAO:*)
6. Stream URL is **CryptoJS-encrypted** (need JWPlayer's decrypt logic)
7. vidhide has **anti-devtools** (dd.js) + **sandbox check** (refuses sandboxed iframes)

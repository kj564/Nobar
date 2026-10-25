# Vidio.com Reverse Engineering Report

**Date:** Oct 25, 2026  
**Status:** ✅ COMPLETE — Architecture mapped, zero-egress feasibility assessed  
**Question:** Can vidio.com be a zero-egress provider for Nobar?

---

## TL;DR Answer

**NO, vidio.com CANNOT be zero-egress** — same situation as mzfi and bilibili.

The segment CDN (`token-v2-media-001-vidio-com.akamaized.net`) has IP-bound auth
(`hdntl` parameter) that prevents browser-direct access from a different origin.

### Quick Comparison

| Provider | CDN CORS | Anti-leech | Zero-egress? |
|---|---|---|---|
| **vidlink.pro HLS (sacdn)** | ✅ ACAO:* | ❌ None | ✅ **YES** (LIVE) |
| **vidio.com (akamaized.net)** | ✅ ACAO:* (sometimes) | ✅ **IP-bound hdntl** | ❌ **NO** |
| **bilibili.tv (bilivideo.com)** | ✅ ACAO reflects | ✅ IP-bound | ❌ NO |
| **mzfi.me (sbcdnw)** | ✅ ACAO:* | ✅ Referer | ❌ NO |
| **vidlink.pro MP4 (bcdn)** | ✅ ACAO:* | ✅ UA anti-bot | ❌ NO |

---

## Architecture

### 1. Page Structure

```
GET https://www.vidio.com/watch/{video_id}-{slug}
  → Next.js SSR HTML (162KB)
  → No __NEXT_DATA__ visible (uses inline RSC payload)
  → Loads Shaka Player from static-web.prod.vidiocdn.com/_next/static/shaka
```

### 2. API Endpoints (captured via browser network)

```
https://api.vidio.com/api/stream/v1/video_data/{video_id}
  - Method: GET
  - Returns: video stream URLs (hls_url, dash_url)
  - Required headers:
    X-API-Platform: web-desktop
    X-Api-Key: <encrypted via getEncryptedApiKey() — dynamic>
    X-Secure-Level: 2
    luws: <UUID>_ (from cookie, set by vidio.com page)
    Referer: https://www.vidio.com/
  - Response: small JSON (~668 bytes for premium content)
  - Status: 401 "Unauthorized application" without proper X-Api-Key
  - Status: 200 with proper auth (returns play_url)

https://api.vidio.com/api/videos/{video_id}/detail
  - Returns: video metadata (title, description, poster)
  - Public (200 OK)

https://api.vidio.com/users/content_access?content_id={id}&content_type=Video
  - Returns: 401 for unauthenticated users
  - Used by SPA to determine premium/free status
```

### 3. CDN Domains

| Domain | Auth Method | Status | CORS |
|---|---|---|---|
| `token-v2-media-001-vidio-com.akamaized.net` | Akamai hdnts (master) + hdntl (segments) | ✅ 200/206 | ✅ ACAO:* (sometimes) |
| `api.vidio.com` | X-Api-Key + luws + Referer | ✅ 200 | ✅ ACAO: https://www.vidio.com |
| `www.vidio.com` | Cookie session | ✅ 200 | ❌ No CORS |
| `static-web-dd.prod.vidiocdn.com` | None | ✅ 200 | (static assets) |
| `thumbor.prod.vidiocdn.com` | None | ✅ 200 | (image CDN) |

### 4. URL Auth Parameters

**Master m3u8 URL (hdnts auth):**
```
?hdnts=exp={expiry}~acl=/uploads/{video_id}/preview/*~id=allUsers~hmac={hmac_hex}
```

**Segment URL (hdntl auth — IP-bound):**
```
/hdntl=exp={expiry}~acl=/uploads/{video_id}/preview/*~id=allUsers~data=hdntl~hmac={hmac_hex}/preview_playlist-{quality}-{hash}.m4s
```

The `hdntl` parameter signs against the requesting IP via Akamai edge auth.

### 5. Anti-Leech Analysis

**hdnts (master m3u8):**
- `id=allUsers` — NOT IP-bound (any IP can use the URL)
- Works via curl from different IP → 200 OK
- Expiry: ~24 hours

**hdntl (segments):**
- `data=hdntl` — IP-bound (Akamai edge auth type)
- Browser fetch → 200/206 OK (matches IP)
- curl fetch (different IP) → **403 Access Denied**
- Expiry: ~24 hours
- IP binding is the key blocker for zero-egress

### 6. The X-Api-Key Encryption

The stream API requires an X-Api-Key that's dynamically generated:
```javascript
// From SPA chunk:
async getEncryptedApiKey() {
  let J = await this.getApiKey();  // get static key
  return tn.encrypt(J);             // encrypt with tn (some cipher)
}
```

The encryption uses a runtime function `tn.encrypt()` — the static key is encrypted
per-session, making it impossible to hardcode for our API. We'd need to either:
1. Run vidio's JS in a headless browser (Puppeteer) to generate the key
2. Reverse-engineer `tn.encrypt()` (complex)

---

## Test Results

### Test 1: Master m3u8 via curl (different IP than browser)
```
GET https://token-v2-media-001-vidio-com.akamaized.net/.../preview_master-6313de.m3u8?hdnts=...
→ HTTP/2 200
→ size: 1060 bytes
→ content-type: application/x-mpegURL
✓ Works! (hdnts NOT IP-bound)
```

### Test 2: Child m3u8 via curl
```
GET .../med/hdntl=exp=...~hmac=.../preview_playlist-med-6313de.m3u8
→ HTTP/2 200
→ size: 6072 bytes
✓ Works! (hdntl here is also not IP-bound for m3u8)
```

### Test 3: Segment (.m4s) via curl
```
GET .../med/hdntl=exp=...~hmac=.../preview_playlist-med-6313de.m4s
→ HTTP/2 403 Access Denied
✗ BLOCKED! (hdntl IS IP-bound for segment files)
```

### Test 4: Stream API directly
```
GET https://api.vidio.com/api/stream/v1/video_data/{video_id}
→ Without X-Api-Key: 401 "Unauthorized application"
→ With X-Api-Key from network log: 403 (Akamai blocks non-browser UA)
→ From browser context: 200 OK (returns play_url)
```

### Test 5: Cross-origin page fetch
```
fetch('https://www.vidio.com/watch/X') from nobar-stream
→ "Failed to fetch"
✗ Page has NO CORS headers
```

### Test 6: Iframe embed
```
<iframe src="https://www.vidio.com/watch/X">
→ Loads successfully (no X-Frame-Options)
→ vidio SPA plays video inside iframe (hdntl bound to browser IP — works in iframe context)
→ Cross-origin iframe access blocked (can't read playUrl)
→ vidio sends postMessage("get") to parent — limited communication
```

---

## Why Zero-Egress is Impossible

### The Akamai hdntl Anti-Leech

Vidio uses Akamai's edge authentication with `hdntl` parameter that's IP-bound:
- The m3u8 URL (with `hdnts`) is NOT IP-bound → curl works
- The segment URL (with `hdntl`) IS IP-bound → curl fails, only browser IP works
- Browser can fetch segments ONLY IF the IP that fetched the m3u8 matches the segment-requesting IP

### The Auth Chain

```
1. Browser loads www.vidio.com/watch/{id}
   ↓ sets luws cookie (UUID-based session ID)
2. Browser calls api.vidio.com/api/stream/v1/video_data/{id}
   ↓ requires X-Api-Key (encrypted), luws, X-Secure-Level headers
   ↓ returns hls_url + dash_url with hdnts auth (NOT IP-bound)
3. Browser fetches master m3u8 (hdnts auth works for any IP)
   ↓ returns child playlists with hdntl (IP-bound)
4. Browser fetches segments (.m4s) — hdntl IP-bound to browser IP
   ✓ Works because browser IP = m3u8-fetching IP
   ✗ Fails from server (different IP) → must proxy → NOT zero-egress
```

### Comparison with Other Providers

```
mzfi:        Referer anti-leech (browser can't fake Referer)
bilibili:    IP-bound URLs (curl can't use browser's URLs)
vidio:       IP-bound hdntl for segments + encrypted X-Api-Key for API
vidlink MP4: UA anti-bot (browser always sends UA)
```

All four use a different mechanism, but the result is the same: **browser-direct
zero-egress is impossible** without server-side proxy.

---

## Implementation Options

### Option A: Iframe Embed (ZERO-EGRESS, shows vidio UI) — RECOMMENDED
```
<iframe src="https://www.vidio.com/watch/{video_id}-{slug}">
```
- **Cost:** FREE (zero Vercel egress)
- **UX:** Shows vidio's own player + ads + UI (Indonesian content focus)
- **Caveat:** Vidio is geo-restricted to Indonesia (and some SE Asia)
- **Effort:** Add vidio as embedUrl source
- **Status:** Same approach as existing vidsrc.me embed fallback

### Option B: Server-Side Proxy (NOT zero-egress)
```
Browser → /api/proxy → server fetches vidio page → extracts stream URL
Server → /api/proxy → server proxies segments (hdntl bound to server IP)
```
- **Cost:** ~4GB Vercel egress per 2hr movie
- **UX:** Keeps Nobar UI but shows vidio content
- **Effort:** Very high (need to generate X-Api-Key + handle hdntl refresh)
- **Status:** Not recommended

### Option C: Browser-Direct Zero-Egress — IMPOSSIBLE
- Browser can't fetch vidio page cross-origin (no CORS)
- Browser can't call stream API (encrypted X-Api-Key)
- Server-fetched URLs are IP-bound to server, not browser

---

## Content Catalog

Vidio.com is Indonesia's largest streaming service:
- **Indonesian FTV** (free, ad-supported, SCTV/RCTI soap operas)
- **Original Series** (premium, requires subscription)
- **Live Sports** (Liga 1 Indonesia, BRI Super League)
- **Western Movies** (Spider-Man: Brand New Day, etc. — mostly PREMIUM)
- **Anime** (limited, mostly premium)

### Geo-Restriction
Vidio is **geo-restricted to Indonesia** (and some SE Asia regions). Users outside
Indonesia get a "content not available in your region" message. This is a major
limitation for Nobar's global audience.

### Catalog Discovery API
```
https://api.vidio.com/categories/{cat_id}    — list categories
https://api.vidio.com/search/trending         — trending searches
https://api.vidio.com/fluid_watch/video/{id}  — recommended videos
https://api.vidio.com/content_profiles/{id}/similars — similar content
```

These are public (200 OK with no auth) but CORS-locked to vidio.com origin.

---

## Recommendation

**SKIP vidio.com integration.** Reasons:
1. **NOT zero-egress** (hdntl IP-bound, same as bilibili)
2. **Geo-restricted to Indonesia** (limiting for Nobar's global users)
3. **Premium content requires subscription** (most Western movies)
4. **Free content is Indonesian FTV** (limited appeal to global audience)
5. **X-Api-Key encryption is complex** (need headless browser to generate)

If we want Indonesian content for the Indonesian audience specifically:
- Use iframe embed fallback (zero-egress, shows vidio UI)
- Same approach as vidsrc.me embed

But this has LOW PRIORITY because:
- Nobar's existing providers (mzfi, vidlink) already have huge catalogs
- Vidio's geo-restriction blocks most global users
- The free content (Indonesian FTV) overlaps with what's already on mzfi

---

## Test Artifacts

- `/tmp/vidio-home.html` — vidio homepage (158KB)
- `/tmp/vidio-watch.html` — Spider-Man watch page (162KB)
- `/tmp/vidio-chunks/` — 20 SPA JS chunks (downloaded)
- `/tmp/vidio-master.txt` — master m3u8 (1060 bytes, 3 quality variants)
- `/tmp/vidio-child.txt` — child m3u8 (6072 bytes, segment list)
- `/home/z/vidlink-re-v2/vidio-iframe.png` — iframe embed screenshot

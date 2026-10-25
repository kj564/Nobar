# Bilibili.tv Reverse Engineering Report

**Date:** Oct 25, 2026  
**Status:** ✅ COMPLETE — Architecture fully mapped, zero-egress feasibility assessed  
**Question:** Can bilibili.tv be a zero-egress provider for Nobar?

---

## TL;DR Answer

**NO, bilibili.tv CANNOT be zero-egress** (same as mzfi). The segment CDN
(`bilivideo.com`) IS CORS-open, but:
1. The signed segment URLs are **IP-bound** (work only for the IP that fetched the page)
2. The video page HTML has **NO CORS headers** (browser can't fetch it cross-origin)
3. There is **NO public playurl API** (playUrl data is embedded in SSR HTML server-side)
4. The page **CAN be iframed** (no X-Frame-Options) but no postMessage API to extract playUrl

**Conclusion:** Bilibili can only be used as an **iframe embed fallback** (same as vidsrc.me)
or via **server-side proxy** (NOT zero-egress). NOT a browser-direct zero-egress path.

---

## Executive Summary

Bilibili.tv (the international version of Bilibili) was reverse-engineered to assess
its viability as a zero-egress provider for Nobar. Key findings:

### What Works ✅
- Bilibili.tv is alive and serves free content (UGC + OGV series/anime)
- The segment CDN (`upos-sz-mirrorcosbstar1.bilivideo.com`) is CORS-open
  (`ACAO: <reflects origin>`, `ACAH: Range`, `ACAM: GET,OPTIONS,HEAD`)
- Segments are DASH `.m4s` files with Range support (206 Partial Content)
- The video page has NO X-Frame-Options → CAN be iframe-embedded

### What Blocks Zero-Egress ❌
1. **Segment URLs are IP-bound** — only the IP that fetched the video page can use them
   - Browser test: 206 OK (fresh URL, same IP that loaded the page)
   - curl test (different IP, same URL): 403 Forbidden
2. **Video page HTML has NO CORS headers** — browser can't fetch it cross-origin
   - `fetch('https://www.bilibili.tv/video/X')` from nobar-stream → "Failed to fetch"
3. **NO public playurl API endpoint** — playUrl response is embedded in SSR HTML
   - Tested `/intl/gateway/web/v2/ugc/playurl` → 404
   - Tested with cid, fnval, qn params → 404
   - The playUrl data is rendered server-side and shipped in `window.__initialState`
4. **No postMessage API** — iframe can't expose playUrl to parent
   - Cross-origin iframe access is browser-blocked
   - Bilibili doesn't postMessage the playUrl

---

## Complete Architecture

### 1. Page Structure

```
GET https://www.bilibili.tv/video/{aid}
  → HTML with inline <script>window.__initialState=(function(...){...})(...)</script>
  → __initialState contains:
      player.playUrl._rawValue.dash.audio[].base_url
      player.playUrl._rawValue.dash.audio[].backup_url[]
      player.playUrl._rawValue.dash.video[].base_url
      player.playUrl._rawValue.dash.video[].backup_url[]
```

### 2. CDN Domains

| Domain | Status | CORS | Notes |
|---|---|---|---|
| `upos-sz-mirrorcosbstar1.bilivideo.com` | ✅ Works (206) | ✅ ACAO reflects origin | Primary CDN (Bilibili's own) |
| `upos-bstar1-mirrorakam.akamaized.net` | ❌ 403 | ✅ ACAO reflects origin | Akamai mirror (hdnts required, blocked) |
| `api.bilibili.tv` | ✅ 200 | ✅ CORS-open | API gateway (but no playurl endpoint) |
| `www.bilibili.tv` | ✅ 200 | ❌ NO CORS | Video page (SSR with playUrl) |

### 3. URL Auth Parameters

Segment URLs have these query params:
```
?e=<encrypted_params>
&gen=playurlv3
&oi=<order_id>           # IP-bound identifier
&mid=0                   # Member ID (0=guest)
&platform=pc
&uipk=5                  # User IP key
&trid=<transaction_id>   # Unique per session, IP-bound
&deadline=<unix_ts>      # Expiry timestamp
&upsig=<md5_hex>         # URL signature
&uparams=<param_list>    # List of signed params
&bvc=vod
&orderid=0,2             # Backup order
&logo=00000000
&f=i_0_0
```

### 4. Anti-Leech Analysis

The `oi` parameter is "origin IP" hash — bilibili's server generates a unique
signed URL bound to the requesting IP. When a different IP attempts to use
the URL, the signature check fails → 403.

**Verification:**
- Browser fetches page → gets URL bound to browser IP
- Browser fetches segment → 206 OK (same IP)
- curl fetches same segment URL → 403 (different IP)
- Server fetches page → gets URL bound to SERVER IP
- Server-side URLs WON'T work for browser (different IP)

### 5. SSR Data Structure

`window.__initialState` (30,911 chars) contains:
- `player.playUrl._rawValue.dash.audio[]` — audio tracks
- `player.playUrl._rawValue.dash.video[]` — video representations
- Each has `base_url` (akamai, returns 403) + `backup_url[]` (bilivideo, works)
- `dash.duration` — video duration in seconds
- `dash.min_buffer_time` — DASH buffer requirement

The `__initialState` is encoded via an IIFE with array obfuscation (`Q[0]="url", Q[1]=...`).

---

## Test Results

### Test 1: Browser fetches segment (FRESH URL, same IP)
```
fetch(bilivideoUrl, { headers: { Range: 'bytes=0-1023' } })
→ status: 206
→ contentLength: 1024
→ contentRange: bytes 0-1023/11239900
→ contentType: video/mp4
✓ WORKS (browser IP matches URL's bound IP)
```

### Test 2: curl fetches same URL (different IP)
```
curl -H "Origin: nobar-stream" -H "Range: bytes=0-1023" "$bilivideoUrl"
→ HTTP/2 403
→ access-control-allow-origin: https://nobar-stream.vercel.app
→ access-control-expose-headers: Content-Length,Content-Range
→ content-type: video/mp4
✗ BLOCKED (curl IP ≠ URL's bound IP)
```

### Test 3: Cross-origin page fetch (browser)
```
fetch('https://www.bilibili.tv/video/X', { credentials: 'omit' })
→ "Failed to fetch"
✗ BLOCKED (page has no CORS headers)
```

### Test 4: Iframe embed
```
<iframe src="https://www.bilibili.tv/video/X">
→ Loads successfully (no X-Frame-Options)
→ Bilibili SPA plays video inside iframe
→ Cross-origin access BLOCKED (can't read playUrl from iframe)
→ No postMessage from bilibili
```

### Test 5: Playurl API endpoint
```
GET /intl/gateway/web/v2/ugc/playurl?aid=X&cid=Y&platform=web
→ HTTP/2 404 (endpoint doesn't exist publicly)

GET /intl/gateway/web/v2/ugc/playlist?aid=X  (this works in browser)
→ 200 OK in browser (with cookies)
→ 403 Forbidden via curl (needs buvid3 cookie)
```

---

## Comparison with Other Providers

| Provider | CDN CORS | URL IP-bound | Page CORS | Zero-egress? |
|---|---|---|---|---|
| **vidlink.pro HLS (sacdn)** | ✅ ACAO:* | ❌ No | N/A (API only) | ✅ **YES** |
| **bilibili.tv (bilivideo.com)** | ✅ ACAO: reflects | ✅ **YES (blocks)** | ❌ No | ❌ **NO** |
| **mzfi.me (sbcdnw)** | ✅ ACAO:* (with Referer) | ❌ No | N/A | ❌ NO (Referer anti-leech) |
| **vidlink.pro MP4 (bcdn)** | ✅ ACAO:* | ❌ No | N/A | ❌ NO (UA anti-bot) |

Bilibili is UNIQUE in that it IP-binds URLs. This is a different anti-leech mechanism
than mzfi (Referer) or vidlink MP4 (UA) — but equally effective at blocking zero-egress.

---

## Implementation Options for Bilibili

### Option A: Iframe Embed (ZERO-EGRESS, loses UI) — RECOMMENDED
```
<iframe src="https://www.bilibili.tv/video/{aid}">
```
- **Cost:** FREE (zero Vercel egress — bilibili serves everything)
- **UX:** Shows bilibili's own player + UI (ads, comments, recommendations)
- **Effort:** Add bilibili as embedUrl source in /api/stream/[id]/route.ts
- **Status:** Same approach as existing vidsrc.me embed fallback

### Option B: Server-Side Proxy (NOT zero-egress)
```
Browser → /api/proxy?url=bilibili_page → server fetches → returns HTML
Browser parses __initialState → extracts segment URLs
Browser → /api/proxy?url=bilivideo_segment → server proxies segments
```
- **Cost:** ~4GB Vercel egress per 2hr movie (segment URLs are IP-bound to server)
- **UX:** Keeps Nobar UI but shows bilibili content
- **Effort:** High (HTML parsing + segment proxying)
- **Status:** Not recommended (defeats the purpose — same egress as mzfi)

### Option C: NOT VIABLE — Browser-Direct Zero-Egress
```
Browser → fetch bilibili page (BLOCKED, no CORS)
Browser → fetch playurl API (BLOCKED, no public endpoint)
```
- **Cost:** N/A
- **Status:** IMPOSSIBLE — bilibili's anti-leech design prevents this

---

## Content Catalog

Bilibili.tv has:
- **UGC content** (user-generated videos, like YouTube)
- **OGV content** (official series/anime — One Piece, Chinese dramas, etc.)
- **Some Western content** (limited — mostly Asian content)

### Catalog Discovery
- Browse pages: `https://www.bilibili.tv/popular/all`
- Search: `https://www.bilibili.tv/search?keyword=X`
- Series: `https://www.bilibili.tv/play/{seasonId}/{epId}`
- Video: `https://www.bilibili.tv/video/{aid}`

### TMDB Mapping
Bilibili uses its OWN `aid` (avid) and `season_id` — NOT TMDB IDs.
To use bilibili as a provider, we'd need a title→aid lookup (similar to mzfi's
title→subjectId search).

API endpoint for search: `https://api.bilibili.tv/intl/gateway/web/v2/search?keyword=X`
(Requires buvid3 cookie — same auth as mzfi's token pattern)

---

## Recommendation

**Bilibili is NOT a zero-egress path** — same situation as mzfi.

If we want to add bilibili as a CONTENT SOURCE (not zero-egress):
1. Add `/api/bilibili/search?q={title}` endpoint that calls bilibili's search API
2. Add bilibili as an `embedUrl` source in `/api/stream/[id]/route.ts`
3. Use iframe embed when other providers fail

**But this has LOW VALUE for Nobar because:**
- Bilibili's catalog is mostly Asian content (anime, Chinese dramas)
- mzfi already has a huge catalog including anime
- vidlink.pro already covers movies + TV
- The iframe embed shows bilibili's UI (ads, comments)

**Recommendation:** SKIP bilibili integration. Focus on:
1. Cloudflare Worker for mzfi (eliminates 90% of remaining egress)
2. Catalog discovery via mzfi trending endpoint (already implemented)

---

## Test Artifacts

- `/tmp/bili-home.html` — bilibili homepage (24KB)
- `/tmp/bili-vid.html` — bilibili video page (82KB)
- `/tmp/bili-page-fresh.html` — bilibili video page via curl (84KB, has __initialState)
- `/tmp/bili-player.js` — biliintl-player bundle (673KB)
- `/tmp/bili-dash.js` — dash-player bundle (485KB)
- `/tmp/bili-ogv.js` — ogv-player bundle (21KB)
- `/tmp/bili-vendor.js` — vendor bundle (810KB)
- `/home/z/vidlink-re-v2/bili-iframe.png` — screenshot of iframe test

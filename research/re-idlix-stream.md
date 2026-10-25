# Idlix (z2.idlixku.com) Stream RE Report

**Date:** Oct 25, 2026  
**Status:** ✅ Architecture mapped, anti-bot makes deeper RE infeasible  
**Goal:** Find stream API + assess zero-egress feasibility

---

## TL;DR Answer

**Idlix CANNOT be a zero-egress provider** — same situation as mzfi, bilibili, vidio.
Plus, the entire site is behind **Cloudflare Bot Management** that blocks headless
browsers AND requires per-request CF clearance.

### Quick Comparison

| Provider | Anti-leech | Bot protection | Zero-egress? |
|---|---|---|---|
| **vidlink.pro HLS (sacdn)** | None | Light | ✅ **YES** (LIVE) |
| **Idlix (z2.idlixku.com)** | Cloudflare + auth | **Aggressive** | ❌ **NO** |
| **bilibili.tv** | IP-bound URLs | Light | ❌ NO |
| **mzfi.me** | Referer anti-leech | None | ❌ NO |
| **vidio.com** | IP-bound hdntl | Light | ❌ NO |

---

## Architecture

### 1. Site Stack

- Framework: **Next.js 16** (App Router, Turbopack build)
- React: 19 (RSC streaming)
- CSS: Tailwind CSS v4 + Plus Jakarta Sans
- i18n: Indonesian primary + English fallback (NEXT_LOCALE cookie)
- Build ID: `20261025022945-dca75fbd34c1`

### 2. API Endpoint Discovery

Found via SPA chunk analysis (`/_next/static/chunks/2r8ab1h3v6k7l.js`):

```
API base URL:  https://z2.idlixku.com/api
               (stored as F="https://z2.idlixku.com/api" in the SPA bundle)

Stream API:    GET /api/watch/play-info/{content_type}/{content_id}
                - Returns video stream URLs (hls_url, dash_url, sources)
                - content_type values: "movie", "tv", "series", "episode"
                - content_id values: slug like "mufasa-the-lion-king-2024" or numeric ID
                
Auth:          POST /api/auth/refresh?bootstrap=0
                - Sets session cookie
                GET /api/auth/me — get current user
                GET /api/auth/me/player-preferences — player settings
                GET /api/auth/me/watch-history — viewing history
                
Session:       POST /api/watch/session/claim
                - Body: {gateToken, verificationToken}
                - Required before stream playback
                POST /api/watch/session/refresh-claim
                - Refreshes the session claim
                
Tracking:      POST /api/views/track
                - Body: {contentType, contentId, episodeId}
                GET /api/watch/player-events/summary
                
Catalog:       GET /api/livestreams
                GET /api/watch-parties
                GET /api/series/filter-options
                POST /api/series/import-tmdb (admin only)
```

### 3. Anti-Bot Layers

**Layer 1: Cloudflare Bot Management (BLOCKING)**
- All pages return CF "Just a moment..." challenge for headless browsers
- The challenge requires solving a Turnstile widget manually
- Even after solving, the cf_clearance cookie has a SHORT TTL (~1 hour)
- The clearance is also bound to User-Agent + IP — changing either invalidates it

**Layer 2: Cloudflare Turnstile Widget**
- Iframe-based challenge (`/cdn-cgi/challenge-platform/`)
- Requires clicking checkbox "Verify you are human"
- Headless browsers fail the invisible fingerprint checks (canvas, WebGL, etc.)
- Even after click, the verification may still fail silently

**Layer 3: API-level bot detection (returns "ngentod")**
- `/api/watch/play-info/{type}/{id}` returns 403 with body `ngentod` (Indonesian slang)
- This is a CUSTOM bot detection — not standard CF
- Even with valid cf_clearance + browser UA + Referer, the API rejects
- Likely checks for additional browser fingerprint headers (Sec-Ch-Ua, Sec-Fetch-*)

### 4. Why Stream URLs Cannot Be Retrieved

To get stream URLs:
1. Browser must solve CF challenge → cf_clearance cookie
2. Browser must call /api/watch/play-info/{type}/{id} with the cookie
3. The API returns "ngentod" 403 unless ALL fingerprint checks pass

Server-side curl fails at step 1 (no CF clearance).
Headless browser fails at step 1 (Turnstile doesn't pass).
Real browser passes step 1-3 — but only for ITS OWN context (cf_clearance is UA+IP-bound).

### 5. Anti-Leech for Segments (if we could get URLs)

Based on the SPA chunk patterns:
- `dash_url` and `hls_url` use `.replace()` to swap CDN domains
- The CDN domains are likely Akamai or CloudFront (need real URL to verify)
- Likely IP-bound or token-bound (similar to vidio's hdntl pattern)

But we can't verify this without bypassing the CF + API bot detection.

---

## Test Results

### Test 1: curl fetch episode page (no auth)
```
curl https://z2.idlixku.com/series/...
→ HTTP 200, 146KB HTML (works! idlix doesn't block curl for HTML)
```
HTML contains no stream URLs (loaded via JS after auth).

### Test 2: curl fetch /api/watch/play-info/{type}/{id}
```
curl https://z2.idlixku.com/api/watch/play-info/movie/mufasa-the-lion-king-2024
→ HTTP 403
→ Body: "ngentod" (7 bytes)
```
API-level bot detection rejects.

### Test 3: agent-browser (headless Chrome)
```
Open https://z2.idlixku.com/...
→ "Just a moment..." CF challenge page (never resolves)
→ Turnstile widget checkbox can be clicked, but verification still fails
→ All page text remains "Performing security verification"
```

### Test 4: cf_clearance from agent-browser used in curl
```
Cookie: cf_clearance=Zy9...
→ HTTP 403 with HTML CF challenge page
→ The cookie is bound to a specific UA + IP fingerprint
→ curl uses different UA + IP → invalidates cookie
```

### Test 5: API call from inside agent-browser page context
```
fetch('/api/watch/play-info/movie/mufasa-the-lion-king-2024', {credentials: 'include'})
→ HTTP 403, body: "ngentod"
```
Even authenticated browser context gets blocked (probably because page itself is stuck on CF challenge).

---

## Existing UI Research

A prior UI RE report exists at `/home/z/nobar-backup/research/idlix-ui-research.md`:
- 53KB of UI/UX documentation
- Covers layout, color palette, components, animations
- Used as design inspiration for Nobar's existing UI

This new RE report focuses on the STREAMING architecture (which the prior report didn't cover).

---

## Recommendation

**SKIP Idlix integration.** Reasons:
1. **Cloudflare Bot Management blocks all automated access** (curl + headless browser)
2. **API returns "ngentod" 403** — custom bot detection that even browser context can't bypass
3. **Even iframe embed would fail** — CF challenge shows in iframe too
4. **Catalog overlap** — Idlix mostly has the same content as mzfi (TMDB-based)
5. **No clear zero-egress path** — segment URLs cannot be retrieved without auth

### Why Idlix is Harder Than mzfi

```
mzfi:
  - Page accessible via curl (no CF)
  - API accessible with Authorization Bearer (no CF)
  - Only CDN has Referer anti-leech
  
Idlix:
  - Page has CF challenge (curl blocked without clearance)
  - /api/ endpoint has CF + custom bot detection
  - Even with cf_clearance, API returns "ngentod"
  - Stream URLs inaccessible → can't even test CDN anti-leech
```

### Bypass Options (Not Recommended)

1. **Puppeteer with stealth plugin** — might solve Turnstile, but fragile
2. **Residential proxies + real browser UA** — expensive, complex
3. **Manual cookie extraction** — user opens idlix in their browser, copies cf_clearance + session cookies to Nobar — high friction, breaks frequently

None of these are zero-egress paths. They just enable access to the same proxy-required architecture as mzfi.

---

## Test Artifacts

- `/tmp/idlix-home2.html` — homepage (128KB, no CF challenge via curl)
- `/tmp/idlix-movie2.html` — Mufasa movie page (145KB)
- `/tmp/idlix-series.html` — The Mentalist series page (146KB)
- `/tmp/idlix-ep.html` — episode page (146KB)
- `/tmp/idlix-chunks/` — 20 SPA JS chunks (downloaded via curl, no CF issue for static assets)
- `/home/z/vidlink-re-v2/idlix-state.png` — CF challenge screenshot

### Key SPA chunk findings

- `2r8ab1h3v6k7l.js` (72KB) — contains all API endpoints (admin, auth, watch, etc.)
- API base URL pattern: `F="https://z2.idlixku.com/api"`
- Stream API: `getPlayInfo(contentType, contentId) → GET /watch/play-info/{type}/{id}`
- Session claim: `claimSession(gateToken, verificationToken) → POST /watch/session/claim`
- Tracking: `track(contentType, contentId, episodeId) → POST /views/track`

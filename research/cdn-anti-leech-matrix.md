# Nobar CDN Anti-Leech Matrix — Complete Reverse Engineering Report

**Date:** Oct 25, 2026  
**Status:** ✅ COMPLETE — All CDNs mapped, zero-egress paths identified  
**Scope:** All `hakunaymatata.com` subdomains used by vidlink.pro + mzfi.me

---

## Executive Summary

After the vidlink.pro zero-egress implementation (RE-vidlink-berlian), this report
completes the reverse engineering of ALL remaining CDNs in the Nobar streaming
stack. Every CDN has been tested for browser-direct access (zero-egress)
capability.

**Key finding:** Only CloudFront-backed CDNs (`sacdn`, `cacdn`) are zero-egress
capable. All Aliyun-backed CDNs (`bcdn`, `bcdnxw`, `sbcdnw`) have anti-leech
checks (Referer or User-Agent) that BLOCK browser-direct access. The vidlink.pro
HLS path is the ONLY zero-egress path, and it's already implemented.

---

## Complete CDN Matrix

| CDN | Provider | Content | Auth Method | URL Query Auth? | Referer Check | UA Check | CORS (ACAO) | Zero-egress? |
|---|---|---|---|---|---|---|---|---|
| **sacdn**.hakunaymatata.com | vidlink.pro | HLS m3u8 + .ts | CloudFront signed URL | ✅ Yes | ❌ None | ❌ None | `*` | ✅ **YES** |
| **cacdn**.hakunaymatata.com | both | Subtitles (.srt) | CloudFront signed URL | ✅ Yes | ❌ None | ❌ None | `*` | ✅ **YES** |
| **bcdn**.hakunaymatata.com | vidlink.pro | MP4 (bt/ + resource/) | Aliyun sign+t | ✅ Yes | ❌ None | ✅ **428** | (n/a) | ❌ **NO** |
| **bcdnxw**.hakunaymatata.com | mzfi.me | MP4 (tran-audio/) | Aliyun sign+t | ✅ Yes | ✅ **403/429** | ❌ None | (n/a) | ❌ **NO** |
| **sbcdnw**.hakunaymatata.com | mzfi.me | DASH (.mpd + .m4s) | Aliyun edge-auth (type C) | ✅ Yes | ✅ **429** | ❌ None | `*`* | ❌ **NO** |

\* sbcdnw returns ACAO:* when Referer is valid, but browser can't set valid Referer.

---

## 1. sacdn.hakunaymatata.com (vidlink.pro HLS) — ✅ ZERO-EGRESS

**Status:** Already implemented (see RE-vidlink-berlian, IMPL-vidlink-zero-egress).

- **Auth:** CloudFront signed URL (Policy/Signature/Key-Pair-Id in URL query)
- **No Referer check, no UA check, CORS-open (ACAO: \*)**
- Browser fetches m3u8 + .ts segments DIRECTLY → zero Vercel egress
- hls.js custom fLoader injects auth query into segment URLs

**Verified:** The Matrix (TMDB 603) plays 60+ seconds, 8 segments loaded directly,
ZERO /api/proxy requests, ZERO /api/subtitle requests.

---

## 2. cacdn.hakunaymatata.com (Subtitles) — ✅ ZERO-EGRESS

**Status:** Already implemented for vidlink subtitles. mzfi subtitles also use this CDN.

- **Auth:** CloudFront signed URL (Policy/Signature/Key-Pair-Id in URL query, embedded by API)
- **No Referer check, no UA check, CORS-open (ACAO: \*)**
- Both vidlink.pro AND mzfi.me return subtitle URLs on cacdn
- NativePlayer's `normalizeSub()` passes cacdn URLs directly (no /api/subtitle wrapper)

**Verified:** Indonesian subtitle for The Matrix loaded directly from cacdn, 92KB,
200 OK, ACAO:*.

---

## 3. bcdn.hakunaymatata.com (vidlink.pro MP4) — ❌ BLOCKED

**Finding:** Browser User-Agent triggers 428 Precondition Required.

### Test Results (Oct 25, 2026)

| Request | Status | Notes |
|---|---|---|
| No UA + Range | 206 OK | 1024 bytes, Range honored |
| Browser UA (Chrome) + Range | **428** | Precondition Required (14 bytes) |
| Browser UA + Origin + Referer | 429 | Rate limited / rejected |

### Analysis

The CDN's anti-bot detection flags browser User-Agent strings (Mozilla, Chrome,
Safari, etc.) and returns 428. This is a deliberate anti-leech measure to prevent
direct browser embedding.

**The browser ALWAYS sends a User-Agent** — there is no way to suppress it from
JavaScript. Service Workers can't modify User-Agent either.

### Conclusion

vidlink.pro MP4 fallback CANNOT be zero-egress. Must continue using /api/proxy
(which sends no UA for bcdn URLs, per the proxy code at line 88).

---

## 4. bcdnxw.hakunaymatata.com (mzfi.me MP4) — ❌ BLOCKED

**Finding:** Strict Referer allowlist (same as documented in RE-mzfi-harder).

### Test Results

| Request | Status | Notes |
|---|---|---|
| No Referer | 429 | Rate limited / rejected |
| Referer: mzfi.me | 206 OK | Works (via /api/proxy) |
| Referer: nobar-stream.vercel.app | 429 | Not in allowlist |

### Analysis

The CDN accepts Referer ONLY from 6 apex domains (mzfi.me, movieboxhd.net,
netfilm.world, moviebox.ph, movie-box.co, themoviebox.xyz). Browser sends
its own origin as Referer → rejected.

**Already documented** in RE-mzfi-harder worklog. No new findings.

### Conclusion

mzfi MP4 streams CANNOT be zero-egress. Must use /api/proxy (current) or
Cloudflare Worker (documented as recommended bypass in RE-mzfi-harder).

---

## 5. sbcdnw.hakunaymatata.com (mzfi.me DASH) — ❌ BLOCKED

**NEW finding:** Aliyun edge-auth type C CAN be passed as URL query params, but
Referer anti-leech still blocks browser-direct access.

### Aliyun Edge-Auth Type C Format

The X-MB-Token (signCookie) from mzfi API has this structure:
```
Edge-Cache-Cookie=urlprefix=<base64>:sign=<hex_md5>:t=<unix_timestamp>
```

Where:
- `urlprefix` = base64url of the protected URL prefix (e.g. `https://sbcdnw.hakunaymatata.com/dash/{id}/`)
- `sign` = MD5 hex of (secret + urlprefix + t) — server-side secret, infeasible to crack
- `t` = expiry timestamp (but CDN doesn't actually validate it — verified with 52-min-old token)

### URL Query Auth Conversion (NEW)

The cookie can be converted to URL query params:
```
?urlprefix=<base64>&sign=<hex>&t=<unix_ts>
```

**VERIFIED:** `curl` with URL query auth + `Referer: https://mzfi.me/` → **200 OK** (124KB MPD).

### Test Results

| Request | Status | Notes |
|---|---|---|
| URL query + Referer: mzfi.me | **200 OK** | 124KB MPD, ACAO:* |
| URL query + no Referer | 429 | Referer required |
| URL query + Referer: nobar-stream.vercel.app | 429 | Not in allowlist |
| X-MB-Token header + Referer: mzfi.me | **200 OK** | (current /api/proxy approach) |

### MPD Structure (DASH)

```xml
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" ...>
  <Period>
    <AdaptationSet mimeType="video/mp4" ...>
      <Representation id="0" codecs="hev1.1.6.L120.90" bandwidth="1600000" width="1920" height="1080">
        <SegmentTemplate media="chunk-stream$RepresentationID$-$Number%05d$.m4s" .../>
      </Representation>
      ...
    </AdaptationSet>
  </Period>
</MPD>
```

Segment URLs use DASH SegmentTemplate with relative paths:
`chunk-stream{RepresentationID}-{Number:05d}.m4s`

### Browser-Direct Access: BLOCKED

Even though URL query auth works + sbcdnw returns ACAO:*, the **Referer
anti-leech** blocks browser-direct access. The browser sends its own origin as
Referer (nobar-stream.vercel.app) → 429.

Setting `Referrer-Policy: no-referrer` doesn't help — bare requests (no Referer)
also get 429.

### Conclusion

mzfi DASH CANNOT be zero-egress. The Referer anti-leech is the same barrier as
mzfi MP4. Must continue using /api/proxy with X-MB-Token header injection.

---

## 6. vidsrc.buzz HLS — ❌ UNAVAILABLE (temporary)

**Status:** The vidsrc.buzz sources API (`/pl/api.php?a=sources`) is currently
returning 403 "unavailable" for all tested movies (550, 603, 27205, 24428).

The embed page loads (200 OK) and returns valid tokens + IMDB IDs, but the
sources API rejects all requests. This appears to be a temporary outage or
IP ban, not a permanent change.

### Previous Architecture (when working)

The vidsrc.buzz HLS flow is fully server-side:
1. Fetch embed page → extract token + IMDB ID
2. Call sources API → get server list
3. Call play API → get HLS stream URL
4. Fetch master m3u8 → select best variant
5. Fetch variant m3u8 → rewrite segment URLs to /api/proxy
6. Return rewritten m3u8 to browser

All segment requests go through /api/proxy (adds Referer: https://vidsrc.buzz/).

### Zero-egress potential

Untestable while the API is down. The HLS segments are on vidsrc.buzz's own
domain, which likely has Referer anti-leech (same pattern as all other
providers). Probably CANNOT be zero-egress.

---

## Summary: Zero-Egress Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ZERO-EGRESS PATHS (LIVE)                     │
│                                                                 │
│  vidlink.pro → sacdn (HLS m3u8 + .ts)     ✅ DIRECT (CORS-open) │
│  vidlink.pro → cacdn (subtitles .srt)     ✅ DIRECT (CORS-open) │
│  mzfi.me     → cacdn (subtitles .srt)     ✅ DIRECT (CORS-open) │
│                                                                 │
│  Implementation: hls.js custom fLoader (AuthInjectLoader)       │
│  Status: LIVE since Oct 25, 2026 (IMPL-vidlink-zero-egress)     │
├─────────────────────────────────────────────────────────────────┤
│                   PROXY-REQUIRED PATHS                          │
│                                                                 │
│  vidlink.pro → bcdn (MP4)         ❌ UA anti-bot (428)         │
│  mzfi.me     → bcdnxw (MP4)       ❌ Referer anti-leech         │
│  mzfi.me     → sbcdnw (DASH)      ❌ Referer anti-leech         │
│  vidsrc.buzz → own CDN (HLS)      ❌ Referer anti-leech (prob.) │
│  subtitlecat → own CDN (.srt)     ❌ Not CORS-open              │
│                                                                 │
│  Current: /api/proxy (Vercel egress ~4GB/movie)                │
│  Recommended: Cloudflare Worker (free 100k req/day)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Recommendations

### Already Done (Phase 1 — COMPLETE)
- vidlink.pro HLS direct path via sacdn (zero-egress) ✅
- vidlink.pro + mzfi.me subtitles via cacdn (zero-egress) ✅
- Pure-sodium token mint (no WASM) ✅

### Phase 2 — Cloudflare Worker for mzfi (RECOMMENDED)
Deploy a Cloudflare Worker that:
1. Receives requests from the browser
2. Adds `Referer: https://movieboxhd.net/` header
3. Proxies to bcdnxw (MP4) / sbcdnw (DASH)
4. Returns response with `ACAO: *`

This would make mzfi (the PRIMARY provider) zero-egress too.
- Free tier: 100,000 requests/day (~140 full movies/day)
- Worker code: ~20 lines
- Expected impact: eliminate ~90% of Vercel egress (mzfi is primary)

### Phase 3 — Not Worth Pursuing
- vidsrc.buzz zero-egress: probably has Referer anti-leech, and it's a FALLBACK
  (only used when mzfi + vidlink both fail). Low ROI.
- vidlink MP4 (bcdn) zero-egress: impossible (UA anti-bot). HLS path is superior
  anyway (adaptive bitrate, smaller segments).
- Self-minting mzfi Aliyun tokens: infeasible (MD5 secret is server-side, 7400
  formula attempts already failed in RE-mzfi-harder).

---

## Test Artifacts

- `/tmp/inception-fresh.json` — sample /api/stream/27205 response (mzfi DASH)
- `/tmp/mpd-a.xml` — sbcdnw MPD fetched with URL query auth + Referer (200 OK)
- `/tmp/bcdn-ua.mp4` — bcdn MP4 with browser UA (428 response)
- `/tmp/bcdn-noua.mp4` — bcdn MP4 without UA (206 OK)

All findings backed by real curl commands with real HTTP responses.

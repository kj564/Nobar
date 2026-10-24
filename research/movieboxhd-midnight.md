# movieboxhd.net `/web/midnight` — Reverse Engineering Report

**Task ID:** 1 — RE movieboxhd.net/web/midnight
**Agent:** RE-movieboxhd
**Date:** 2026-10-24
**Status:** COMPLETE

---

## TL;DR (executive summary)

`movieboxhd.net` is the **official SSR/SEO front** (Nuxt) of the **same `wefeed-h5api-bff`** backend that powers `mzfi.me`. The `/web/midnight` route is just a **category page** ("midnight movies" — late-night/adult-skewed category). There is **NO new "midnight" API product** — the path `/wefeed-h5api-bff/...` is identical, tokens are 100% portable across `mzfi.me` and `movieboxhd.net`, search/play/caption responses are byte-identical, and the **same CDN domains** serve the MP4s (`bcdnxw.hakunaymatata.com`).

### Key new findings (vs prior worklog)

1. **DASH streams are returned alongside MP4** (worklog only mentioned MP4). `dash[]` is non-empty for many titles — `https://sbcdnw.hakunaymatata.com/dash/.../index_web.mpd` is a real MPEG-DASH manifest (HEVC adaptive bitrate). Requires `X-MB-Token` header.
2. **`/subject/play` works WITHOUT an Authorization token** — only the SPA Referer is needed.
3. **`/subject/trending` is fully public** — returns catalog without any auth (useful for browsing endpoints).
4. **`/detail?subjectId=&detailPath=` is public** — full movie metadata + hasResource + trailer, no auth.
5. **`/media-player/get-domain` is public** and literally returns `"https://mzfi.me/"` — confirming the official architecture (movieboxhd.net = SSR, mzfi.me = SPA player).
6. **Tokens last 90 days** (`Max-Age=7776000`), much longer than typical short-lived guest tokens.
7. **Anti-bot enforcement is light** — no signed X-Playback-Environment / X-Client-Id headers (unlike vidlink.pro). No Cloudflare. No WASM. No JS challenge.

### Recommendation

**Do NOT add movieboxhd.net as a 2nd stream source** — it is functionally identical to `mzfi.me`. Same BFF, same tokens, same catalog, same CDN. Adding it would just be a 2nd hostname for the same content.

**DO** consider:
- Adopting the **DASH** streams (HLS-equivalent adaptive bitrate) for smoother playback on slow connections.
- Switching to **`h5-api.aoneroom.com`** as the canonical BFF domain (it is the actual production gateway, returned by `__NUXT__.config.public.prod.BASE_URL`).
- Using the **public `/detail` endpoint** to pre-validate `hasResource` before paying for a search call (saves tokens).
- Using the **public `/subject/trending` endpoint** to build a "now trending" row without auth.

---

## Section 1 — BFF discovery: base URL, token mechanism, sample curl

### 1.1 How the page bootstraps

The page is **Nuxt SSR** (Vue, server-side rendered). It does NOT use Next.js. The HTML response (1.25 MB) contains a single inline `<script>` block defining `window.__NUXT__.config={...}` (5.9 KB) — a JS object literal (not JSON, so unquoted keys).

```html
<script>window.__NUXT__={};window.__NUXT__.config={public:{
  development:{ BASE_URL:"https://h5-api-test.aoneroom.com", ... },
  test:        { BASE_URL:"https://h5-api-test.aoneroom.com", ... },
  prod:        { BASE_URL:"https://h5-api.aoneroom.com",
                SERVER_BASE_URL:"http://wefeed-h5api-bff.wefeed-prod",
                VITE_IMG_HOST:"https://h5-static.aoneroom.com",
                VITE_SITE_HOST:"https://h5.aoneroom.com" },
  environment:"prod",
  clientFetch:{ cookieTokenKey:"mb_token", baseUrl:"https://h5-api.aoneroom.com", ... },
  serveFetch: { cookieTokenKey:"mb_token", baseUrl:"http://wefeed-h5api-bff.wefeed-prod" },
  passport:   { peerOrigins:["https://netfilm.world","https://mzfi.me"],
                tokenCookieKey:"mb_auth_token",
                baseUrl:"https://h5-api.aoneroom.com", ... }
}}</script>
```

Key fields extracted from `__NUXT__.config`:
- **Production BFF base URL:** `https://h5-api.aoneroom.com`
- **Internal k8s service name:** `http://wefeed-h5api-bff.wefeed-prod`
- **BFF path prefix:** `/wefeed-h5api-bff/...`
- **Guest token cookie key:** `mb_token` (mzfi.me's old `mb_guest_token` cookie name is also accepted)
- **Auth (logged-in) cookie key:** `mb_auth_token`
- **Static asset CDN:** `https://h5-static.aoneroom.com/ssrStatic/mbOfficial/public/_nuxt/`
- **passport.peerOrigins:** `["https://netfilm.world","https://mzfi.me"]` — confirms movieboxhd.net treats mzfi.me as a peer SPA.

### 1.2 Token mechanism

- **Type:** HS256 JWT (header `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`).
- **Cookie name:** `token` (set with `Path=/; SameSite=Lax; Max-Age=7776000; HttpOnly; Secure`).
- **Also returned in** `x-user` response header: `{"token":"...","userId":"...","userType":0,"appType":3}`.
- **App type:** `atp: 3` (the guest H5/web app, same as mzfi.me).
- **User type:** `userType: 0` (guest).
- **TTL:** `exp - iat = 7776000s = 90 days` (matches `Max-Age`).
- **No signed/encrypted WASM challenge, no Cloudflare JS, no signed token, no nonce, no captcha** — guest tokens are issued freely by `GET /wefeed-h5api-bff/home?page=1`.
- **Tokens are 100% portable across** `mzfi.me` and `movieboxhd.net` (verified live — see §5).

### 1.3 Sample curl to mint a fresh guest token

```bash
# Mint via movieboxhd.net gateway (proxied through istio-envoy):
curl -sS -D - -o /dev/null \
  -H 'Origin: https://movieboxhd.net' \
  -H 'Referer: https://movieboxhd.net/web/midnight' \
  -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'https://movieboxhd.net/wefeed-h5api-bff/home?page=1'
# → set-cookie: token=eyJhbGc...; Max-Age=7776000
# → x-user: {"token":"...","userId":"1344907682516031816","userType":0,"appType":3}

# Or mint via the canonical BFF domain (h5-api.aoneroom.com):
curl -sS -D - -o /dev/null \
  -H 'Origin: https://movieboxhd.net' \
  -H 'Referer: https://movieboxhd.net/web/midnight' \
  -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'https://h5-api.aoneroom.com/wefeed-h5api-bff/home?page=1'
```

### 1.4 Anti-bot headers observed

The Nuxt JS bundle (`https://h5-static.aoneroom.com/ssrStatic/mbOfficial/public/_nuxt/B47XiqZH.js`) references these optional headers — all **opt-in client restrictions** that the WEB APP sends but the BFF does not require:

- `X-Client-Info`
- `X-Client-Token`
- `X-No-High-Risk-Restrict`
- `X-Request-Lang`
- `X-Vip-Restrict` ← **MUST NOT be sent** (this is the existing mzfi.me finding from `nobar-vip-breakthrough` in the worklog — verified to also apply on movieboxhd.net).

No `X-Playback-Environment` (that's vidlink.pro only). No WASM. No signed JWT.

### 1.5 Response headers from the BFF (sample)

```
HTTP/1.1 200 OK
Server: istio-envoy
x-trace-id: 0a21fb2917928188330060f51533a814
x-envoy-upstream-service-time: 25
req-cost-time: 25
access-control-allow-credentials: true
access-control-allow-origin: *        ← wide-open CORS, any origin can call from browser
access-control-expose-headers: *
Alt-Svc: h3=":443";ma=86400,h3-29=":443";ma=86400
```

The BFF allows `Access-Control-Allow-Origin: *` with credentials — meaning browser-side JS could call it directly from any origin. (We proxy through `/api/proxy` instead, so this is moot, but it explains why a browser-only client could fetch streams.)

---

## Section 2 — Search API

### 2.1 Endpoint

```
POST https://movieboxhd.net/wefeed-h5api-bff/subject/search
       (or: https://h5-api.aoneroom.com/wefeed-h5api-bff/subject/search)
```

### 2.2 Request

```http
POST /wefeed-h5api-bff/subject/search HTTP/1.1
Host: movieboxhd.net
Authorization: Bearer <JWT>
Content-Type: application/json
Origin: https://movieboxhd.net
Referer: https://movieboxhd.net/
User-Agent: Mozilla/5.0 ... Chrome/120

{"keyword":"Jurassic World","page":1,"perPage":20}
```

### 2.3 Response shape

```jsonc
{
  "code": 0,                    // 0 = success
  "message": "ok",
  "data": {
    "pager": {
      "hasMore": true,
      "nextPage": "2",
      "page": "1",
      "perPage": 20,
      "totalCount": 78          // 78 results for "Jurassic World"
    },
    "items": [
      {
        "subjectId": "1825499583430937064",
        "subjectType": 1,       // 1 = movie, 2 = series/anime
        "title": "Jurassic World",
        "releaseDate": "2015-06-12",
        "duration": 7440,       // seconds (124 min)
        "genre": "Action,Adventure,Sci-Fi",
        "cover": { "url": "https://pbcdnw.aoneroom.com/image/...jpg", "width": 3158, "height": 5000 },
        "countryName": "United States",
        "imdbRatingValue": "6.9",
        "imdbRatingCount": 722326,
        "subtitles": "English,Español,Filipino,Français,Indonesian,...",
        "hasResource": true,   // IMPORTANT: false means no playable streams
        "detailPath": "jurassic-world-owip9S3OQa2",
        "trailer": {
          "videoAddress": { "url": "https://macdn.aoneroom.com/media/vone/.../...-sd.mp4",
                            "duration": 126, "size": 12324637 }
        },
        "webHighRisk": false,
        "isPornographic": false,
        "accessStrategy": null,
        "postTitle": "..."
      },
      ...
    ]
  }
}
```

### 2.4 Real example (truncated) — "Jurassic World" search

```
total: 78 results
items[0]: subjectId=1825499583430937064 type=1 title="Jurassic World" year=2015 hasResource=true detailPath=jurassic-world-owip9S3OQa2
items[1]: subjectId=1257402142307009144 type=1 title="Jurassic World: Rebirth" year=2025 hasResource=true detailPath=jurassic-world-rebirth-KH44jQJUSu1
items[2]: subjectId=513260811054371608  type=2 title="... (series)"
...
```

### 2.5 Auth requirement

**`/subject/search` REQUIRES Authorization** — without it, returns:
```json
{"code":400,"reason":"PARAMS_ERROR","message":"invalid token","metadata":{}}
```

### 2.6 Related endpoints discovered in the JS bundle

| Path | Auth? | Purpose |
|---|---|---|
| `POST /subject/search` | required | Main keyword search (used by existing Nobar) |
| `POST /subject/search-suggest` | (likely required) | Autocomplete suggestions |
| `POST /subject/everyone-search` | 404 — does not exist on this host | (referenced in JS bundle, not deployed here) |
| `GET  /subject/trending` | **PUBLIC (no auth!)** | Trending catalog list — see below |
| `POST /subject/filter` | required | Advanced filter (genre/year/country) |
| `GET  /subject/detail-rec` | (likely required) | Recommended-similar for a subject |
| `GET  /detail?subjectId=&detailPath=` | **PUBLIC (no auth!)** | Full movie metadata, hasResource, trailer |
| `GET  /media-player/get-domain` | **PUBLIC** | Returns canonical SPA player domain (currently `"https://mzfi.me/"`) |
| `GET  /home?page=N` | (anonymous — mints token) | Home page tiles; also the token-mint endpoint |
| `GET  /ranking-list/content` | required | Ranking list by category |

### 2.7 Real `/subject/trending` response (PUBLIC, no token)

```bash
curl 'https://movieboxhd.net/wefeed-h5api-bff/subject/trending' \
  -H 'Origin: https://movieboxhd.net' -H 'Referer: https://movieboxhd.net/'
```
```jsonc
{"code":0,"message":"ok","data":{
  "subjectList":[
    {"subjectId":"2190807691784770592","subjectType":2,"title":"Lucifer",
     "releaseDate":"2016-01-25","genre":"Crime,Drama,Fantasy",
     "cover":{"url":"https://pbcdnw.aoneroom.com/image/2026/01/27/9fd9113b6be06b254bef10a8bea06eb1.jpg"},
     "imdbRatingValue":"8.0","subtitles":"English,Español,Filipino,Français,..."}
  ]
}}
```

### 2.8 Real `/media-player/get-domain` response

```bash
curl 'https://movieboxhd.net/wefeed-h5api-bff/media-player/get-domain' \
  -H 'Origin: https://movieboxhd.net' -H 'Referer: https://movieboxhd.net/'
```
```json
{"code":0,"message":"ok","data":"https://mzfi.me/"}
```
This confirms the architectural relationship: movieboxhd.net's BFF says "go use mzfi.me as your player SPA".

---

## Section 3 — Play/stream API

### 3.1 Endpoint

```
GET https://movieboxhd.net/wefeed-h5api-bff/subject/play
       ?subjectId=<subjectId>
       &se=<0 for movies, N for TV season>
       &ep=<0 for movies, N for TV episode>
       &detailPath=<detailPath from search>
       &streamSignType=1
       &supportCodecs%5Bh264%5D=1     ← MUST be URL-encoded %5B%5D, not raw []
```

### 3.2 Request headers (REQUIRED)

```http
GET /wefeed-h5api-bff/subject/play?subjectId=3351901692374698784&se=0&ep=0&detailPath=spider-man-no-way-home-2XTfLYcKBZ3&streamSignType=1&supportCodecs%5Bh264%5D=1 HTTP/1.1
Host: movieboxhd.net
Authorization: Bearer <JWT>           ← technically OPTIONAL (see §3.5)
Accept: application/json
Origin: https://movieboxhd.net
Referer: https://movieboxhd.net/spa/videoPlayPage/movies/spider-man-no-way-home-2XTfLYcKBZ3?id=3351901692374698784
                                                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                   CRITICAL: must be /spa/videoPlayPage/movies/<detailPath>?id=<subjectId>
User-Agent: Mozilla/5.0 ... Chrome/120
```

**The Referer is the gate.** Without the `/spa/videoPlayPage/...` referer, the BFF returns empty `streams:[]` even though `vipLocked:false`. This is the SAME requirement as mzfi.me (existing Nobar code already sends `https://mzfi.me/spa/videoPlayPage/movies/${path}?id=${sid}`).

### 3.3 Real response — Spider-Man: No Way Home (2021)

```jsonc
{
  "code": 0,
  "message": "ok",
  "data": {
    "streams": [
      {
        "format": "MP4",
        "id": "5696176666490430968",
        "url": "https://bcdnxw.hakunaymatata.com/resource/733ea5912c0df91f7b01316bb458562c.mp4?sign=a8c51c3afcc83498921f816f4afa143a&t=1792818273",
        "resolutions": "480",
        "size": "1133404811",      // 1.13 GB
        "duration": 8889,         // 148 min
        "codecName": "h264",
        "signCookie": "",
        "signHeaderKey": "",
        "vipLocked": false
      },
      {
        "format": "MP4",
        "id": "8058308073976386720",
        "url": "https://bcdnxw.hakunaymatata.com/resource/c48207be025435f6efdbecf6bea11129.mp4?sign=0e3801031470b920c6cf52ea221305ff&t=1792818273",
        "resolutions": "1080",
        "size": "2603264862",     // 2.6 GB
        "duration": 8889,
        "codecName": "h264",
        "signCookie": "",
        "signHeaderKey": "",
        "vipLocked": false
      }
    ],
    "dash": [
      {
        "format": "DASH",
        "id": "6558330122108552408",
        "url": "https://sbcdnw.hakunaymatata.com/dash/3351901692374698784_0_0_1080_h265_773/index_web.mpd",
        "resolutions": "1080,720,480",   // multi-bitrate adaptive
        "size": "4187174570",            // 4.2 GB total (all reps)
        "duration": 8889,
        "codecName": "hevc",
        "signCookie": "Edge-Cache-Cookie=urlprefix=aHR0cHM6...:sign=7315b3519804a7b57434471d53bce5c5:t=1792816441",
        "signHeaderKey": "X-MB-Token",   // ← DASH requires this header = signCookie value
        "vipLocked": false
      }
    ],
    "hls": [],                          // ← never populated for these titles
    "freeNum": 999,                     // free plays remaining (large number)
    "limited": false,
    "vipLocked": false,                 // overall flag
    "codecPriority": ["hevc","h264"],
    "playConfig": {
      "adFree": false,
      "maxResolution": 480             // ← FREE TIER cap (ignored in practice — 1080p URLs returned anyway)
    },
    "shareUnlocked": false,
    "hasResource": true
  }
}
```

### 3.4 Real response — Breaking Bad S5E1 (TV series)

```jsonc
{
  "code": 0, "message": "ok",
  "data": {
    "streams": [
      {"format":"MP4","resolutions":"360","codecName":"h264","size":"121000000", "url":"https://bcdnxw.hakunaymatata.com/bt/a9f682d0fcc9ec0f6cb9ec5f6d9a7b2b.mp4?sign=..."},
      {"format":"MP4","resolutions":"480","codecName":"h264","size":"151000000", "url":"https://bcdnxw.hakunaymatata.com/resource/70f07445704ed6ea8ac1c22ef1f06510.mp4?sign=..."},
      {"format":"MP4","resolutions":"720","codecName":"h264","size":"292000000", "url":"https://bcdnxw.hakunaymatata.com/resource/9044f6b4dc93bf9e3d19af6a776c32c0.mp4?sign=..."},
      {"format":"MP4","resolutions":"1080","codecName":"h264","size":"522000000","url":"https://bcdnxw.hakunaymatata.com/resource/779ce539eb8dbde812b80390f33f154e.mp4?sign=..."}
    ],
    "dash": [
      {"format":"DASH","resolutions":"1080,720,480","codecName":"hevc","url":"https://sbcdnw.hakunaymatata.com/dash/6207982430134357800_5_1_1080_h265_434/index_web.mpd", "signHeaderKey":"X-MB-Token", "signCookie":"Edge-Cache-Cookie=..."}
    ],
    "hls": [],
    "hasResource": true, "vipLocked": false,
    "playConfig": {"adFree": false, "maxResolution": 480}
  }
}
```

The URL pattern for DASH:
```
https://sbcdnw.hakunaymatata.com/dash/<subjectId>_<se>_<ep>_<maxBitrate>_<codec>_<randomId>/index_web.mpd
```

### 3.5 Auth requirement (NEW finding!)

`/subject/play` works **WITHOUT an `Authorization` header** at all — only the Referer is checked. Verified by sending a request with no `Authorization` header at all and getting the same `streams: [...]` response.

This means **if you already have the subjectId+detailPath from the search call**, the play call can be made anonymously (Referer-only). The existing Nobar code currently re-sends the same token to play, which works fine — but you could drop it for play if you wanted to reduce token use.

### 3.6 DASH (NEW finding — not in prior worklog)

The worklog only mentions MP4. **The BFF also returns MPEG-DASH adaptive-bitrate streams.** For movies like Spider-Man NWH, the DASH manifest is:

```xml
<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="static"
     mediaPresentationDuration="PT2H28M9.8S"
     maxSegmentDuration="PT5.0S"
     minBufferTime="PT12.1S">
  <ProgramInformation>
    <Title>Spider-Man.No.Way.Home.2021.1080p.BluRay.x265-RARBG</Title>
  </ProgramInformation>
  <Period id="0" start="PT0.0S">
    <AdaptationSet id="0" contentType="video" frameRate="24000/1001" maxWidth="2580" maxHeight="1080">
      <Representation id="0" mimeType="video/mp4" codecs="hev1.1.6.L150.90" bandwidth="2200000" width="2580" height="1080">
        <SegmentTemplate timescale="24000" initialization="init-stream$RepresentationID$.m4s"
                         media="chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline>...</SegmentTimeline>
        </SegmentTemplate>
      </Representation>
      <!-- more representations: 720p, 480p -->
    </AdaptationSet>
    <AdaptationSet id="1" contentType="audio">...</AdaptationSet>
  </Period>
</MPD>
```

**To fetch the DASH MPD**, send:
```http
GET /dash/3351901692374698784_0_0_1080_h265_773/index_web.mpd HTTP/1.1
Host: sbcdnw.hakunaymatata.com
Origin: https://movieboxhd.net
Referer: https://movieboxhd.net/
X-MB-Token: Edge-Cache-Cookie=urlprefix=aHR0cHM6...:sign=7315b3519804a7b57434471d53bce5c5:t=1792816441
```

Without `X-MB-Token` (or with `--cookie` instead), the CDN returns `403 ERROR: ACCESS DENIED`.

The `.m4s` chunk URLs in the manifest are relative to the MPD base, so chunks fetch from `https://sbcdnw.hakunaymatata.com/dash/.../chunk-stream0-00001.m4s` etc.

### 3.7 HLS

**`hls[]` was empty for every title tested** (Jurassic World, Spider-Man NWH, Breaking Bad). The BFF supports the field but movieboxhd.net does not appear to populate it for these titles. DASH is the adaptive option — there is no HLS endpoint. (Use `dashjs` or `shaka-player` in the browser to play DASH.)

---

## Section 4 — CDN

### 4.1 CDN domains (full table)

| Domain | Purpose | Anti-leech | Auth |
|---|---|---|---|
| `bcdnxw.hakunaymatata.com` | **MP4 streams** (H.264, single-bitrate per file) | YES — needs `Referer` | URL `?sign=` + `&t=` timestamp (expiry ~600s) |
| `sbcdnw.hakunaymatata.com` | **DASH streams** (HEVC, adaptive) | YES — needs `X-MB-Token` header | Header `X-MB-Token: <signCookie>` |
| `cacdn.hakunaymatata.com` | Subtitle SRT files | (likely Referer) | URL has `?Policy=...` token |
| `pbcdnw.aoneroom.com` | Poster/cover images | no (public) | — |
| `macdn.aoneroom.com` | Trailer preview videos | no (public) | — |
| `h5-static.aoneroom.com` | JS/CSS/image assets (Nuxt build) | no (public) | — |
| `h5-api.aoneroom.com` | BFF API gateway (canonical prod) | — | `Authorization: Bearer <jwt>` |
| `movieboxhd.net` | SSR HTML + BFF proxy | — | `Authorization: Bearer <jwt>` |
| `mzfi.me` | SPA player + BFF proxy | — | `Authorization: Bearer <jwt>` |

### 4.2 MP4 CDN — required headers

```bash
# Bare request → 429 (anti-leech)
curl -I 'https://bcdnxw.hakunaymatata.com/resource/c48207be025435f6efdbecf6bea11129.mp4?sign=...&t=...'
# HTTP/2 429 Too Many Requests

# With Referer=movieboxhd.net → 200 OK (2.6 GB file)
curl -I -H 'Referer: https://movieboxhd.net/' -H 'Origin: https://movieboxhd.net' \
     -A 'Mozilla/5.0 ... Chrome/120' \
     'https://bcdnxw.hakunaymatata.com/resource/c48207be025435f6efdbecf6bea11129.mp4?sign=...&t=...'
# HTTP/2 200 OK
# content-type: video/mp4
# content-length: 2603264862
# accept-ranges: bytes
# etag: "623AED2749E19F9196AE81599B5B7BC8"
# last-modified: Fri, 29 May 2026 15:40:23 GMT
# server: Tengine                  ← Alibaba nginx fork
# x-oss-request-id: ...            ← Aliyun OSS
# x-oss-cdn-auth: success
# content-disposition: attachment;filename=Spider-Man: No Way Home-1080P.mp4
# x-swift-cachetime: 31104000      ← 1 year edge cache
# access-control-allow-origin: *   ← CORS OK
```

**Both Referers work** (verified live):
- `Referer: https://movieboxhd.net/` → 200 ✓
- `Referer: https://mzfi.me/` → 200 ✓

The existing Nobar `/api/proxy/route.ts` already sends `Referer: https://mzfi.me/` for `bcdnxw.hakunaymatata.com` URLs — that will continue to work for movieboxhd.net MP4 URLs (same CDN).

### 4.3 Range / 206 Partial Content (seeking)

```bash
curl -sS -o /tmp/range.bin -D - \
  -H 'Referer: https://movieboxhd.net/' -H 'Origin: https://movieboxhd.net' \
  -H 'Range: bytes=0-1023' \
  -A 'Mozilla/5.0 ... Chrome/120' \
  'https://bcdnxw.hakunaymatata.com/resource/c48207be025435f6efdbecf6bea11129.mp4?sign=...&t=...'
# HTTP/2 206 Partial Content
# content-type: video/mp4
# content-length: 1024
# accept-ranges: bytes
# content-range: bytes 0-1023/2603264862
# access-control-allow-origin: *
```

Mid-file seek also works:
```bash
curl ... -H 'Range: bytes=1000000-1001023' ...
# HTTP/2 206
# content-range: bytes 1000000-1001023/2603264862
```

**Seeking works perfectly** — the existing Nobar `/api/proxy/route.ts` (which forwards `Range` and passes through `206`/`Content-Range`) is compatible with movieboxhd.net MP4 URLs.

### 4.4 DASH CDN

```bash
# Bare → 429
curl -I 'https://sbcdnw.hakunaymatata.com/dash/.../index_web.mpd'
# HTTP/2 429

# With Referer only → 403 ACCESS DENIED
curl -I -H 'Referer: https://movieboxhd.net/' 'https://sbcdnw.hakunaymatata.com/dash/.../index_web.mpd'
# HTTP/2 403 ERROR: ACCESS DENIED

# With X-MB-Token header (= signCookie from play response) → 200 OK + MPD XML
curl -H 'X-MB-Token: Edge-Cache-Cookie=urlprefix=...:sign=...:t=...' \
     -H 'Referer: https://movieboxhd.net/' \
     'https://sbcdnw.hakunaymatata.com/dash/.../index_web.mpd'
# HTTP/2 200 OK
# <?xml version="1.0"?><MPD ...>
```

The DASH chunk URLs are relative to the MPD base, so they inherit the same `X-MB-Token` requirement. Nobar's existing `/api/proxy` does NOT currently inject `X-MB-Token` — to enable DASH, we'd need a small proxy update.

### 4.5 Subtitle CDN

Subtitle URLs returned by `/subject/caption` look like:
```
https://cacdn.hakunaymatata.com/subtitle/b34abd2d7060fea06a9eadedbb798c3e.srt?Policy=...
https://cacdn.hakunaymatata.com/msubt/afdccefcd3e2c41a82e750a3cc88f405.srt?Policy=...
```

(Both `cacdn.hakunaymatata.com/subtitle/...` and `cacdn.hakunaymatata.com/msubt/...` paths appear.) The `?Policy=...` token in the URL is the only auth. The existing Nobar `/api/subtitle` route handles these correctly (per `nobar-moviebox-mapping` FIX #6 in worklog — adds Referer+Origin for `aoneroom.com|hakunaymatata.com`).

### 4.6 Token expiry on stream URLs

Stream URLs include `?sign=<md5>&t=<unix-ts>` where `t` is the **expiry timestamp** (about 10 minutes after issue). Subtitle URLs use AWS-style `?Policy=...&Signature=...&Key-Pair-Id=...` (longer-lived, ~hours). The existing Nobar code already sets `Cache-Control: no-store` on `/api/stream/[id]` to avoid handing out stale URLs — keep that.

---

## Section 5 — Differences from mzfi.me

### 5.1 Same things (identical)

| Thing | mzfi.me | movieboxhd.net | Same? |
|---|---|---|---|
| BFF path prefix | `/wefeed-h5api-bff/` | `/wefeed-h5api-bff/` | ✓ identical |
| Internal k8s svc | `wefeed-h5api-bff.wefeed-prod` | `wefeed-h5api-bff.wefeed-prod` | ✓ identical |
| Token mint endpoint | `GET /wefeed-h5api-bff/home?page=1` | `GET /wefeed-h5api-bff/home?page=1` | ✓ identical |
| Token format | HS256 JWT, `appType:3,userType:0` | HS256 JWT, `appType:3,userType:0` | ✓ identical |
| Token TTL | 90 days (`Max-Age=7776000`) | 90 days (`Max-Age=7776000`) | ✓ identical |
| Cookie name | `token` | `token` | ✓ identical (mzfi's old `mb_guest_token` is alias-accepted on both) |
| Search endpoint | `POST /subject/search` | `POST /subject/search` | ✓ identical |
| Play endpoint | `GET /subject/play` | `GET /subject/play` | ✓ identical |
| Required Referer for play | `https://mzfi.me/spa/videoPlayPage/movies/<path>?id=<sid>` | `https://movieboxhd.net/spa/videoPlayPage/movies/<path>?id=<sid>` | ✓ same SHAPE (different host) |
| `x-vip-restrict` rule | MUST NOT be sent (causes vipLocked=true) | MUST NOT be sent | ✓ identical |
| Caption endpoint | `GET /subject/caption?format=MP4&id=...` | same | ✓ identical |
| Catalog subjectIds | (e.g.) Spider-Man NWH = 3351901692374698784 | same subjectId | ✓ identical (shared DB) |
| MP4 CDN | `bcdnxw.hakunaymatata.com` | `bcdnxw.hakunaymatata.com` | ✓ identical |
| DASH CDN | (also present on mzfi — same `dash[]` field) | `sbcdnw.hakunaymatata.com` | ✓ identical |
| Image CDN | `pbcdnw.aoneroom.com` | `pbcdnw.aoneroom.com` | ✓ identical |
| Token portability | Token minted on mzfi.me works on movieboxhd.net | Token minted on movieboxhd.net works on mzfi.me | ✓ verified live |
| Response body byte-identical? | — | — | ✓ verified (same streams[]/dash[]/hls[] arrays) |

### 5.2 Different things (cosmetic only)

| Aspect | mzfi.me | movieboxhd.net |
|---|---|---|
| Front-end | Vue SPA (`/spa/...`) | Nuxt SSR (Vue, server-rendered HTML) |
| Page bundle | `_next/static/...` (Next.js-style names? — actually no, this is mzfi's own) | `h5-static.aoneroom.com/ssrStatic/mbOfficial/public/_nuxt/...` |
| HTML size | small (SPA shell) | 1.25 MB (full SSR HTML — better SEO) |
| Default route | `/home?page=N` SPA | `/web/<category>` SSR (e.g. `/web/midnight`, `/web/movies`, `/web/trending`) |
| Has `/web/midnight` route? | no | yes (a category page — late-night/adult skew, "Midnight Movies") |
| `/media-player/get-domain` returns | (not used — it IS the player) | returns `"https://mzfi.me/"` (defers to mzfi SPA) |
| Server header | `istio-envoy` | `istio-envoy` (same gateway) |
| Alt-Svc | h3 | h3 (same) |

### 5.3 Token portability test (live, real)

Minted a token on `movieboxhd.net` (`uid=5470908628629605376`), then used the SAME token on `mzfi.me`:

```
=== Use movieboxhd.net token to call /subject/play ON mzfi.me ===
code: 0 streams: 2 dash: 1 hasResource: True   ← WORKS

=== Use movieboxhd.net token to call /subject/play ON movieboxhd.net ===
code: 0 streams: 2 dash: 1 hasResource: True   ← WORKS
```

Both calls returned the **same stream URLs** (same `bcdnxw.hakunaymatata.com` URLs, same `sign`, same `t`).

### 5.4 Why movieboxhd.net exists at all

movieboxhd.net is the SEO brand front. mzfi.me is the SPA. They are the same product owned by aoneroom. The `peerOrigins:["https://netfilm.world","https://mzfi.me"]` field in `__NUXT__.config.public.passport` confirms mzfi.me is the canonical SPA peer. There are at least 3 known mirrors of this product: `movieboxhd.net`, `mzfi.me`, `netfilm.world`. All hit the same BFF.

---

## Section 6 — Recommendation

### 6.1 Should Nobar add movieboxhd.net "midnight" as a 2nd stream source?

**NO**. It is functionally identical to `mzfi.me`. Adding it would just be a 2nd hostname alias for the same backend:
- Same catalog (verified — same subjectIds returned by search)
- Same tokens (verified portable)
- Same CDN (`bcdnxw.hakunaymatata.com`)
- Same stream URLs
- Same rate-limit pool (429s would be shared)

Adding a 2nd source would NOT give us redundancy against mzfi.me rate-limiting — both share the same `wefeed-h5api-bff.wefeed-prod` k8s service.

### 6.2 Recommended changes for the existing mzfi.me integration

These are **optional improvements** discovered during this RE, in priority order:

1. **Adopt DASH streams** for smoother playback on slow connections:
   - The BFF returns `dash[]` with multi-bitrate HEVC adaptive streams.
   - Use `shaka-player` or `dashjs` in the browser to play DASH natively.
   - Requires `X-MB-Token` header on the CDN — extend `/api/proxy/route.ts` to inject it when the URL is on `sbcdnw.hakunaymatata.com` (read from a query param like `&mbtoken=...` that the stream route passes through).
   - **Trade-off:** DASH is HEVC — Safari supports HEVC natively, but Chrome/Firefox need MSE + a fallback. Could be 720p MP4 default + DASH opt-in.

2. **Use canonical BFF domain** `h5-api.aoneroom.com` (instead of `mzfi.me` as the API host):
   - Same backend, but `h5-api.aoneroom.com` is the gateway the official client uses (`__NUXT__.config.public.prod.BASE_URL`).
   - Less risk of `mzfi.me` going away (mzfi is one of several mirrors; `h5-api.aoneroom.com` is THE BFF gateway).
   - One-line change in `src/app/api/stream/[id]/route.ts` and `src/app/api/subtitle/route.ts`.

3. **Drop the Authorization header on `/subject/play`** (optional micro-optimization):
   - Play endpoint works with just the Referer (verified live).
   - Saves zero network round-trips (same call) but reduces token load on logs.
   - Existing code already works with the token; this is purely cosmetic.

4. **Use the public `/detail?subjectId=&detailPath=` endpoint** to pre-validate `hasResource` for known subjectIds (e.g. cache movie→subjectId mappings from TMDB lookups):
   - `GET /detail` is public (no token), returns `hasResource: true/false`.
   - Could be used by a separate cron that pre-populates a cache so /api/stream can skip the search step.

5. **Use `/subject/trending` (public, no auth)** for a "Trending on MovieBox" row on the Nobar homepage — no token minting needed, zero rate-limit risk.

6. **Do NOT add X-Vip-Restrict / X-Client-Info / X-No-High-Risk-Restrict / X-Request-Lang** — these are the client opt-in restriction headers. Existing Nobar already correctly omits them (per `nobar-vip-breakthrough`).

### 6.3 Concrete example MP4 URL (verified working through proxy)

A real, working MP4 stream URL (Spider-Man: No Way Home 1080p, expires ~10 min after issue):

```
https://bcdnxw.hakunaymatata.com/resource/c48207be025435f6efdbecf6bea11129.mp4?sign=0e3801031470b920c6cf52ea221305ff&t=1792818273
```

Test through the existing Nobar `/api/proxy`:
```
GET /api/proxy?url=https%3A%2F%2Fbcdnxw.hakunaymatata.com%2Fresource%2Fc48207be025435f6efdbecf6bea11129.mp4%3Fsign%3D0e3801031470b920c6cf52ea221305ff%26t%3D1792818273
```
The existing proxy code already matches `bcdnxw.hakunaymatata.com` and injects `Referer: https://mzfi.me/` + `Origin: https://mzfi.me`, both of which are accepted by the CDN. Range requests pass through to 206 + Content-Range.

### 6.4 Concrete example DASH URL (requires new proxy logic)

```
MPD:      https://sbcdnw.hakunaymatata.com/dash/3351901692374698784_0_0_1080_h265_773/index_web.mpd
Headers:  X-MB-Token: Edge-Cache-Cookie=urlprefix=aHR0cHM6...:sign=7315b3519804a7b57434471d53bce5c5:t=1792816441
          Referer:    https://movieboxhd.net/  (or https://mzfi.me/)
          Origin:      https://movieboxhd.net/ (or https://mzfi.me/)
Chunks:   https://sbcdnw.hakunaymatata.com/dash/.../init-stream0.m4s
          https://sbcdnw.hakunaymatata.com/dash/.../chunk-stream0-00001.m4s
          ...
```

To enable DASH through the existing `/api/proxy`, the stream route would need to URL-pass the `X-MB-Token` value:
```
/api/proxy?url=<encoded-mpd-url>&mbtoken=<encoded-signCookie>
```
and `/api/proxy/route.ts` would inject `X-MB-Token` when `targetUrl.includes('sbcdnw.hakunaymatata.com')`.

---

## Appendix A — File artifacts produced by this RE session

Saved in `/tmp/re-midnight/`:
- `html.html` — full HTML of `/web/midnight` (1.25 MB)
- `headers.txt` — response headers of `/web/midnight`
- `search-body.json` — search results for "Jurassic World"
- `spiderman-search.json` — search results for "Spider-Man No Way Home"
- `play-spnwh-h264.json` — play response (Spider-Man NWH, H.264)
- `play-spnwh-hevc.json` — play response (Spider-Man NWH, HEVC)
- `play-via-mzfi.json` — play response for the same subjectId via mzfi.me (proves parity)
- `bb-play.json` — Breaking Bad S5E1 play response (TV)
- `captions.json` — captions for Spider-Man NWH (16 languages)
- `range-headers.txt` / `seek-headers.txt` — Range/206 verification
- `main.js` — Nuxt main bundle (566 KB)

## Appendix B — All BFF endpoints discovered (grepped from JS bundle)

```
/wefeed-h5api-bff/home
/wefeed-h5api-bff/detail                     ← PUBLIC (no auth)
/wefeed-h5api-bff/subject/search            ← requires Bearer
/wefeed-h5api-bff/subject/search-suggest
/wefeed-h5api-bff/subject/everyone-search    ← 404 on this host (not deployed)
/wefeed-h5api-bff/subject/filter
/wefeed-h5api-bff/subject/trending           ← PUBLIC (no auth)
/wefeed-h5api-bff/subject/detail-rec
/wefeed-h5api-bff/subject/play              ← works without Bearer (Referer-only)
/wefeed-h5api-bff/subject/caption
/wefeed-h5api-bff/ranking-list/content
/wefeed-h5api-bff/media-player/get-domain    ← PUBLIC (returns "https://mzfi.me/")
/wefeed-h5api-bff/feature/flags
/wefeed-h5api-bff/country-code
/wefeed-h5api-bff/ad/get-config
/wefeed-h5api-bff/post/list/subject
/wefeed-h5api-bff/staff/staff-related
/wefeed-h5api-bff/staff/subject-list
/wefeed-h5api-bff/platform/play-list
/wefeed-h5api-bff/platform/play-list-month
/wefeed-h5api-bff/share
/wefeed-h5api-bff/share-unlock
/wefeed-h5api-bff/qrcode-unlock
/wefeed-h5api-bff/tab-operating
/wefeed-h5api-bff/tab/get-bottom-tab-list
/wefeed-h5api-bff/activity/info
/wefeed-h5api-bff/activity/invitee-list
/wefeed-h5api-bff/app/get-latest-app-pkgs
/wefeed-h5api-bff/user/google-login
/wefeed-h5api-bff/user/qr-login-create
/wefeed-h5api-bff/user/qr-login-poll
/wefeed-h5api-bff/user/qr-login-fetch
/wefeed-h5api-bff/user/logout
/wefeed-h5api-bff/user/profile
/wefeed-h5api-bff/vip/brief-info
/wefeed-h5api-bff/vip/detail
/wefeed-h5api-bff/vip/sku-list
/wefeed-h5api-bff/vip/member-rights
/wefeed-h5api-bff/vip/create-order
/wefeed-h5api-bff/vip/poll-order-status
/wefeed-h5api-bff/member/skus
/wefeed-h5api-bff/pay/countries
/wefeed-h5api-bff/pay/channels
/wefeed-h5api-bff/web/get-page-tdk
```

## Appendix C — Repro: full play chain (curl one-liner)

```bash
# 1. Mint token (anonymous)
TOKEN=$(curl -sS -D - -o /dev/null \
  -H 'Origin: https://movieboxhd.net' -H 'Referer: https://movieboxhd.net/web/midnight' \
  -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  'https://movieboxhd.net/wefeed-h5api-bff/home?page=1' \
  | rg -o 'token=[^;]+' | head -1 | sed 's/token=//')
echo "TOKEN=${TOKEN:0:60}..."

# 2. Search by title
SID=$(curl -sS -X POST 'https://movieboxhd.net/wefeed-h5api-bff/subject/search' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Origin: https://movieboxhd.net' -H 'Referer: https://movieboxhd.net/' \
  -A 'Mozilla/5.0 ... Chrome/120' \
  --data '{"keyword":"Spider-Man No Way Home","page":1,"perPage":5}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print([i['subjectId'] for i in d['data']['items'] if i['title']=='Spider-Man: No Way Home'][0])")
echo "SID=$SID"

DPATH=$(curl -sS -X POST 'https://movieboxhd.net/wefeed-h5api-bff/subject/search' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Origin: https://movieboxhd.net' -H 'Referer: https://movieboxhd.net/' \
  -A 'Mozilla/5.0 ... Chrome/120' \
  --data '{"keyword":"Spider-Man No Way Home","page":1,"perPage":5}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print([i['detailPath'] for i in d['data']['items'] if i['title']=='Spider-Man: No Way Home'][0])")
echo "DPATH=$DPATH"

# 3. Play (Referer is the gate; Authorization optional)
curl -sS "https://movieboxhd.net/wefeed-h5api-bff/subject/play?subjectId=$SID&se=0&ep=0&detailPath=$DPATH&streamSignType=1&supportCodecs%5Bh264%5D=1" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' -H 'Origin: https://movieboxhd.net' \
  -H "Referer: https://movieboxhd.net/spa/videoPlayPage/movies/${DPATH}?id=${SID}" \
  -A 'Mozilla/5.0 ... Chrome/120' \
  | python3 -m json.tool
```

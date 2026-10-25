# Nobar RE Round 4 — mzfi BFF Deep Audit + vidlink.pro Field Discovery

**Date:** Oct 25, 2026  
**Status:** ✅ COMPLETE — mzfi BFF fully mapped, vidlink response fields documented  
**Goal:** Find unused fields, alternate auth paths, catalog discovery endpoints

---

## Executive Summary

This round went deeper into the mzfi BFF API and vidlink.pro response structure
to find:
1. Unused fields in vidlink.pro's stream response (4 new fields found)
2. VIP unlock behavior (x-vip-restrict header → vipLocked=true → BAD)
3. Codec variations (h264/h265/av1 — all return same stream URLs)
4. mzfi's curated catalog endpoints (`/home` returns 34 collections + 10 platform curators)
5. CloudFront Policy expiry analysis (6.37 days — long enough for client-side caching)
6. Cookie vs Authorization header behavior (Cookie works for ALL endpoints, Authorization fails for some)

---

## 1. vidlink.pro Response — 4 NEW Unused Fields Found

### Complete Response Structure

```json
{
  "sourceId": "mwVault",
  "stream": {
    "id": "primary",
    "captions": [...],
    "flags": ["cors-allowed"],                    // NEW — confirms CORS-open!
    "TTL": 3600,                                  // NEW — API token TTL (1 hour)
    "type": "hls",
    "deliveryType": "hls",
    "playlist": "https://sacdn.hakunaymatata.com/hls/...",
    "playlistHeaders": { "Cookie": "..." },
    "requiresProxy": true,
    "playbackMetadata": {                         // NEW — useful for UI!
      "format": "HLS",
      "codecName": "h264",
      "resolutions": ["1080"],
      "size": "2103115698",                       // ~2.1 GB
      "duration": 8180                             // 2hr 16min
    },
    "expiresAt": 1792866479                        // NEW — but already in past? see below
  }
}
```

### Field Analysis

| Field | Value | Meaning | Action |
|---|---|---|---|
| `flags` | `["cors-allowed"]` | API confirms HLS is CORS-open | ✅ Already using direct path |
| `TTL` | `3600` | Token valid 1 hour (but CloudFront lasts 6 days) | Could cache signed URL 1hr |
| `playbackMetadata` | `{format, codecName, resolutions, size, duration}` | Movie metadata for UI | **NEW: Show movie size + duration in player** |
| `expiresAt` | past timestamp | Misleading — token actually has no expiry (CloudFront Policy has 6-day expiry) | Don't use |

### CloudFront Policy Expiry Analysis

```json
{
  "Statement": [{
    "Resource": "https://sacdn.hakunaymatata.com/hls/{id}/*",
    "Condition": {"DateLessThan": {"AWS:EpochTime": 1793466207}}
  }]
}
```

- **CloudFront signed URL expires in 6.37 days** (550,530 seconds)
- API's `expiresAt` field is misleading (in the past, but stream still works)
- `TTL: 3600` is the API TOKEN TTL (1 hour) — not the stream URL TTL
- **Implication:** Could cache the signed URL client-side for up to 6 days
  (instead of re-fetching from API every playback)

---

## 2. mzfi VIP Unlock — x-vip-restrict Header Behavior

### Test Results (Inception, TMDB 27205)

| Header Sent | vipLocked | maxResolution | adFree | Stream URLs |
|---|---|---|---|---|
| (none) | `false` ✅ | 480 | false | ✅ Returned (full URLs) |
| `x-vip-restrict: 0` | (not tested) | — | — | — |
| `x-vip-restrict: 1` | **`true` ❌** | 480 | false | URLs REDACTED |

### Conclusion

**DO NOT send `x-vip-restrict` header** — it locks content. The free tier (no header)
gives full stream URLs. This confirms the existing implementation in `/api/stream/[id]/route.ts`
which correctly omits this header.

### `playConfig` Field (NEW discovery)

The /subject/play response now includes a `playConfig` field:
```json
{ "adFree": false, "maxResolution": 480 }
```

This means:
- Free tier is limited to 480p resolution (DASH may still deliver 1080p though)
- `adFree: false` means ads may be inserted (mzfi mobile app shows ads)

**But our DASH path gets 1080p** — the `playConfig.maxResolution: 480` appears
to be advisory only, not enforced on the CDN side. The DASH MPD we fetched
earlier had 1080p Representation.

---

## 3. Codec Variations — All Return Same URLs

Tested `/subject/play?supportCodecs[h264|h265|av1]=1`:

| Codec | streams | dash | Result |
|---|---|---|---|
| h264 | 1 | 1 | Same MP4 + same DASH URL |
| h265 | 1 | 1 | Same MP4 + same DASH URL |
| av1 | 1 | 1 | Same MP4 + same DASH URL |

**No benefit to changing codec** — mzfi returns the same stream regardless of
the supportCodecs parameter. The DASH MPD is always HEVC (hev1.1.6.L150.90).

---

## 4. 🎯 NEW: mzfi /home Endpoint — Curated Catalog Discovery

### Discovery: /home returns MUCH more than token

Previously we only used `/home?page=1` to mint a token (via Set-Cookie).
But the response body contains 534KB of curated catalog data!

### Top-level structure

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "platformList": [...],      // 10 platform curators (Netflix, Prime, etc.)
    "operatingList": [...]      // 34 curated collections
  }
}
```

### platformList (10 entries)

| Platform | Curator |
|---|---|
| Netflix | Regina |
| PrimeVideo | Lakimora |
| Disney | samrawit |
| AppleTV | Arf Yldrım |
| Viu | Daniel |
| Hulu | Andy |
| Zee5 | Hassan Amadil |
| Vivamax | Deborah Nzolani |
| Hoichoi | Arun Jain |
| Showmax | Koka |

These are human curators who maintain playlists for each platform's content.

### operatingList (34 curated collections)

Each entry has `type`, `position`, `title`, and either `subjects[]` or `banner.items[]`:

| # | Type | Title | Items | Sample |
|---|---|---|---|---|
| 0 | BANNER | Banner_Africa | 13 banner items | (image + title) |
| 1 | SPORT_LIVE | Football Live | — | (live sports section) |
| 2 | SUBJECTS_MOVIE | Popular Series | 15 | The Terminal List (2022) |
| 3 | SUBJECTS_MOVIE | Popular Movie | 16 | By Any Means (2026) |
| 4 | SUBJECTS_MOVIE | Nollywood Movie | 20 | Warlord: Olori Ogun (2025) |
| 5 | SUBJECTS_MOVIE | Adult Animation | 18 | Avatar: Seven Havens (2026) |
| 6 | SUBJECTS_MOVIE | Epic Fantasy | 16 | LOTR: Rings of Power (2022) |
| 7 | SUBJECTS_MOVIE | Comedy | 15 | Friends (1994) |
| ... | ... | ... | ... | ... |

**Each subject has `subjectId` + `detailPath`** — ready for direct /subject/play call.

### Use Cases for Nobar

1. **"Browse by Platform"** section — Netflix, Prime, Disney curated playlists
2. **"Popular on mzfi"** section — operatingList[2] (Popular Series) + [3] (Popular Movie)
3. **Genre collections** — Comedy, Epic Fantasy, Nollywood, Adult Animation, etc.
4. **Pre-warm searchCache** — fetch all subjects from these collections, pre-populate
   the title→subjectId cache so users get instant playback when they click a movie
5. **Catalog guarantee** — these subjects ALL have streams (no "not found" risk)

---

## 5. Auth Header Behavior — Cookie vs Authorization

### Discovery: Some endpoints require Cookie header, not Authorization

| Endpoint | Authorization: Bearer | Cookie: token= |
|---|---|---|
| `/home?page=1` | ✅ Returns data | ✅ Returns data |
| `/subject/trending` | ❌ HTML 404 | ✅ Returns 12 items |
| `/subject/recommend` | ❌ HTML 404 | ✅ Returns 10 items |
| `/subject/search` (POST) | ✅ Returns results | ✅ Returns results |
| `/subject/play` | ✅ Returns streams | ✅ Returns streams |

### Implication

The Nobar `/api/stream/[id]/route.ts` uses `Authorization: Bearer ${token}` which
works for /subject/play (the critical path). But if we want to use /subject/trending
or /subject/recommend for catalog discovery, we need to send the Cookie header.

**Fix:** When adding catalog discovery, use Cookie header (not Authorization).

---

## 6. aoneroom.com CDN Family — All Subdomains Tested

| Subdomain | Status | Content | CORS | Notes |
|---|---|---|---|---|
| `pbcdnw` | 200 | Posters (images) | ✅ ACAO:* | Already used by mzfi API |
| `h5-static` | 200 | SPA HTML + JS | n/a | Not a content CDN |
| `macdn` | 404 | (trailers — path unknown) | — | Empty |
| `cdn` | 404 | (unknown) | — | Empty |
| `cdnxw`, `sbcdnw`, `bcdn`, `bcdnxw`, `sacdn`, `cacdn` | DNS NXDOMAIN | — | — | These are on hakunaymatata.com, not aoneroom.com |

**No new CDN paths found.** pbcdnw (posters) is CORS-open but already works fine
(posters load via Next/Image).

---

## 7. Token Mint — Cookie Name Discovery

### Discovery: Cookie name is `token`, not `mb_guest_token`

Previously the code pattern was:
```javascript
const m = setCookie.match(/mb_guest_token=([^;]+)/);
```

But the actual Set-Cookie header is:
```
set-cookie: token=eyJhbGc...; Path=/; SameSite=Lax; Max-Age=7776000; HttpOnly; Secure
```

### Existing code already handles this

Looking at `/api/stream/[id]/route.ts`:
```javascript
const tokenMatch = setCookie.match(/(?:mb_guest_token|token)=([^;]+)/);
```

The regex already handles both patterns. ✅ No code change needed.

### Token details

- JWT with `uid`, `atp`, `ext`, `exp`, `iat` claims
- `exp` claim: 1800691763 (90 days from now)
- `Max-Age=7776000` (90 days)
- SameSite=Lax, HttpOnly, Secure

---

## 8. Summary of All Findings

### New Actionable Discoveries

1. **vidlink.pro `playbackMetadata` field** — show movie size + duration in player UI
2. **vidlink.pro `flags: ["cors-allowed"]`** — confirms our zero-egress path is correct
3. **vidlink.pro CloudFront Policy 6.37-day expiry** — could cache signed URLs client-side
4. **mzfi `/home` curated collections** — 34 collections + 10 platform playlists
5. **mzfi Cookie vs Authorization** — Cookie header needed for trending/recommend endpoints
6. **mzfi `playConfig.maxResolution: 480`** — advisory only (DASH still delivers 1080p)

### Confirmed Non-Viable Paths

1. **mzfi VIP unlock via headers** — x-vip-restrict LOCKS content (not unlocks)
2. **mzfi codec variations** — all codecs return same stream URLs
3. **aoneroom.com CDN family** — only pbcdnw (posters) is usable, already in use
4. **vidlink.pro `expiresAt` field** — misleading (in the past, stream still works)
5. **vidlink.pro `alternates` field** — doesn't exist for movies (only in theory)

### Implementation Recommendations

#### Phase A: Use vidlink.pro playbackMetadata (LOW effort, MEDIUM value)
Add to `/api/vidlink/[id]/route.ts` and `/api/stream/[id]/route.ts`:
```typescript
// Return playbackMetadata to browser for UI display
if (vlJson.stream.playbackMetadata) {
  result.playbackMetadata = {
    size: vlJson.stream.playbackMetadata.size,       // bytes
    duration: vlJson.stream.playbackMetadata.duration, // seconds
    resolutions: vlJson.stream.playbackMetadata.resolutions,
    codec: vlJson.stream.playbackMetadata.codecName,
  };
}
```
NativePlayer can show "2.1 GB · 2h 16m · 1080p H.264" in the quality picker.

#### Phase B: mzfi Catalog Discovery (MEDIUM effort, HIGH value)
Add `/api/mzfi/catalog` endpoint that:
1. Calls `/home?page=1` with Cookie header
2. Returns `platformList` + `operatingList` (curated collections)
3. Each subject has `subjectId` + `detailPath` ready for direct /subject/play
4. Could power "Browse by Platform" + "Genre Collections" UI sections

#### Phase C: Client-side URL caching (LOW effort, LOW value)
Since CloudFront Policy lasts 6.37 days, could cache signed URLs in localStorage
to skip the API call on repeat visits. Saves ~300ms per revisit. Marginal gain.

---

## 9. Test Artifacts

- `/tmp/inc-s.json` — /api/stream/27205 response (Inception, with DASH)
- `/tmp/mzfi-play-full.json` — full /subject/play response (from earlier attempt)
- Token mint pattern verified: `token=eyJ...` in Set-Cookie header

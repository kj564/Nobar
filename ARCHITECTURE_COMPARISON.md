# Architecture Comparison: idlix, moviebox, lk21, vidlink, Nobar

## Quick Answer

**Apakah ada yang sebenarnya cuma static web seperti Nobar?**
**TIDAK ADA.** Semua provider (idlix, moviebox, lk21, vidlink) punya backend
 dinamis. Nobar adalah satu-satunya yang static — dan bisa static karena
 ia MEMINJAM backend dari provider lain.

## Detailed Comparison

| Aspek | vidlink.pro | lk21 | idlix | moviebox/mzfi | **Nobar** |
|---|---|---|---|---|---|
| **Tipe** | API stream provider | Full pirate streaming site | Full pirate streaming site | API stream provider | **Aggregator (static)** |
| **Catalog** | ❌ Tidak ada (butuh TMDB ID) | ✅ WordPress (lk21official.fun) | ✅ WordPress (idlix.tv) | ✅ BFF API (wefeed-h5api-bff) | ✅ TMDB API (CORS-open) |
| **Stream URL gen** | sodium secretbox token | AES-256-GCM encrypted __PX + /api/pk key | vidhide embed iframe | Cookie/Bearer token auth | **Pinjam dari semua di atas** |
| **Video CDN** | sacdn (HLS), bcdn (MP4), cacdn (subs) | lowhls9.stream121.space (HLS) | vidhide.org (varies) | bcdnxw (MP4), sbcdnw (DASH) | **Langsung dari CDN provider** |
| **Catalog CORS?** | N/A (no catalog) | ❌ Tidak | ❌ Tidak (CF protected) | ✅ mzfi.me ACAO:* | ✅ TMDB ACAO:* |
| **Stream URL CORS?** | ❌ API CORS-blocked | ❌ /api/pk CORS-blocked | ❌ vidhide CORS-blocked | ❌ API needs Cookie | ✅ Nobar's cdn-proxy ACAO:* |
| **Video CDN CORS?** | ✅ sacdn ACAO:* | ✅ lowhls9 ACAO:* | ❌ vidhide varies | ❌ bcdnxw needs Referer | ✅ (langsung dari CDN provider) |
| **Server dibutuhkan?** | ✅ Ya (token mint) | ✅ Ya (catalog + key fetch) | ✅ Ya (CF bypass) | ✅ Ya (token auth) | ⚠️ Minimal (cdn-proxy untuk fetch yang CORS-blocked) |
| **Ads?** | Tidak (API only) | Ya (di embed page JS) | Ya (di vidhide) | Tidak (API only) | **Tidak** (skip ad execution) |
| **Static web?** | ❌ | ❌ | ❌ | ❌ | ✅ **YA** (GitHub Pages) |

## Architecture Diagrams

### vidlink.pro — API stream provider (no catalog)
```
Browser/Server → vidlink.pro/api/b/movie/{token}  (sodium token mint first)
              → JSON with HLS playlist URL + CloudFront cookie + MP4 sources + subtitles
              → sacdn.hakunaymatata.com (HLS .ts segments, CORS-open, CloudFront signed)
              → bcdn.hakunaymatata.com (MP4 files, blocks browser UA)
              → cacdn.hakunaymatata.com (subtitles, CORS-open)

Server needed: YES (token mint via sodium secretbox)
Video CDN: CORS-open (sacdn, cacdn) — browser plays directly
```

### lk21 — full pirate streaming site (vertical stack)
```
Browser → lk21official.fun (WordPress catalog, CORS-BLOCKED)
       → putarin.{biz|xyz}/e/{code} (embed page, CORS-BLOCKED)
         → window.__PX = {n, d} (AES-256-GCM encrypted player config)
       → putarin.{biz|xyz}/api/pk?n={n} (AES key, CORS-BLOCKED)
       → AES-256-GCM decrypt (client-side via WebCrypto in px.js)
       → /api/hls?t={JWT} (m3u8 playlist, CORS-OPEN, ACAO:*)
       → lowhls9.stream121.space (segments, CORS-OPEN, ACAO:*)

Server needed: YES (catalog + embed + key fetch all CORS-blocked)
Video CDN: CORS-open — browser plays directly
Ads: in the embed page JS (Clickadu/Galaksion) — skipped if you don't load the page
```

### idlix — full pirate streaming site (uses vidhide embeds)
```
Browser → idlix.tv (WordPress, CF "managed challenge" protected)
       → vidhide.org/embed/{id} (iframe embed, CORS-BLOCKED)
       → vidhide's own player (varies, usually needs Referer)

Server needed: YES (CF bypass for idlix.tv, vidhide stream extraction)
Video CDN: NOT directly accessible (vidhide anti-leech)
Ads: heavy (multiple popunders, popups, prerolls)
```

### moviebox/mzfi — API stream provider with own catalog
```
Browser → mzfi.me/wefeed-h5api-bff/* (BFF API, CORS-OPEN, ACAO:*)
         → needs Cookie token (from /home endpoint)
       → bcdnxw.hakunaymatata.com (MP4, Referer anti-leech)
       → sbcdnw.hakunaymatata.com (DASH, needs X-MB-Token)

Server needed: YES (Cookie auth for play API, Referer for CDN)
Video CDN: NOT directly accessible (anti-leech)
Ads: none in stream (API only, no embed page)
```

### Nobar — static aggregator (our approach)
```
Browser → TMDB API (CORS-open, direct, for catalog)
       → cdn-proxy (Bun :3003 dev / CF Worker prod)
         → vidlink.pro (token mint + resolve)
         → lk21official.fun + putarin.biz (AES decrypt)
         → bcdn.hakunaymatata.com (MP4 proxy, strips UA)
       → Video CDN DIRECTLY (sacdn/lowhls9/bcdnxw — whichever the resolved source uses)

Server needed: MINIMAL (cdn-proxy only for CORS-blocked fetches + crypto)
Video CDN: CORS-open (browser plays directly, zero proxy egress)
Ads: NONE (we skip all ad execution by not loading embed pages)
Static web?: YES (Next.js static export on GitHub Pages)
```

## Key Insight: Why Nobar Can Be Static

Nobar is static because it **offloads ALL dynamic work**:

1. **Catalog** → TMDB API (CORS-open, public key, browser calls directly)
2. **Stream resolution** → cdn-proxy (Bun in dev, Cloudflare Worker in prod)
   - Does: token minting, AES decryption, HTML scraping, CORS-bypass
   - Returns: a single CORS-open HLS/MP4 URL (~1KB JSON)
3. **Video streaming** → upstream CDN directly (browser ↔ CDN, zero proxy)

The cdn-proxy is the ONLY server Nobar needs, and it's a tiny 8KB-JSON
proxy — NOT a video proxy. All video bytes go directly from the provider's
CDN to the browser. This is why Nobar can be a static site.

## Can lk21 Be Fully Client-Side (No Server)?

**Theoretically YES**, because:
- The AES decryption uses WebCrypto (browser-native)
- The m3u8 + segments are CORS-open (browser plays directly)

**Practically NO**, because:
- lk21official.fun (catalog) → CORS-blocked (no ACAO header)
- putarin.biz embed page → CORS-blocked (no ACAO header)
- putarin.biz /api/pk (AES key) → CORS-blocked (no ACAO header)

To do it client-side, you'd need a **public CORS proxy** (corsproxy.io,
allorigins.win, codetabs.com). But as of 2025, ALL of these are either:
- Dead (timeout)
- Rate-limited (429)
- Require API keys (401)

So in practice, lk21 resolution REQUIRES your own server (or a Cloudflare
Worker, which is what Nobar uses in production).

## "Terapkan pendekatan lk21" — what we did

lk21's approach = AES-256-GCM encrypted player config + per-request key
fetch + client-side WebCrypto decryption.

We applied this pattern in two places:
1. **Server-side** (cdn-proxy, primary): the Bun worker fetches the CORS-
   blocked endpoints, does AES decryption server-side, returns plain HLS URL.
2. **Client-side** (lk21-client.ts, fallback): if cdn-proxy is unreachable
   (e.g. GitHub Pages + CF Worker down), the browser tries public CORS
   proxies + does AES decryption via WebCrypto. This is lk21's EXACT
   approach replicated in our code.

The client-side path is unreliable (CORS proxies are dead), but the
architecture is there for when a working proxy becomes available.

# 🚀 Deploy Cloudflare Worker — 5 menit, GRATIS

## Hasil setelah deploy
- ✅ Native Nobar player (bukan iframe)
- ✅ ZERO Vercel egress (video bypasses Vercel)
- ✅ GRATIS selamanya (Cloudflare Worker free tier: 100k req/day, unlimited BW)
- ✅ 6.5x lebih cepat (133 MB/s vs Vercel 8.7 MB/s)

---

## Step 1: Buat akun Cloudflare (gratis)

1. Buka https://dash.cloudflare.com/sign-up
2. Daftar dengan email + password
3. (Tidak perlu add domain — Worker jalan tanpa domain sendiri)

## Step 2: Install Wrangler CLI

```bash
npm install -g wrangler
```

Atau kalau pakai bun:
```bash
bun add -g wrangler
```

## Step 3: Login ke Cloudflare

```bash
wrangler login
```

Browser akan terbuka → klik "Allow" → terminal menampilkan "Successfully logged in"

## Step 4: Deploy Worker

```bash
cd /home/z/nobar-backup/mini-services/cdn-proxy
wrangler deploy
```

Output:
```
Uploaded nobar-cdn-proxy (1.04 sec)
Deployed nobar-cdn-proxy triggers (0.66 sec)
  https://nobar-cdn-proxy.<your-subdomain>.workers.dev
```

**Catat URL Worker** (misal: `https://nobar-cdn-proxy.abc123.workers.dev`)

## Step 5: Test Worker

```bash
# Test health
curl https://nobar-cdn-proxy.<your-subdomain>.workers.dev/test
# → {"ok":true,"message":"Nobar CDN Proxy is running",...}

# Test outbound fetch
curl https://nobar-cdn-proxy.<your-subdomain>.workers.dev/fetch-test
# → {"ok":true,"status":200,...}

# Test video CDN fetch (1MB)
curl -o /dev/null -w "Status: %{http_code} | Speed: %{speed_download}b/s\n" \
  -H "Range: bytes=0-1048575" \
  "https://nobar-cdn-proxy.<your-subdomain>.workers.dev/?url=https%3A%2F%2Fbcdnxw.hakunaymatata.com%2Fresource%2F82c7e4836f749ab74b76c0000bcd1356.mp4%3Fsign%3Dtest%26t%3D1"
```

## Step 6: Set env var di Vercel

1. Buka https://vercel.com/nobar-stream/settings/environment-variables
   (atau: Vercel Dashboard → Nobar project → Settings → Environment Variables)
2. Add new:
   - **Key**: `CDN_PROXY_URL`
   - **Value**: `https://nobar-cdn-proxy.<your-subdomain>.workers.dev`
   - **Environment**: Production (+ Preview kalau mau test)
3. Click Save

## Step 7: Redeploy Nobar

```bash
cd /home/z/nobar-backup
git commit --allow-empty -m "trigger redeploy for CDN_PROXY_URL"
git push
```

Atau manual: Vercel Dashboard → Nobar → Deployments → Redeploy

## Step 8: Verify

Buka https://nobar-stream.vercel.app/movie/jurassic-world-2015-135397

Cek Network tab (F12) → filter "hakunaymatata":
- ❌ SEBELUM: `GET /api/proxy?url=hakunaymatata...` (via Vercel)
- ✅ SESUDAH: `GET nobar-cdn-proxy.workers.dev/?url=hakunaymatata...` (via Cloudflare)

---

## Troubleshooting

### Worker returns 427 Forbidden
Temp account limitation. Use REAL Cloudflare account (free signup).

### Worker returns 429
CDN rate-limiting. Worker sudah auto-retry dengan minimal headers.
Kalau masih 429, coba beberapa menit lagi (CDN cooldown).

### Video tidak muncul di Nobar
- Cek `CDN_PROXY_URL` env var sudah diset di Vercel (Production environment)
- Cek Worker URL benar (https://...workers.dev, tanpa trailing slash)
- Redeploy Nobar setelah set env var

### Test Worker manual
```bash
# Health check
curl https://nobar-cdn-proxy.<sub>.workers.dev/test

# Fetch test (cek outbound fetch works)
curl https://nobar-cdn-proxy.<sub>.workers.dev/fetch-test
```

---

## Cost Comparison

| Method | Cost | Bandwidth | Speed |
|--------|------|-----------|-------|
| Vercel proxy (default) | $20/month | 1TB egress | 8.7 MB/s |
| **Cloudflare Worker** | **$0** | **unlimited** | **133 MB/s** |

Cloudflare Worker free tier:
- 100,000 requests/day (cukup untuk ~500 movie views/day)
- UNLIMITED bandwidth
- 300+ edge POPs worldwide

Kalau traffic > 100k req/day:
- Workers Paid: $5/month untuk 10M requests
- Tetap unlimited bandwidth
- Masih jauh lebih murah dari Vercel Pro ($20/month)

---

## Architecture

```
TANPA CDN_PROXY_URL (default):
  Browser → Vercel /api/proxy → CDN (Vercel egress = ~2GB/movie)

DENGAN CDN_PROXY_URL (Cloudflare Worker):
  Browser → Cloudflare Worker → CDN (Vercel egress = 0, GRATIS)
```

Worker injects correct headers per CDN:
- **mzfi** (bcdnxw): `Referer: mzfi.me` + browser User-Agent
- **vidlink** (bcdn): NO User-Agent (Worker default works), NO Referer
- **DASH** (sbcdnw): `Referer: movieboxhd.net` + `X-MB-Token` header
- **Subtitles** (cacdn): no special headers (public CDN)

Edge cache: 24hr TTL (cacheEverything: true) → repeat requests instant.

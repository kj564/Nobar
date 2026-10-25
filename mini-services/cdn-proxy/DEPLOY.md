# Nobar CDN Proxy — Deployment Guide

## Why?

Nobar's native video player streams through a server proxy (to inject
Referer/User-Agent headers required by CDN anti-leech). This proxy
consumes server bandwidth (~2GB per movie view).

By deploying a FREE Cloudflare Worker or Deno Deploy proxy, you get:
- **ZERO Vercel egress** (video bypasses Vercel entirely)
- **Unlimited bandwidth** (Cloudflare/Deno free tier)
- **6.5x faster** (300+ edge POPs, tested at 133 MB/s)
- **Native player** (NOT iframe embed — keeps Nobar's UI)

## Option 1: Cloudflare Worker (RECOMMENDED — free, unlimited)

### Prerequisites
- Free Cloudflare account (sign up at cloudflare.com)
- Node.js + npm installed

### Steps
```bash
# 1. Install wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare (opens browser)
wrangler login

# 3. Navigate to proxy directory
cd mini-services/cdn-proxy

# 4. Deploy
wrangler deploy

# 5. Get your Worker URL (output shows):
#    https://nobar-cdn-proxy.<your-subdomain>.workers.dev
```

### Configure Nobar
In your Vercel project settings → Environment Variables:
```
CDN_PROXY_URL = https://nobar-cdn-proxy.<your-subdomain>.workers.dev
```

Redeploy Nobar. Done! Video now streams through Cloudflare (free, unlimited).

## Option 2: Deno Deploy (alternative — free, 1M req/month)

### Steps
```bash
# 1. Install Deno
curl -fsSL https://deno.land/install.sh | sh

# 2. Login to Deno Deploy (opens browser)
deno run --allow-net https://deno.land/x/deployctl@1.12.0/deployctl.ts login

# 3. Deploy
deno run --allow-all https://deno.land/x/deployctl@1.12.0/deployctl.ts deploy \
  --project=nobar-cdn-proxy \
  --entrypoint=mini-services/cdn-proxy/deno/proxy.ts
```

### Configure Nobar
```
CDN_PROXY_URL = https://nobar-cdn-proxy.deno.dev
```

## Cost Comparison

| Method | Cost | Bandwidth | Speed |
|--------|------|-----------|-------|
| Vercel proxy (default) | $20/month | 1TB egress | 8.7 MB/s |
| Cloudflare Worker | **$0** | **unlimited** | **133 MB/s** |
| Deno Deploy | **$0** | 1M req/month | **133 MB/s** |

## How It Works

```
Without CDN_PROXY_URL:
  Browser → Vercel /api/proxy → CDN (Vercel egress = ~2GB/movie)

With CDN_PROXY_URL:
  Browser → Cloudflare Worker → CDN (Vercel egress = 0)
```

The Worker injects the correct headers per CDN:
- mzfi (bcdnxw): `Referer: mzfi.me` + browser User-Agent
- vidlink (bcdn): NO User-Agent (Worker default works), NO Referer
- DASH (sbcdnw): `Referer: movieboxhd.net` + `X-MB-Token` header
- Subtitles (cacdn): no special headers (public CDN)

## Fallback

If CDN_PROXY_URL is not set, Nobar automatically uses Vercel's built-in
/api/proxy. No code changes needed — just set the env var when ready.

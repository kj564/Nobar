# bcdnxw-proxy

Tiny proxy that adds `Referer: https://mzfi.me/` to bcdnxw.hakunaymatata.com requests.

## Why?

bcdnxw requires `Referer: mzfi.me` (anti-leech). Browser can't set Referer (forbidden header). CF Worker IP is blocked by bcdnxw (427). This proxy runs on non-CF IP → bcdnxw accepts → 206.

## Deploy to fly.io (free tier)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login + create app
fly launch --no-deploy

# Deploy
fly deploy

# Set app URL in Nobar:
# NEXT_PUBLIC_BCDNXW_PROXY_URL=https://your-app.fly.dev
```

## Deploy to Render (free tier)

1. Fork repo
2. New Web Service → connect repo
3. Build: `bun install`
4. Start: `bun index.ts`
5. URL: `https://your-app.onrender.com`

## Usage

```
GET https://your-proxy/?url={encoded_bcdnxw_url}
→ 206, video/mp4, CORS-open
```

#!/bin/bash
# Deploy CDN proxy to Cloudflare Workers
# Prerequisites:
#   1. npm install -g wrangler
#   2. wrangler login (one-time)
#
# Usage: ./deploy.sh

set -e

cd "$(dirname "$0")"

echo "=== Building CDN proxy ==="
bun install

echo "=== Deploying to Cloudflare Workers ==="
npx wrangler deploy

echo "=== Done! ==="
echo "Set NEXT_PUBLIC_CDN_PROXY_URL to the Worker URL shown above."
echo "Add it to GitHub repo Settings → Secrets → Actions."

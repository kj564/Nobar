# Deploy MP4 proxy to Deno Deploy
#
# Why Deno Deploy (not Cloudflare Worker)?
#   bcdn.hakunaymatata.com (vidlink MP4 CDN) blocks Cloudflare Worker headers:
#     Cf-Worker, Cdn-Loop, Cf-Ew-Via → HTTP 427
#   Deno Deploy doesn't add any of these headers → bcdn accepts!
#
# This is ONLY for the MP4 fallback path (rare — most movies have HLS via
# vidlink or lk21). The main app stays on Cloudflare.
#
# Deploy command (requires deno + deployctl):
#   deployctl deploy --project=nobar-mp4-proxy --entrypoint=deno.ts
#
# Or via GitHub Actions (auto-deploy on push):
#   See .github/workflows/deploy-deno-mp4.yml
#
# Production URL: https://nobar-mp4-proxy.deno.dev
# Usage: https://nobar-mp4-proxy.deno.dev/mp4?url={encoded_bcdn_url}

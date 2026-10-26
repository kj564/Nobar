import type { NextConfig } from "next";

// BUILD_STATIC=true → static export for GitHub Pages (no dev server, no rewrites).
// Otherwise → local dev server with rewrites that proxy cdn-proxy paths to :3003.
const isBuild = process.env.BUILD_STATIC === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isBuild ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  typescript: {
    ignoreBuildErrors: true,
  },
  // Dev-only rewrites: forward cdn-proxy paths to the Bun mini-service on :3003.
  // In static-export mode these are ignored (the browser calls CDN_PROXY_URL instead,
  // set via NEXT_PUBLIC_CDN_PROXY_URL — points to the Cloudflare Worker in prod).
  // lk21-resolver is merged INTO cdn-proxy (same process, same port) so /lk21/*
  // routes there too.
  ...(!isBuild
    ? {
        async rewrites() {
          return [
            { source: "/vidlink/:path*", destination: "http://localhost:3003/vidlink/:path*" },
            { source: "/idlix/:path*", destination: "http://localhost:3003/idlix/:path*" },
            { source: "/mzfi/:path*", destination: "http://localhost:3003/mzfi/:path*" },
            { source: "/mp4", destination: "http://localhost:3003/mp4" },
            { source: "/mzfi-play", destination: "http://localhost:3003/mzfi-play" },
            { source: "/lk21/:path*", destination: "http://localhost:3003/lk21/:path*" },
            { source: "/subtitle", destination: "http://localhost:3003/subtitle" },
          ];
        },
      }
    : {}),
};

export default nextConfig;

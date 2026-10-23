import type { NextConfig } from "next";

// Dynamic rendering (Netflix-Clone technique) — no static export.
// Deploy to Vercel for dynamic routes (endless movies, no pre-render).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

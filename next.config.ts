import type { NextConfig } from "next";

// Static export for GitHub Pages — only during build.
// In dev mode, use the standard Next.js server (dynamic routes).
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
};

export default nextConfig;

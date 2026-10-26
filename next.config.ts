import type { NextConfig } from "next";

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

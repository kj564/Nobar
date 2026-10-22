import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export — output goes to ./out/
  // Required for GitHub Pages deployment (Pages serves static files only).
  output: "export",

  // GitHub Pages serves the site at https://kj564.github.io/Nobar/
  // so every internal asset needs the /Nobar prefix.
  basePath: "/Nobar",
  assetPrefix: "/Nobar/",
  trailingSlash: true,

  // Next.js Image optimization needs a server runtime; not available on
  // GitHub Pages. Disable it — we use plain <img> tags anyway.
  images: {
    unoptimized: true,
  },

  reactStrictMode: true,
};

export default nextConfig;

import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://nobar-stream.vercel.app"),
  title: "Nobar — Streaming Film Indie",
  description:
    "Platform streaming film indie Indonesia. Katalog dari TMDB, multi-server, gratis. Dibuat untuk pembelajaran web development.",
  keywords: ["film", "streaming", "indie", "indonesia", "nobar"],
  authors: [{ name: "Nobar" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/manifest.webmanifest`,
  openGraph: {
    title: "Nobar — Streaming Film Indie",
    description:
      "Platform streaming film indie Indonesia. Katalog dari TMDB, multi-server, gratis. Dibuat untuk pembelajaran web development.",
    siteName: "Nobar",
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nobar — Streaming Film Indie",
    description:
      "Platform streaming film indie Indonesia. Katalog dari TMDB, multi-server, gratis.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        {/* Preconnect to CDNs used on every page for faster TTFB */}
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.themoviedb.org" />
        <link rel="preconnect" href="https://nobar-cdn-proxy.ukhelda.workers.dev" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://sacdn.hakunaymatata.com" />
        <link rel="dns-prefetch" href="https://lowhls9.stream121.space" />
        <link rel="dns-prefetch" href="https://cacdn.hakunaymatata.com" />
        <script
          src="https://tags.adplox.com/p.js?z=pfntggc9kw"
          async
        />
      </head>
      <body className="font-sans antialiased selection:bg-brand-500/40">
        {children}
      </body>
    </html>
  );
}

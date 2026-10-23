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

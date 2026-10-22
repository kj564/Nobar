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
  title: "Nobar — Streaming Film Indie",
  description:
    "Platform streaming film indie Indonesia. Katalog dari TMDB, multi-server, gratis. Dibuat untuk pembelajaran web development.",
  keywords: ["film", "streaming", "indie", "indonesia", "nobar"],
  authors: [{ name: "Nobar" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="font-sans antialiased selection:bg-brand-500/40">
        {children}
      </body>
    </html>
  );
}

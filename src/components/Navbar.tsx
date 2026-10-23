"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Film, Tv, Search, Menu, X } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  matchPath: (p: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home, matchPath: (p) => p === "/" },
  { label: "Movies", href: "/movie/", icon: Film, matchPath: (p) => p.startsWith("/movie") },
  { label: "TV Series", href: "/series/", icon: Tv, matchPath: (p) => p.startsWith("/series") },
];

// Pages with full-bleed hero/backdrop where navbar should start transparent
// and turn solid on scroll. All other pages (listing, search) get solid navbar
// from the top — otherwise the transparent navbar floats awkwardly over
// plain content with no backdrop to blend into.
const HERO_PAGES = ["/", "/movie/", "/series/"];

function isHeroPage(pathname: string): boolean {
  // Movie/series detail pages: /movie/{slug}, /series/{slug}
  if (pathname.startsWith("/movie/") && pathname !== "/movie/") return true;
  if (pathname.startsWith("/series/") && pathname !== "/series/") return true;
  return HERO_PAGES.includes(pathname);
}

export function Navbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const hasHero = isHeroPage(pathname);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Navbar background logic:
  // - Non-hero pages (listing/search): always solid from top
  // - Hero pages: transparent gradient at top → solid on scroll
  const solidBg = !hasHero || scrolled;

  return (
    <header
      id="header"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        solidBg
          ? "bg-ink-950/95 backdrop-blur-md border-b border-white/5"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      }`}
    >
      <div className="max-w-[1520px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo + Nav links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center flex-shrink-0 group" aria-label="Nobar home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo/nobar-horizontal-white.svg"
                alt="Nobar"
                className="h-7 w-auto transition-transform group-hover:scale-105"
                onError={(e) => {
                  // Fallback to PNG if SVG fails
                  (e.currentTarget as HTMLImageElement).src = "/logo/nobar-horizontal-white.png";
                }}
              />
            </Link>

            {/* Desktop nav — idlixku style: text links with active underline */}
            <nav className="hidden md:flex items-center gap-6">
              {NAV_ITEMS.map((item) => {
                const isActive = item.matchPath(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`relative flex items-center gap-2 text-sm font-semibold transition-colors py-2 ${
                      isActive
                        ? "text-brand-400"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: search + actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/search"
              className="text-gray-300 hover:text-white transition p-2 rounded-full hover:bg-white/5"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Link>
            {children}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-gray-300 hover:text-white transition p-2 rounded-lg hover:bg-white/5"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu drawer (idlixku slide-down) */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-ink-950/98 backdrop-blur-md border-b border-white/5 shadow-2xl">
          <nav className="max-w-[1520px] mx-auto px-4 sm:px-6 py-4 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.matchPath(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                    isActive
                      ? "bg-brand-500/15 text-brand-400 border-l-2 border-brand-500"
                      : "text-gray-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

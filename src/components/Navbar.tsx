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
  { label: "Beranda", href: "/", icon: Home, matchPath: (p) => p === "/" },
  { label: "Film", href: "/movie/", icon: Film, matchPath: (p) => p.startsWith("/movie") },
  { label: "Serial TV", href: "/series/", icon: Tv, matchPath: (p) => p.startsWith("/series") },
];

// Pages with full-bleed hero/backdrop where navbar starts transparent.
// Non-hero pages (listing/search) get solid navbar from top.
const HERO_PAGES = ["/", "/movie/", "/series/"];

function isHeroPage(pathname: string): boolean {
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

  // idlixku pattern:
  // - Non-hero pages: solid bar from top (always readable)
  // - Hero pages at top: transparent (over hero backdrop)
  // - Hero pages scrolled: floating pill bar (rounded, shadow, backdrop-blur)
  const solidBg = !hasHero || scrolled;

  return (
    <header
      id="header"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled && hasHero
          ? "py-2" // floating pill — shrink container padding
          : "py-0"
      }`}
    >
      <div
        className={`max-w-[1520px] mx-auto px-3 sm:px-5 transition-all duration-300 ${
          scrolled && hasHero ? "px-4 sm:px-6" : ""
        }`}
      >
        <div
          className={`flex items-center justify-between h-14 lg:h-16 transition-all duration-300 ${
            scrolled && hasHero
              ? // Floating pill bar (idlixku scrolled state)
                "bg-black/95 backdrop-blur-md saturate-135 border border-white/10 rounded-full px-4 shadow-2xl shadow-black/50"
              : solidBg
                ? // Solid bar (non-hero pages)
                  "bg-ink-950/95 backdrop-blur-md border-b border-white/5"
                : // Transparent (hero pages at top)
                  "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          }`}
        >
          {/* Left: Logo + Nav links */}
          <div className="flex items-center gap-6 lg:gap-8 flex-1 min-w-0">
            <Link
              href="/"
              className="flex items-center flex-shrink-0 group"
              aria-label="Nobar home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src=`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo/nobar-horizontal-white.svg"
                alt="Nobar"
                className="h-5 lg:h-6 w-auto transition-transform group-hover:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo/nobar-horizontal-white.png";
                }}
              />
            </Link>

            {/* Desktop nav — idlixku PILL style (border-radius: 999px) */}
            <nav
              className="hidden md:flex items-center gap-1 flex-1 min-w-0"
              aria-label="Menu"
            >
              {NAV_ITEMS.map((item) => {
                const isActive = item.matchPath(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? // Active: primary color text + tinted bg (idlixku: color-mix 14%)
                          "bg-brand-500/15 text-brand-400"
                        : // Inactive: white text, icon opacity 0.7
                          "text-white hover:bg-white/10"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${
                        isActive ? "opacity-100" : "opacity-70"
                      }`}
                    />
                    <span className="[text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: search + actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              href="/search"
              className="min-h-[36px] inline-flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/10 transition"
              aria-label="Search"
            >
              <Search className="w-5 h-5 opacity-80 hover:opacity-100" />
            </Link>
            {children}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden min-h-[36px] inline-flex items-center justify-center w-9 h-9 rounded-full text-white hover:bg-white/10 transition"
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
          <nav className="max-w-[1520px] mx-auto px-3 sm:px-5 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.matchPath(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition ${
                    isActive
                      ? "bg-brand-500/15 text-brand-400"
                      : "text-white hover:bg-white/10"
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

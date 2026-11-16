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

  // Apple HIG + Liquid Glass:
  // - Non-hero pages: glass-regular bar from top (always readable)
  // - Hero pages at top: transparent over hero backdrop
  // - Hero pages scrolled: floating pill bar (rounded, glass-regular, shadow)
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
        className={`scroll-edge-top max-w-[1520px] mx-auto px-3 sm:px-5 transition-all duration-300 ${
          scrolled && hasHero ? "px-4 sm:px-6" : ""
        }`}
      >
        <div
          className={`flex items-center justify-between h-14 lg:h-16 transition-all duration-300 ${
            solidBg
              ? scrolled && hasHero
                ? // Floating pill bar (scrolled on hero)
                  "glass-regular rounded-full px-4 shadow-2xl shadow-black/50"
                : // Solid glass bar (non-hero pages, or hero scrolled non-pill)
                  "glass-regular"
              : // Transparent over hero backdrop
                "bg-transparent"
          }`}
        >
          {/* Left: Logo + Nav links */}
          <div className="flex items-center gap-6 lg:gap-8 flex-1 min-w-0">
            <Link
              href="/"
              className="touch-target flex-shrink-0 group"
              aria-label="Nobar home"
            >
              {/* Nobar text wordmark — SF Pro Display 800, -0.04em tracking */}
              <span
                className="text-white text-xl lg:text-2xl leading-none font-extrabold tracking-[-0.04em] transition-transform group-hover:scale-105"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Nobar
              </span>
            </Link>

            {/* Desktop nav — Apple HIG pill buttons with glass-clear on hover/active */}
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
                    className={`touch-target group relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                      isActive ? "text-white" : "text-white/80 hover:text-white"
                    }`}
                  >
                    {/* glass-clear background layer — visible on hover or when active */}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-full glass-clear transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                    <Icon
                      className={`relative w-4 h-4 flex-shrink-0 transition-opacity ${
                        isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                      }`}
                    />
                    <span className="relative [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: search + actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              href="/search"
              className="touch-target group relative inline-flex items-center justify-center rounded-full text-white transition-colors"
              aria-label="Search"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full glass-clear opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              <Search className="relative w-5 h-5 opacity-80 transition-opacity group-hover:opacity-100" />
            </Link>
            {children}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="touch-target md:hidden group relative inline-flex items-center justify-center rounded-full text-white transition-colors"
              aria-label="Menu"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full glass-clear opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              />
              {mobileMenuOpen ? (
                <X className="relative w-5 h-5" />
              ) : (
                <Menu className="relative w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu drawer — Apple HIG glass-regular sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 glass-regular shadow-2xl">
          <nav className="max-w-[1520px] mx-auto px-3 sm:px-5 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.matchPath(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`touch-target group relative inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold transition-colors ${
                    isActive ? "text-white" : "text-white/80 hover:text-white"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute inset-0 rounded-full glass-clear transition-opacity duration-200 ${
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                  <Icon className="relative w-4 h-4 flex-shrink-0" />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

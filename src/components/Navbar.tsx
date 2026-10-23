"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play, Home, Film, Tv, Search } from "lucide-react";

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

export function Navbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header
      id="header"
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-transparent"
    >
      <div className="max-w-[1520px] mx-auto px-3 sm:px-5">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo + Nav links */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-all group-hover:scale-105">
                <Play className="w-5 h-5 fill-white" />
              </div>
              <span className="text-xl font-black uppercase tracking-tighter text-white font-display">
                No<span className="text-brand-500">bar</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.matchPath(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`nav-pill flex items-center gap-2 px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "active"
                        : "text-gray-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: search icon → /search page */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/search"
              className="text-gray-300 hover:text-white transition p-2"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Link>
            {children}
          </div>
        </div>
      </div>
    </header>
  );
}

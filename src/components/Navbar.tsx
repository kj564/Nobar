"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play, Home, Film, Tv } from "lucide-react";

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

// Shared Navbar — IDLIX pill style (template match).
// Left: logo + pill nav links with icons + dynamic active state.
// Right: optional children (search box, back button, etc.)
export function Navbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header
      id="header"
      className="fixed top-0 inset-x-0 z-40 transition-all duration-300"
    >
      <nav className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left: Logo + Nav pills (IDLIX style) */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
              <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition">
                <Play className="w-5 h-5 fill-white" />
              </div>
              <span className="font-display text-xl font-extrabold tracking-tighter uppercase">
                No<span className="text-brand-500">bar</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-2">
              {NAV_ITEMS.map((item) => {
                const isActive = item.matchPath(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition ${
                      isActive
                        ? "bg-brand-500/20 text-brand-500 hover:bg-brand-500/30"
                        : "text-gray-300 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: optional children */}
          {children && (
            <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
          )}
        </div>
      </nav>
    </header>
  );
}

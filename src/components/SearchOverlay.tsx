"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, X, TrendingUp, Film, Tv } from "lucide-react";
import {
  searchMovies,
  buildMovieSlug,
  type TMDBMovie,
  type TMDBPaged,
} from "@/lib/tmdb";

type SearchOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  trendingMovies: TMDBMovie[];
};

export function SearchOverlay({ isOpen, onClose, trendingMovies }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTrending, setShowTrending] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setShowTrending(true);
    }
  }, [isOpen]);

  // Lock scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setShowTrending(true);
      return;
    }
    setLoading(true);
    setShowTrending(false);
    try {
      const data: TMDBPaged<TMDBMovie> = await searchMovies(q, 1);
      setResults(data.results || []);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => doSearch(value), 350);
  };

  const handlePick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-ink-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search movies, series..."
            className="flex-1 bg-transparent outline-none text-white text-base placeholder-gray-500"
            autoComplete="off"
          />
          {loading && (
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-brand-500 animate-spin flex-shrink-0" />
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1"
            aria-label="Close search"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Trending suggestions (when no query) */}
          {showTrending && trendingMovies.length > 0 && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3 px-2">
                <TrendingUp className="w-4 h-4 text-brand-500" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Trending
                </span>
              </div>
              <ul>
                {trendingMovies.slice(0, 10).map((m, i) => {
                  const title = m.title || m.name || "Untitled";
                  const isMovie = Boolean(m.title);
                  return (
                    <li key={m.id}>
                      <Link
                        href={isMovie ? `/movie/${buildMovieSlug(m)}` : `/series/${buildMovieSlug(m)}`}
                        onClick={handlePick}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white/5 transition group"
                      >
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          i === 0 ? "bg-brand-500 text-white" : "bg-white/10 text-gray-400"
                        }`}>
                          {i + 1}
                        </span>
                        {isMovie ? <Film className="w-3.5 h-3.5 text-gray-500" /> : <Tv className="w-3.5 h-3.5 text-gray-500" />}
                        <span className="text-sm text-gray-200 group-hover:text-white flex-1 truncate">
                          {title}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                          {isMovie ? "Movie" : "TV"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Search results */}
          {!showTrending && results.length > 0 && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Results for &ldquo;{query}&rdquo;
                </span>
                <span className="text-xs text-gray-600">({results.length})</span>
              </div>
              <ul>
                {results.map((m, i) => {
                  const title = m.title || m.name || "Untitled";
                  const isMovie = Boolean(m.title);
                  return (
                    <li key={m.id}>
                      <Link
                        href={isMovie ? `/movie/${buildMovieSlug(m)}` : `/series/${buildMovieSlug(m)}`}
                        onClick={handlePick}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-white/5 transition group"
                      >
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-white/10 text-gray-400">
                          {i + 1}
                        </span>
                        {isMovie ? <Film className="w-3.5 h-3.5 text-gray-500" /> : <Tv className="w-3.5 h-3.5 text-gray-500" />}
                        <span className="text-sm text-gray-200 group-hover:text-white flex-1 truncate">
                          {title}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {m.release_date ? String(m.release_date).slice(0, 4) : "—"}
                        </span>
                        <span className="text-[10px] text-yellow-500 font-semibold">
                          {m.vote_average ? m.vote_average.toFixed(1) : "—"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* No results */}
          {!showTrending && !loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400">No results found for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* Empty state (no query, no trending) */}
          {showTrending && trendingMovies.length === 0 && (
            <div className="p-8 text-center">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Start typing to search...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

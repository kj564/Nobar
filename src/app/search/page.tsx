"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Film, Tv, Star, ArrowLeft } from "lucide-react";
import {
  buildMovieSlug,
  buildSeriesSlug,
  type TMDBMovie,
  type TMDBSeries,
  type TMDBPaged,
} from "@/lib/tmdb";
import { Navbar } from "@/components/Navbar";
import { MovieCard, SeriesCard } from "@/components/MovieCard";

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery) doSearch(initialQuery, 1, false);
  }, []);

  // Update URL when query changes
  const updateUrl = (q: string) => {
    if (q.trim()) {
      router.replace(`/search?q=${encodeURIComponent(q.trim())}`);
    } else {
      router.replace("/search");
    }
  };

  const doSearch = async (q: string, targetPage: number, append: boolean) => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&page=${targetPage}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data: TMDBPaged<TMDBMovie> = await res.json();
      if (append) {
        setResults((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          return [...prev, ...data.results.filter((m) => !existing.has(m.id))];
        });
      } else {
        setResults(data.results || []);
      }
      setPage(data.page || targetPage);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleInput = (value: string) => {
    setQuery(value);
    updateUrl(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (value.trim().length >= 1) {
        doSearch(value, 1, false);
      } else {
        setResults([]);
      }
    }, 350);
  };

  const loadMore = () => doSearch(query, page + 1, true);

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      <Navbar />

      {/* Search header */}
      <div className="pt-24 px-3 sm:px-5 max-w-[1520px] mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Search</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Search movies, series..."
              className="w-full bg-ink-800 border border-white/10 rounded-xl pl-12 pr-12 py-3.5 text-white text-base placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition"
              autoComplete="off"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  updateUrl("");
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Results info */}
        {query.trim() && !loading && (
          <p className="text-sm text-gray-400 mb-4">
            {results.length > 0
              ? `Showing results for "${query}" (${results.length})`
              : `No results for "${query}"`}
          </p>
        )}
      </div>

      {/* Results grid */}
      <main className="flex-1 px-3 sm:px-5 max-w-[1520px] mx-auto w-full pb-12">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-white/5">
                <div className="skeleton aspect-[2/3]"></div>
                <div className="p-2">
                  <div className="skeleton h-3 rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((m) =>
                m.media_type === "tv" ? (
                  <SeriesCard key={`tv-${m.id}`} series={m as TMDBSeries} />
                ) : (
                  <MovieCard key={`mv-${m.id}`} movie={m} />
                )
              )}
            </div>
            {page < totalPages && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm font-semibold transition disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        ) : !query.trim() ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Start typing to search for movies and series</p>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-[1520px] mx-auto px-3 sm:px-5 text-center">
          <p className="text-xs text-gray-500">© 2025 Nobar Project</p>
        </div>
      </footer>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-950" />}>
      <SearchContent />
    </Suspense>
  );
}

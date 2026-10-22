"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Play, X } from "lucide-react";
import {
  fetchTrendingTV,
  type TMDBSeries,
  type TMDBPaged,
} from "@/lib/tmdb";
import { SeriesCard } from "@/components/MovieCard";

export default function SeriesListingPage() {
  const [series, setSeries] = useState<TMDBSeries[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (targetPage: number, append: boolean) => {
    if (!append) {
      setLoading(true);
      setSeries([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const data: TMDBPaged<TMDBSeries> = await fetchTrendingTV(targetPage);
      if (append) {
        setSeries((prev) => {
          const existing = new Set(prev.map((s) => s.id));
          return [...prev, ...data.results.filter((s) => !existing.has(s.id))];
        });
      } else {
        setSeries(data.results || []);
      }
      setPage(data.page || targetPage);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage(1, false);
  }, [loadPage]);

  const loadMore = () => loadPage(page + 1, true);

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-ink-950/80 border-b border-white/5">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
                <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition">
                  <Play className="w-5 h-5 fill-white" />
                </div>
                <span className="font-display text-xl font-extrabold tracking-tight">
                  No<span className="text-brand-500">bar</span>
                </span>
              </Link>
              <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-300">
                <Link href="/" className="px-3 py-2 hover:text-white transition">Home</Link>
                <Link href="/movie/" className="px-3 py-2 hover:text-white transition">Movies</Link>
                <Link href="/series/" className="px-3 py-2 text-white border-b-2 border-brand-500">
                  TV Series
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Body */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold">TV Series</h1>
          <p className="text-sm text-gray-400 mt-1">
            Serial TV trending minggu ini — drama, animasi, dan banyak lagi.
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-white/5">
                <div className="skeleton aspect-video"></div>
                <div className="p-3 space-y-2">
                  <div className="skeleton h-3 rounded w-3/4"></div>
                  <div className="skeleton h-2 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/15 text-brand-400 mb-3">
              <X className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-white">Gagal memuat series</h3>
            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">{error}</p>
            <button
              onClick={() => loadPage(1, false)}
              className="mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded text-sm font-semibold"
            >
              Coba lagi
            </button>
          </div>
        ) : series.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Belum ada series tersedia.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {series.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        )}

        {/* Load more */}
        {!loading && !error && page < totalPages && (
          <div className="flex flex-col items-center gap-3 mt-8">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className={`px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm font-semibold transition ${
                loadingMore ? "opacity-60 cursor-wait" : ""
              }`}
            >
              {loadingMore ? "Memuat…" : "Muat Lebih Banyak"}
            </button>
            <p className="text-xs text-gray-500">
              Halaman {page} dari {totalPages}
            </p>
          </div>
        )}
        {!loading && !error && page >= totalPages && series.length > 0 && (
          <p className="text-center text-xs text-gray-500 mt-8">
            Sudah mencapai akhir daftar.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-500">
            © 2025 Nobar Project. Data series dari{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-400 transition"
            >
              TMDB
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}

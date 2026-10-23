"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Play,
  X,
  Tv,
} from "lucide-react";
import {
  fetchTrending,
  fetchByGenre,
  fetchTrendingTV,
  searchMovies,
  type TMDBMovie,
  type TMDBSeries,
  type TMDBPaged,
  type Category,
} from "@/lib/tmdb";
import { MovieCard, SeriesCard } from "@/components/MovieCard";
import { HeroBanner } from "@/components/HeroBanner";
import { Navbar } from "@/components/Navbar";

type HomeClientProps = {
  categories: Category[];
};

export function HomeClient({ categories }: HomeClientProps) {
  const [activeCategory, setActiveCategory] = useState<Category>(categories[0]);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [featured, setFeatured] = useState<TMDBMovie[]>([]);
  const [tvSeries, setTvSeries] = useState<TMDBSeries[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch TV trending once on mount (separate from movie category switching).
  useEffect(() => {
    fetchTrendingTV(1)
      .then((data) => {
        setTvSeries((data.results || []).slice(0, 12));
      })
      .catch((e) => console.warn("TV trending fetch failed", e));
  }, []);

  // loadCategory accepts explicit search override so callers that change
  // isSearching/searchQuery state don't read stale closure values.
  const loadCategory = useCallback(
    async (
      cat: Category,
      targetPage: number,
      append: boolean,
      searchOverride?: { searching: boolean; query: string }
    ) => {
      const searching = searchOverride?.searching ?? isSearching;
      const query = searchOverride?.query ?? searchQuery;

      if (!append) {
        setLoading(true);
        setMovies([]);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        let data: TMDBPaged<TMDBMovie>;
        if (searching && query) {
          data = await searchMovies(query, targetPage);
          // No filter needed — dynamic routes handle ANY TMDB movie ID.
          // Endless: all search results are accessible.
        } else if (cat.tmdbGenreId === null) {
          data = await fetchTrending(targetPage);
        } else {
          data = await fetchByGenre(cat.tmdbGenreId, targetPage);
        }
        if (append) {
          setMovies((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            return [...prev, ...data.results.filter((m) => !existing.has(m.id))];
          });
        } else {
          setMovies(data.results || []);
          if (!searching && cat.id === "trending" && targetPage === 1) {
            setFeatured((data.results || []).slice(0, 6));
          }
        }
        setPage(data.page || targetPage);
        setTotalPages(data.total_pages || 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [isSearching, searchQuery]
  );

  // Initial load (no search).
  useEffect(() => {
    loadCategory(categories[0], 1, false, { searching: false, query: "" });
  }, [loadCategory, categories]);

  const switchCategory = (cat: Category) => {
    if (loading) return;
    setActiveCategory(cat);
    setIsSearching(false);
    setSearchQuery("");
    setPage(1);
    loadCategory(cat, 1, false, { searching: false, query: "" });
  };

  const enterSearch = (q: string) => {
    setIsSearching(true);
    setSearchQuery(q);
    setPage(1);
    loadCategory(activeCategory, 1, false, { searching: true, query: q });
  };

  const exitSearch = () => {
    if (!isSearching && !searchQuery) return;
    setIsSearching(false);
    setSearchQuery("");
    setPage(1);
    loadCategory(activeCategory, 1, false, { searching: false, query: "" });
  };

  const handleSearchInput = (value: string) => {
    const trimmed = value.trim();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (trimmed.length === 0) exitSearch();
      else if (trimmed.length >= 2) enterSearch(trimmed);
    }, 350);
  };

  const loadMore = () => loadCategory(activeCategory, page + 1, true);

  // Header scroll state
  useEffect(() => {
    const onScroll = () => {
      const el = document.getElementById("header");
      if (el) el.classList.toggle("scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTop = () =>
    document.getElementById("kategori")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header — IDLIX pill style (shared component) */}
      <Navbar />

      {/* Hero Banner — full screen, navbar overlaps transparent */}
      <HeroBanner movies={featured} />

      {/* Featured Movies — Trending Now (horizontal scroll, IDLIX style) */}
      <section id="featured" className="w-full bg-black px-3 sm:px-5 py-10">
        <div className="max-w-[1520px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-white text-2xl font-bold">Trending Now</h2>
          </div>
          {featured.length === 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-none w-40 md:w-48 rounded-lg overflow-hidden border border-white/5">
                  <div className="skeleton aspect-[2/3]"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 -mx-1 px-1 snap-x scroll-row">
              {featured.map((m, i) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  rank={i + 1}
                  featured
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TV Series Trending (horizontal scroll, IDLIX style) */}
      <section id="series" className="w-full bg-black px-3 sm:px-5 py-10">
        <div className="max-w-[1520px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-white text-2xl font-bold flex items-center gap-3">
              <Tv className="w-6 h-6 text-brand-500" />
              Trending Series
            </h2>
          </div>
          {tvSeries.length === 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-none w-40 md:w-48 rounded-lg overflow-hidden border border-white/5">
                  <div className="skeleton aspect-[2/3]"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 -mx-1 px-1 snap-x scroll-row">
              {tvSeries.map((s, i) => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  rank={i + 1}
                  featured
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Movie Grid */}
      <main id="kategori" className="w-full bg-black px-3 sm:px-5 py-8 flex-1">
        <div className="max-w-[1520px] mx-auto">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {categories.map((cat) => {
              const active = !isSearching && cat.id === activeCategory.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => switchCategory(cat)}
                  disabled={loading}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
                    active
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* Search indicator */}
          {isSearching && (
            <div className="mb-4 flex items-center justify-between gap-3 bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-300">Mencari:</span>
                <span className="font-semibold text-white">"{searchQuery}"</span>
              </div>
              <button
                onClick={exitSearch}
                className="text-xs text-gray-400 hover:text-white transition"
              >
                Keluar dari pencarian
              </button>
            </div>
          )}

          {/* Grid */}
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
          ) : error ? (
            <div className="text-center py-12 px-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/15 text-brand-400 mb-3">
                <X className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-white">Gagal memuat film</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">{error}</p>
              <button
                onClick={() => loadCategory(activeCategory, 1, false, { searching: false, query: "" })}
                className="mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded text-sm font-semibold"
              >
                Coba lagi
              </button>
            </div>
          ) : movies.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Tidak ada film untuk kategori ini.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {movies.map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                />
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
          {!loading && !error && page >= totalPages && movies.length > 0 && (
            <p className="text-center text-xs text-gray-500 mt-8">
              Sudah mencapai akhir daftar.
            </p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-brand-500 flex items-center justify-center">
              <Play className="w-4 h-4 fill-white" />
            </div>
            <span className="font-display text-lg font-bold">
              No<span className="text-brand-500">bar</span>
            </span>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs text-gray-500">© 2025 Nobar Project. Dibuat untuk pembelajaran web development.</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Data film dari{" "}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-400 transition"
              >
                TMDB
              </a>{" "}
              — atribusi sesuai ToS.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <a href="#" className="hover:text-white transition">Instagram</a>
            <a href="#" className="hover:text-white transition">YouTube</a>
            <a href="#" className="hover:text-white transition">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Inline card definitions removed — using shared components from
// ─── src/components/MovieCard.tsx (MovieCard + SeriesCard) ──────────────


"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import {
  fetchTrending,
  fetchByGenre,
  searchMovies,
  type TMDBMovie,
  type TMDBPaged,
  type Category,
} from "@/lib/tmdb";
import { MovieCard } from "@/components/MovieCard";
import { Navbar } from "@/components/Navbar";

type MovieListingClientProps = {
  categories: Category[];
};

export function MovieListingClient({ categories }: MovieListingClientProps) {
  const [activeCategory, setActiveCategory] = useState<Category>(categories[0]);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial load
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

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header — IDLIX pill style (shared component) */}
      <Navbar>
        <div className="relative w-[200px] sm:w-[280px]">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari film, judul…"
            autoComplete="off"
            aria-label="Cari film"
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && isSearching) exitSearch();
            }}
            className="w-full pl-9 pr-3 py-1.5 rounded-full bg-ink-800 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:bg-ink-700 transition"
          />
        </div>
      </Navbar>

      {/* Body — pt-16 pushes content below fixed navbar */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 pt-24">
        <div className="mb-6">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold">Movies</h1>
          <p className="text-sm text-gray-400 mt-1">
            Jelajahi koleksi film — trending, per kategori, atau cari judul favoritmu.
          </p>
        </div>

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
              <MovieCard key={m.id} movie={m} />
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
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-500">
            © 2025 Nobar Project. Data film dari{" "}
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

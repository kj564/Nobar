"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Play,
  Star,
  X,
  Search as SearchIcon,
  Menu,
  Tv,
} from "lucide-react";
import {
  CATEGORIES,
  fetchTrending,
  fetchByGenre,
  fetchTrendingTV,
  searchMovies,
  slugify,
  type TMDBMovie,
  type TMDBSeries,
  type TMDBPaged,
  posterUrl,
  formatYear,
  formatViews,
} from "@/lib/tmdb";

type Category = (typeof CATEGORIES)[number];

export default function NobarPage() {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
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
  const [statMovies, setStatMovies] = useState<string>("—");
  const [statSeries, setStatSeries] = useState<string>("—");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch TV trending once on mount (separate from movie category switching).
  useEffect(() => {
    fetchTrendingTV(1)
      .then((data) => {
        setTvSeries((data.results || []).slice(0, 12));
        setStatSeries(formatViews(data.total_results || 0));
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
            setStatMovies(formatViews(data.total_results || 0));
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
    loadCategory(CATEGORIES[0], 1, false, { searching: false, query: "" });
  }, [loadCategory]);

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
      {/* Header */}
      <header id="header" className="fixed top-0 inset-x-0 z-40 transition-all duration-300">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Logo + Nav links */}
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
                <a href="#hero" className="px-3 py-2 hover:text-white transition">Home</a>
                <a href="#featured" className="px-3 py-2 hover:text-white transition">Movies</a>
                <a href="#series" className="px-3 py-2 hover:text-white transition">TV Series</a>
              </div>
            </div>

            {/* Right: Search */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="relative w-[200px] sm:w-[280px]">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari film, judul…"
                  autoComplete="off"
                  aria-label="Cari film"
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (debounceTimer.current) clearTimeout(debounceTimer.current);
                      if (v.length >= 2) enterSearch(v);
                      else if (v.length === 0) exitSearch();
                    } else if (e.key === "Escape" && isSearching) exitSearch();
                  }}
                  className="w-full pl-9 pr-3 py-1.5 rounded-full bg-ink-800 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 focus:bg-ink-700 transition"
                />
              </div>
              <button
                onClick={scrollTop}
                className="md:hidden p-2 text-gray-200"
                aria-label="Menu"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section id="hero" className="relative min-h-[78vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-tr from-ink-950 via-ink-950/85 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent"></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1485846234645-a62644f8476b?auto=format&fit=crop&w=1600&q=80"
            alt="Cinema"
            className="w-full h-full object-cover opacity-50"
            loading="eager"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold tracking-wide uppercase rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
              Fest Indie Vol. 7 — Sedang Berlangsung
            </span>
            <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              Panggung untuk <span className="text-brand-500">Kreator Video</span> Indie Indonesia.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-300 max-w-xl leading-relaxed">
              Jelajahi karya pendek dari sineas, dokumentaris, dan animator lokal —
              diputar langsung dari berbagai server cadangan yang stabil dan ringan.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#featured"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 rounded font-semibold transition shadow-lg shadow-brand-500/30"
              >
                <Play className="w-5 h-5 fill-white" />
                Tonton Sekarang
              </a>
              <a
                href="#kategori"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur rounded font-semibold transition border border-white/10"
              >
                Jelajahi Kategori
              </a>
            </div>
            {/* Stats — dynamic from live TMDB response */}
            <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              <div>
                <dt className="text-2xl font-display font-bold">{statMovies}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Film Minggu Ini</dd>
              </div>
              <div>
                <dt className="text-2xl font-display font-bold">{statSeries}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Series Tersedia</dd>
              </div>
              <div>
                <dt className="text-2xl font-display font-bold">{CATEGORIES.length}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Kategori</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Featured Movies */}
      <section id="featured" className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold">Sedang Trending</h2>
              <p className="text-sm text-gray-400 mt-1">Pilihan minggu ini dari komunitas Nobar.</p>
            </div>
          </div>
          {featured.length === 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[280px] rounded-lg overflow-hidden border border-white/5">
                  <div className="skeleton aspect-video"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x scroll-row">
              {featured.map((m) => (
                <MovieCard
                  key={m.id}
                  movie={m}
                  href={`/movie/${slugify(m.title || m.name, m.release_date)}`}
                  featured
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TV Series Trending */}
      <section id="series" className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-3">
                <Tv className="w-6 h-6 text-brand-500" />
                Series Trending
              </h2>
              <p className="text-sm text-gray-400 mt-1">Serial TV populer minggu ini.</p>
            </div>
          </div>
          {tvSeries.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg overflow-hidden border border-white/5">
                  <div className="skeleton aspect-video"></div>
                  <div className="p-3 space-y-2">
                    <div className="skeleton h-3 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {tvSeries.map((s) => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  href={`/series/${slugify(s.name || s.title, s.first_air_date)}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Movie Grid */}
      <main id="kategori" className="py-8 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {CATEGORIES.map((cat) => {
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
                <MovieCard
                  key={m.id}
                  movie={m}
                  href={`/movie/${slugify(m.title || m.name, m.release_date)}`}
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

// ─── Movie Card (navigates to /movie/[slug]) ──────────────────────────────

function MovieCard({
  movie,
  href,
  featured = false,
}: {
  movie: TMDBMovie;
  href: string;
  featured?: boolean;
}) {
  const title = movie.title || movie.name || "Untitled";
  return (
    <Link
      href={href}
      className={`video-card group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in block ${
        featured ? "flex-shrink-0 w-[280px] snap-start" : ""
      }`}
    >
      <div className="card-thumb relative aspect-video overflow-hidden bg-ink-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl(movie.poster_path)}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold">
          {formatYear(movie.release_date)} • ⭐ {movie.vote_average ? movie.vote_average.toFixed(1) : "—"}
        </span>
        <div className="card-play absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-display text-sm font-bold leading-snug line-clamp-2">{title}</h3>
        <p className="mt-1 text-xs text-gray-400 line-clamp-1">
          {formatViews(movie.vote_count)} suara
        </p>
      </div>
    </Link>
  );
}

// ─── Series Card (navigates to /series/[slug]) ───────────────────────────

function SeriesCard({
  series,
  href,
}: {
  series: TMDBSeries;
  href: string;
}) {
  const title = series.name || series.title || "Untitled";
  return (
    <Link
      href={href}
      className="video-card group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in block"
    >
      <div className="card-thumb relative aspect-video overflow-hidden bg-ink-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl(series.poster_path)}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold inline-flex items-center gap-1">
          <Tv className="w-2.5 h-2.5" />
          {formatYear(series.first_air_date)} • ⭐ {series.vote_average ? series.vote_average.toFixed(1) : "—"}
        </span>
        <div className="card-play absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-display text-sm font-bold leading-snug line-clamp-2">{title}</h3>
        <p className="mt-1 text-xs text-gray-400 line-clamp-1">
          {formatViews(series.vote_count)} suara
        </p>
      </div>
    </Link>
  );
}

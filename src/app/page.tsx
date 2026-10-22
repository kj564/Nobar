"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  Star,
  X,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import {
  CATEGORIES,
  type TMDBMovie,
  type TMDBMovieDetail,
  type TMDBPaged,
  posterUrl,
  formatRuntime,
  formatYear,
  formatViews,
  buildServerUrl,
  type Server,
  type Creator,
} from "@/lib/tmdb";

type Category = (typeof CATEGORIES)[number];

export default function NobarPage() {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [featured, setFeatured] = useState<TMDBMovie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedMovie, setSelectedMovie] = useState<TMDBMovieDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [statMovies, setStatMovies] = useState<string>("—");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load config (servers + creators) on mount
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setServers(d.servers || []);
        setCreators(d.creators || []);
      })
      .catch((e) => console.warn("Backend config failed", e));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const loadCategory = useCallback(
    async (cat: Category, targetPage: number, append: boolean) => {
      if (!append) {
        setLoading(true);
        setMovies([]);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        let data: TMDBPaged<TMDBMovie>;
        if (isSearching && searchQuery) {
          const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&page=${targetPage}`);
          if (!res.ok) throw new Error(`Backend ${res.status}`);
          data = await res.json();
        } else if (cat.tmdbGenreId === null) {
          const res = await fetch(`/api/trending?page=${targetPage}`);
          if (!res.ok) throw new Error(`Backend ${res.status}`);
          data = await res.json();
        } else {
          const res = await fetch(`/api/discover?genre=${cat.tmdbGenreId}&page=${targetPage}`);
          if (!res.ok) throw new Error(`Backend ${res.status}`);
          data = await res.json();
        }
        if (append) {
          setMovies((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            return [...prev, ...data.results.filter((m) => !existing.has(m.id))];
          });
        } else {
          setMovies(data.results || []);
          if (!isSearching && cat.id === "trending" && targetPage === 1) {
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

  // Initial load
  useEffect(() => {
    loadCategory(CATEGORIES[0], 1, false);
  }, [loadCategory]);

  const switchCategory = (cat: Category) => {
    if (loading) return;
    setActiveCategory(cat);
    setIsSearching(false);
    setSearchQuery("");
    setPage(1);
    loadCategory(cat, 1, false);
  };

  const enterSearch = (q: string) => {
    setIsSearching(true);
    setSearchQuery(q);
    setPage(1);
    loadCategory(activeCategory, 1, false);
  };

  const exitSearch = () => {
    if (!isSearching && !searchQuery) return;
    setIsSearching(false);
    setSearchQuery("");
    setPage(1);
    loadCategory(activeCategory, 1, false);
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

  const openModal = async (movieId: number) => {
    setModalOpen(true);
    setModalLoading(true);
    setSelectedMovie(null);
    setActiveServer(null);
    try {
      const res = await fetch(`/api/movie/${movieId}`);
      if (!res.ok) throw new Error(`Backend ${res.status}`);
      const data: TMDBMovieDetail = await res.json();
      setSelectedMovie(data);
      const defaultServer = servers.find((s) => s.recommended) || servers[0];
      if (defaultServer) {
        setActiveServer(defaultServer);
      }
    } catch (err) {
      setSelectedMovie({
        id: movieId,
        title: "Gagal memuat detail",
        overview: `Error: ${err instanceof Error ? err.message : "unknown"}. Pastikan API route /api/movie/[id] berfungsi.`,
      });
    } finally {
      setModalLoading(false);
    }
  };

  const selectServer = (server: Server) => {
    setActiveServer(server);
    showToast(`Beralih ke ${server.name}`);
  };

  // Escape closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen) setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
          <div className="flex items-center justify-between h-16">
            <a href="#hero" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition">
                <Play className="w-5 h-5 fill-white" />
              </div>
              <span className="font-display text-xl font-extrabold tracking-tight">
                No<span className="text-brand-500">bar</span>
              </span>
            </a>
            <div className="hidden md:flex items-center gap-1 text-sm font-medium text-gray-300">
              <button onClick={scrollTop} className="px-3 py-2 hover:text-white transition">Beranda</button>
              <button onClick={scrollTop} className="px-3 py-2 hover:text-white transition">Kategori</button>
              <a href="#featured" className="px-3 py-2 hover:text-white transition">Unggulan</a>
              <a href="#kreator" className="px-3 py-2 hover:text-white transition">Kreator</a>
              <a href="#tentang" className="px-3 py-2 hover:text-white transition">Tentang</a>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 min-w-[140px] max-w-[200px] sm:max-w-xs">
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
              <button className="hidden sm:inline-flex px-4 py-1.5 text-sm font-semibold bg-white text-ink-950 rounded hover:bg-gray-200 transition">
                Masuk
              </button>
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
            {/* Dynamic stats (audit fix: no more hardcoded 240+/85/12) */}
            <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              <div>
                <dt className="text-2xl font-display font-bold">{statMovies}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Film Minggu Ini</dd>
              </div>
              <div>
                <dt className="text-2xl font-display font-bold">{creators.length || "—"}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Kreator</dd>
              </div>
              <div>
                <dt className="text-2xl font-display font-bold">{CATEGORIES.length}</dt>
                <dd className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Kategori</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Featured */}
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
                <MovieCard key={m.id} movie={m} onClick={() => openModal(m.id)} featured />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Main grid */}
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
                onClick={() => loadCategory(activeCategory, 1, false)}
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
                <MovieCard key={m.id} movie={m} onClick={() => openModal(m.id)} />
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

      {/* Creators */}
      <section id="kreator" className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-6">Kreator Pilihan</h2>
          {creators.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-ink-900 rounded-lg p-4 text-center border border-white/5">
                  <div className="skeleton w-16 h-16 mx-auto rounded-full"></div>
                  <div className="skeleton h-3 mt-3 w-2/3 mx-auto rounded"></div>
                  <div className="skeleton h-2 mt-2 w-1/2 mx-auto rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {creators.map((c, i) => (
                <div
                  key={i}
                  className="bg-ink-900 rounded-lg p-4 text-center border border-white/5 hover:border-white/20 transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.avatar}
                    alt={c.name}
                    loading="lazy"
                    className="w-16 h-16 mx-auto rounded-full object-cover border-2 border-white/10"
                  />
                  <h4 className="mt-3 font-semibold text-sm">{c.name}</h4>
                  <p className="text-xs text-gray-400">{c.role}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* About / Tentang */}
      <section id="tentang" className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
              Platform untuk kreator, oleh kreator.
            </h2>
            <p className="text-gray-300 leading-relaxed">
              Nobar adalah ruang streaming untuk film pendek dan karya audiovisual indie
              Indonesia. Setiap judul dapat diakses melalui beberapa server cadangan,
              sehingga pemutaran tetap stabil meski satu server sibuk.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0"></span>
                Multi-server load balancing untuk stabilitas streaming.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0"></span>
                Katalog dinamis dari TMDB (trending, discover, search).
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0"></span>
                Profil kreator dengan tautan portofolio & sosial media.
              </li>
            </ul>
          </div>
          <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1536440136628-849c0f2a5103?auto=format&fit=crop&w=1200&q=80"
              alt="Behind the scenes"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Footer — sticky to bottom (audit fix: 2025, not 2026) */}
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

      {/* Modal */}
      {modalOpen && (
        <div
          id="videoModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modalTitle"
          className="fixed inset-0 z-50 modal-open-state"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modal-backdrop absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div className="relative h-full w-full flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="modal-panel relative w-full max-w-4xl bg-ink-900 sm:rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              <div className="relative bg-black aspect-video">
                <iframe
                  title="player"
                  className="absolute inset-0 w-full h-full"
                  src={
                    selectedMovie && activeServer
                      ? buildServerUrl(activeServer.pattern, selectedMovie.id)
                      : "about:blank"
                  }
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
                <button
                  onClick={() => setModalOpen(false)}
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
                {modalLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white bg-ink-950">
                    <div className="w-10 h-10 rounded-full border-4 border-white/10 border-t-brand-500 animate-spin"></div>
                    <span className="text-sm text-gray-400">Memuat pemutar…</span>
                  </div>
                )}
              </div>
              <div className="p-5 sm:p-6 space-y-5">
                <header>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-2">
                    <span className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-400 font-semibold uppercase tracking-wide">
                      {selectedMovie?.genres?.[0]?.name || "Film"}
                    </span>
                    <span>{selectedMovie ? formatRuntime(selectedMovie.runtime) : ""}</span>
                    <span>•</span>
                    <span>{selectedMovie ? formatYear(selectedMovie.release_date) : ""}</span>
                    <span>•</span>
                    <span>{selectedMovie ? `${formatViews(selectedMovie.vote_count)} suara` : ""}</span>
                  </div>
                  <h2 id="modalTitle" className="font-display text-xl sm:text-2xl font-bold leading-snug">
                    {selectedMovie?.title || selectedMovie?.name || "Memuat…"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">
                    oleh{" "}
                    <span className="text-white font-medium">
                      {selectedMovie?.credits?.crew?.find((p) => p.job === "Director")?.name || "—"}
                    </span>
                  </p>
                </header>

                {/* Server picker */}
                {selectedMovie && servers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-300">Pilih Server</h3>
                      <span className="text-xs text-gray-500">
                        {activeServer ? `Memutar dari ${activeServer.name} (${activeServer.quality})` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {servers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => selectServer(s)}
                          className={`server-btn inline-flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm text-gray-200 ${
                            activeServer?.id === s.id ? "active" : ""
                          }`}
                        >
                          <span className="flex items-center gap-2 font-semibold">
                            {s.name}
                            {s.recommended && (
                              <span className="ml-1 text-[10px] opacity-80">• rekomendasi</span>
                            )}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {s.quality} • load {s.load}%
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Jika pemutaran macet, coba pindah server cadangan untuk sumber alternatif.
                    </p>
                  </div>
                )}

                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Deskripsi</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {selectedMovie?.overview || "Tidak ada deskripsi untuk film ini."}
                  </p>
                </div>

                {/* Tags */}
                {selectedMovie?.genres && selectedMovie.genres.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedMovie.genres.map((g) => (
                      <span
                        key={g.id}
                        className="px-2.5 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/5"
                      >
                        #{g.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Similar */}
                {selectedMovie?.similar?.results && selectedMovie.similar.results.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Karya Terkait</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scroll-row">
                      {selectedMovie.similar.results.slice(0, 10).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => openModal(m.id)}
                          className="shrink-0 w-28 sm:w-32 text-left"
                          aria-label={`Buka ${m.title || m.name || "Untitled"}`}
                        >
                          <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 hover:border-brand-500/50 transition">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={posterUrl(m.poster_path)}
                              alt={m.title || m.name || "Untitled"}
                              loading="lazy"
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white">
                              ⭐ {m.vote_average ? m.vote_average.toFixed(1) : "—"}
                            </span>
                          </div>
                          <h4 className="mt-1.5 text-xs font-medium text-gray-300 hover:text-white transition line-clamp-2 leading-tight">
                            {m.title || m.name || "Untitled"}
                          </h4>
                          <p className="text-[10px] text-gray-500">{formatYear(m.release_date)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cast */}
                {selectedMovie?.credits?.cast && selectedMovie.credits.cast.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Daftar Tim & Kreator</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedMovie.credits.cast.slice(0, 8).map((p) => {
                        const initial = (p.name || "?").charAt(0);
                        return (
                          <div
                            key={p.id}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition"
                          >
                            {p.profile_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={posterUrl(p.profile_path)}
                                alt={p.name}
                                loading="lazy"
                                className="w-8 h-8 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-ink-700 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">
                                {initial}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-white leading-tight">{p.name}</span>
                              {p.character && (
                                <span className="text-[10px] text-gray-400 leading-tight">
                                  sebagai {p.character}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg bg-ink-800 border border-white/10 text-sm text-white shadow-xl toast-show pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

function MovieCard({
  movie,
  onClick,
  featured = false,
}: {
  movie: TMDBMovie;
  onClick: () => void;
  featured?: boolean;
}) {
  const title = movie.title || movie.name || "Untitled";
  return (
    <article
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Buka ${title}`}
      className={`video-card group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in ${
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
    </article>
  );
}

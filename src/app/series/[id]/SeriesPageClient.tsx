"use client";

// SeriesPageClient — client-side rendering version of the series detail page.
//
// Migration context:
//   Previously a server component that awaited `fetchTVDetail(seriesId)` from
//   `@/lib/tmdb` (which uses server-only `process.env.TMDB_API_KEY`), exported
//   `generateMetadata()` for dynamic `<title>` / OG tags, and used server-side
//   `notFound()` + `redirect()`.
//
//   For GitHub Pages static export (`output: "export"` in next.config.ts) we
//   cannot do server-side data fetching, so this component is now a client
//   component that resolves the series detail on mount via
//   `fetchTVDetailClient(id)` from `@/lib/tmdb-client` (browser fetch to the
//   public TMDB API endpoint with the public NEXT_PUBLIC_TMDB_API_KEY).
//
//   Pure utility helpers (posterUrl, backdropUrl, formatYear, formatViews,
//   buildSeriesSlug, extractIdFromSlug) and TMDB types are still imported
//   from `@/lib/tmdb` because that module is browser-safe per its header
//   comment (only server-only API is `process.env`, which is guarded).
//
//   The page.tsx wrapper in this folder imports `SeriesPageClient` by name
//   and also exports `generateStaticParams() = []` so Next.js knows not to
//   pre-render any IDs — every series page is rendered on the client at
//   runtime via this component.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Play,
  ArrowLeft,
  Star,
  Heart,
  Bookmark,
  Share2,
  Tv,
} from "lucide-react";
import {
  backdropUrl,
  posterUrl,
  formatYear,
  formatViews,
  buildSeriesSlug,
  extractIdFromSlug,
  type TMDBSeriesDetail,
} from "@/lib/tmdb";
import { fetchTVDetailClient } from "@/lib/tmdb-client";
import { SeriesNativePlayer } from "@/components/SeriesNativePlayer";
import { WatchPartyButton } from "@/components/WatchPartyButton";
import { Navbar } from "@/components/Navbar";

// Tagged-union state machine — same shape as MoviePageClient.
type LoadState =
  | { status: "loading" }
  | { status: "notfound" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: TMDBSeriesDetail };

export function SeriesPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Get series ID from URL params OR parse from window.location (GitHub Pages SPA)
  function getSeriesSlug(): string {
    const paramSlug = params?.id;
    if (paramSlug && paramSlug !== "preview") return paramSlug;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    let path = typeof window !== "undefined" ? window.location.pathname : "";
    if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length);
    const match = path.match(/\/series\/(.+?)(?:\/?)(?:\?.*)?$/);
    return match ? match[1] : "";
  }

  useEffect(() => {
    const slug = getSeriesSlug();
    const seriesId = extractIdFromSlug(slug);
    if (!seriesId) {
      setState({ status: "notfound" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    fetchTVDetailClient(seriesId)
      .then((detail) => {
        if (cancelled) return;

        // ── Anti-Fake Filter (same as movie) ──
        // Note: fetchTVDetailClient intentionally omits external_ids per Task 1
        // spec to keep the browser payload smaller, so the imdbId branch
        // usually falls through to the poster/popularity fallbacks.
        const imdbId =
          (detail as { external_ids?: { imdb_id?: string }; imdb_id?: string })
            .external_ids?.imdb_id ||
          (detail as { imdb_id?: string }).imdb_id;
        const popularity =
          (detail as { popularity?: number }).popularity || 0;
        const isFake =
          (detail.status === "Released" &&
            (!detail.number_of_episodes ||
              detail.number_of_episodes === 0) &&
            !imdbId) ||
          (!imdbId && !detail.poster_path && popularity < 2);
        if (isFake) {
          setState({ status: "notfound" });
          return;
        }

        // Redirect to canonical slug if URL doesn't match.
        // Client-side equivalent of the server `redirect()` call.
        const canonicalSlug = buildSeriesSlug(detail);
        if (slug !== canonicalSlug) {
          router.replace(`/series/${canonicalSlug}`);
          return;
        }

        setState({ status: "ready", detail });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("fetchTVDetailClient failed:", err);
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Gagal memuat series.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [params?.id, router]);

  // ─── Loading state ────────────────────────────────────────────────────
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-ink-950 text-white">
        <div className="w-10 h-10 border-2 border-white/20 border-t-brand-500 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">Memuat series...</p>
      </div>
    );
  }

  // ─── Not-found state ──────────────────────────────────────────────────
  if (state.status === "notfound") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-ink-950 text-white px-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Series Tidak Ditemukan</h1>
        <p className="text-sm text-gray-400 mb-6">
          Series yang kamu cari tidak tersedia atau telah dihapus.
        </p>
        <Link
          href="/series/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 text-sm font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Series
        </Link>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-ink-950 text-white px-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Gagal Memuat Series</h1>
        <p className="text-sm text-gray-400 mb-6">{state.message}</p>
        <Link
          href="/series/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-500 hover:bg-brand-600 text-sm font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Daftar Series
        </Link>
      </div>
    );
  }

  // ─── Ready state — render the full series detail page ─────────────────
  const detail = state.detail;
  const title = detail.name || detail.title || "Untitled";
  const creator = detail.created_by?.[0]?.name;
  const cast = (detail.credits?.cast || []).slice(0, 12);
  const similar = (detail.similar?.results || [])
    .filter((s) => s.poster_path)
    .slice(0, 12);
  const genres = detail.genres || [];
  const backdrop = backdropUrl(detail.backdrop_path, "w1280");
  const seasons = detail.number_of_seasons;
  const episodes = detail.number_of_episodes;
  const status = detail.status;

  // ─── SEO: JSON-LD structured data (schema.org/TVSeries) ──────────────────
  // Renders as <script type="application/ld+json"> for rich results
  // (rating stars, genre, season/episode counts in Google search).
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: title,
    description: detail.overview || "",
    image: backdrop,
    datePublished: detail.first_air_date || undefined,
    genre: genres.map((g) => g.name),
    numberOfSeasons: seasons,
    numberOfEpisodes: episodes,
  };
  if (detail.vote_average && detail.vote_average > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: detail.vote_average,
      ratingCount: detail.vote_count ?? 0,
    };
  }

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ── Preconnect hints: warm TCP+TLS to CDN domains before video element mounts ──
          Saves ~200-500ms on first byte (browser pre-handshakes with hakunaymatata
          CDN during React render, so the first MPD/MP4 chunk fetch is instant). */}
      <link rel="preconnect" href="https://sbcdnw.hakunaymatata.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://bcdnxw.hakunaymatata.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
      <Navbar>
        <Link
          href="/series/"
          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Link>
      </Navbar>

      {/* ─── Backdrop Section (idlixku pattern) ─── */}
      <section className="relative w-full h-[65svh] min-h-[420px] overflow-hidden">
        {backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdrop}
            alt={title}
            fetchPriority="high"
            loading="eager"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />
        ) : (
          <div className="absolute inset-0 bg-ink-900" />
        )}
        {/* idlixku detail gradient — 5-stop heavier */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.9) 85%, #1E2022 100%)",
          }}
        />
      </section>

      {/* ─── Detail Content (idlixku pull-up overlap) ─── */}
      <div className="relative z-10 -mt-32 md:-mt-40 lg:-mt-60">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-12">
          <div className="max-w-2xl">
            {/* Title */}
            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-balance drop-shadow-2xl mb-4">
              {title}
            </h1>

            {/* Genre pills row */}
            {genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {genres.slice(0, 3).map((g) => (
                  <span
                    key={g.id}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-gray-200"
                  >
                    {g.name}
                  </span>
                ))}
                {status && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    status === "Returning Series"
                      ? "border-green-500 text-green-500 bg-green-500/10"
                      : status === "Ended" || status === "Canceled"
                        ? "border-accent-500 text-accent-500 bg-accent-500/10"
                        : "border-gray-500 text-gray-500 bg-gray-500/10"
                  }`}>
                    {status === "Returning Series" ? "Ongoing" : status}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons — idlixku pills */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <a
                href="#player"
                className="hero-cta-primary text-white font-semibold h-11 px-7 rounded-full flex items-center gap-2 transition-all shadow-lg shadow-brand-500/30 group"
              >
                <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
                <span>Watch Now</span>
              </a>
              <WatchPartyButton />
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium h-11 w-11 rounded-full flex items-center justify-center transition border border-white/10" aria-label="Watchlist">
                <Bookmark className="w-4 h-4" />
              </button>
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium h-11 w-11 rounded-full flex items-center justify-center transition border border-white/10" aria-label="Like">
                <Heart className="w-4 h-4" />
              </button>
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium h-11 w-11 rounded-full flex items-center justify-center transition border border-white/10" aria-label="Share">
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {/* Metadata row */}
            <div className="flex items-center flex-wrap gap-3 mb-2 text-sm text-gray-300">
              {detail.vote_average && (
                <span className="inline-flex items-center gap-1 font-bold">
                  <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                  <span className="text-yellow-500">{detail.vote_average.toFixed(1)}</span>
                </span>
              )}
              <span>{formatYear(detail.first_air_date)}</span>
              {seasons && <span>{seasons} Season{seasons > 1 ? "s" : ""}</span>}
              {episodes && <span>{episodes} Episode</span>}
            </div>

            {/* Tagline */}
            {detail.tagline && (
              <p className="text-gray-400 italic text-sm mb-3 mt-2">{detail.tagline}</p>
            )}

            {/* Synopsis (truncated) */}
            {detail.overview && (
              <p className="text-gray-300 text-sm leading-relaxed max-w-3xl line-clamp-3 mb-6">
                {detail.overview}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Body Content (clean spacing, no overlap) ─── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-12 lg:px-16 pt-10 pb-8 space-y-10">
        <div id="player" className="space-y-4 scroll-mt-20">
          <h2 className="text-lg font-bold text-white">Player</h2>
          <SeriesNativePlayer tmdbId={detail.id} title={title} seasons={detail.seasons} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-white font-display">Synopsis</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              {detail.overview || "Tidak ada deskripsi untuk series ini."}
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white font-display">Info</h2>
            <div className="space-y-3 text-sm">
              {creator && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Dibuat oleh</span>
                  <span className="text-white text-right">{creator}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Tahun</span>
                <span className="text-white">{formatYear(detail.first_air_date)}</span>
              </div>
              {seasons && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Seasons</span>
                  <span className="text-white">{seasons}</span>
                </div>
              )}
              {episodes && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Episodes</span>
                  <span className="text-white">{episodes}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Rating</span>
                <span className="text-white">
                  {detail.vote_average ? detail.vote_average.toFixed(1) : "—"}
                </span>
              </div>
              {status && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Status</span>
                  <span className="text-white">{status}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cast section — idlixku style: horizontal scroll, circular avatars */}
        {cast.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg sm:text-xl font-bold text-white mb-5 font-display">Cast</h2>
            <div className="flex gap-5 sm:gap-6 overflow-x-auto pb-4 -mx-1 px-1 scroll-row">
              {cast.map((p) => {
                const initial = (p.name || "?").charAt(0);
                return (
                  <div key={p.id} className="flex-shrink-0 w-24 sm:w-28 text-center group">
                    {p.profile_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posterUrl(p.profile_path)}
                        alt={p.name}
                        loading="lazy"
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover mx-auto border-2 border-white/10 group-hover:border-brand-500/50 transition-all group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-ink-700 border-2 border-white/10 flex items-center justify-center text-2xl font-bold text-gray-400 mx-auto group-hover:border-brand-500/50 transition">
                        {initial}
                      </div>
                    )}
                    <p className="text-sm font-medium text-white mt-2.5 line-clamp-2 leading-tight group-hover:text-brand-400 transition-colors">
                      {p.name}
                    </p>
                    {p.character && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.character}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {similar.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Similar Series</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {similar.map((s) => {
                const similarTitle = s.name || s.title || "Untitled";
                return (
                  <Link key={s.id} href={`/series/${buildSeriesSlug(s)}`} className="group text-left">
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 group-hover:border-brand-500/50 transition">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterUrl(s.poster_path)}
                        alt={similarTitle}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <span className="absolute bottom-2 left-2 text-[10px] font-semibold text-white flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                        {s.vote_average ? s.vote_average.toFixed(1) : "—"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-xs font-medium text-gray-300 group-hover:text-white transition line-clamp-2 leading-tight">
                      {similarTitle}
                    </h3>
                    <p className="text-[10px] text-gray-500">{formatYear(s.first_air_date)}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 text-center">
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

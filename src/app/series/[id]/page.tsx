import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
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
  fetchTVDetail,
  backdropUrl,
  posterUrl,
  formatYear,
  formatViews,
  buildSeriesSlug,
  extractIdFromSlug,
} from "@/lib/tmdb";
import { SeriesNativePlayer } from "@/components/SeriesNativePlayer";
import { WatchPartyButton } from "@/components/WatchPartyButton";
import { Navbar } from "@/components/Navbar";

type PageProps = {
  params: Promise<{ id: string }>;
};

// ─── SEO: dynamic metadata ────────────────────────────────────────────────
// Generates <title>, description, OpenGraph, Twitter card, and canonical URL
// from the TMDB TV detail. Reuses the same helpers as the page body
// (extractIdFromSlug → fetchTVDetail → buildSeriesSlug).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: slug } = await params;
  const seriesId = extractIdFromSlug(slug);
  if (!seriesId) return { title: "Series Tidak Ditemukan — Nobar" };

  let detail: Awaited<ReturnType<typeof fetchTVDetail>> | null = null;
  try {
    detail = await fetchTVDetail(seriesId);
  } catch {
    return { title: "Series Tidak Ditemukan — Nobar" };
  }

  const title = detail.name || detail.title || "Untitled";
  const overview = (detail.overview || "").slice(0, 160);
  const canonicalSlug = buildSeriesSlug(detail);
  const ogImage = backdropUrl(detail.backdrop_path, "original");
  const fullTitle = `${title} (Series) — Nobar`;

  return {
    title: fullTitle,
    description: overview || `Tonton ${title} di Nobar.`,
    alternates: { canonical: `/series/${canonicalSlug}` },
    openGraph: {
      title: fullTitle,
      description: overview,
      type: "video.tv_show",
      images: ogImage ? [{ url: ogImage }] : undefined,
      siteName: "Nobar",
      locale: "id_ID",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: overview,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const { id: slug } = await params;

  const seriesId = extractIdFromSlug(slug);
  if (!seriesId) return notFound();

  let detail;
  try {
    detail = await fetchTVDetail(seriesId);
  } catch (err) {
    console.error("fetchTVDetail failed:", err);
    return notFound();
  }

  // ── Anti-Fake Filter (same as movie) ──
  const imdbId = detail.external_ids?.imdb_id || (detail as any).imdb_id;
  const popularity = (detail as any).popularity || 0;
  const isFake =
    (detail.status === "Released" &&
      (!detail.number_of_episodes || detail.number_of_episodes === 0) &&
      !imdbId)
    || (!imdbId && !detail.poster_path && popularity < 2);
  if (isFake) {
    return notFound();
  }

  // Redirect to canonical slug if URL doesn't match
  const canonicalSlug = buildSeriesSlug(detail);
  if (slug !== canonicalSlug) {
    redirect(`/series/${canonicalSlug}`);
  }

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

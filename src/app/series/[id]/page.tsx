import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
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
  fetchTVDetail,
  backdropUrl,
  posterUrl,
  formatYear,
  formatViews,
  buildSeriesSlug,
  extractIdFromSlug,
  SERVERS_TV,
  type Server,
} from "@/lib/tmdb";
import { MoviePlayer } from "@/components/MoviePlayer";
import { NativePlayer } from "@/components/NativePlayer";
import { SeriesNativePlayer } from "@/components/SeriesNativePlayer";
import { Navbar } from "@/components/Navbar";

type PageProps = {
  params: Promise<{ id: string }>;
};

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

  // Redirect to canonical slug if URL doesn't match
  const canonicalSlug = buildSeriesSlug(detail);
  if (slug !== canonicalSlug) {
    redirect(`/series/${canonicalSlug}`);
  }

  const title = detail.name || detail.title || "Untitled";
  const creator = detail.created_by?.[0]?.name;
  const cast = (detail.credits?.cast || []).slice(0, 12);
  const similar = (detail.similar?.results || []).slice(0, 12);
  const genres = detail.genres || [];
  const backdrop = backdropUrl(detail.backdrop_path, "original");
  const seasons = detail.number_of_seasons;
  const episodes = detail.number_of_episodes;
  const status = detail.status;

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      <Navbar>
        <Link
          href="/series/"
          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Link>
      </Navbar>

      {/* ─── Backdrop Hero Section ─── */}
      <section className="relative w-full h-[55vh] min-h-[400px] max-h-[600px] overflow-hidden">
        {backdrop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backdrop}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-ink-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/40 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 px-6 md:px-12 lg:px-16 pb-8 pt-16">
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center gap-2">
              <span className="bg-brand-500 text-white text-[11px] font-bold px-3 py-1 rounded uppercase tracking-wider inline-flex items-center gap-1.5">
                <Tv className="w-3 h-3" />
                TV Series
              </span>
              {status && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                  status === "Returning Series"
                    ? "border-green-500 text-green-500 bg-green-500/10"
                    : status === "Ended" || status === "Canceled"
                      ? "border-red-500 text-red-500 bg-red-500/10"
                      : "border-gray-500 text-gray-500 bg-gray-500/10"
                }`}>
                  {status === "Returning Series" ? "Ongoing" : status}
                </span>
              )}
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight text-balance">
              {title}
            </h1>

            {detail.tagline && (
              <p className="text-gray-400 italic text-sm sm:text-base font-light">
                {detail.tagline}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm text-gray-300">
              {detail.vote_average && (
                <span className="inline-flex items-center gap-1 font-bold">
                  <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                  <span className="text-yellow-500">{detail.vote_average.toFixed(1)}</span>
                </span>
              )}
              <span className="text-gray-600">•</span>
              <span>{formatYear(detail.first_air_date)}</span>
              {seasons && (
                <>
                  <span className="text-gray-600">•</span>
                  <span>{seasons} Season{seasons > 1 ? "s" : ""}</span>
                </>
              )}
              {episodes && (
                <>
                  <span className="text-gray-600">•</span>
                  <span>{episodes} Episode</span>
                </>
              )}
              {genres.length > 0 && (
                <>
                  <span className="text-gray-600 hidden sm:inline">•</span>
                  <span className="text-gray-400 hidden sm:inline">
                    {genres.slice(0, 3).map((g) => g.name).join(", ")}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#player"
                className="bg-brand-500 hover:bg-red-700 text-white font-semibold py-2.5 px-7 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-brand-500/30 group"
              >
                <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
                <span>Watch Now</span>
              </a>
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10">
                <Bookmark className="w-4 h-4" />
                <span className="hidden sm:inline">Watchlist</span>
              </button>
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10">
                <Heart className="w-4 h-4" />
              </button>
              <button className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Body ─── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-12 lg:px-16 py-8 space-y-10">
        <div id="player" className="space-y-4 scroll-mt-20">
          <h2 className="text-lg font-bold text-white">Player</h2>
          <SeriesNativePlayer tmdbId={detail.id} title={title} seasons={detail.seasons} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-white">Synopsis</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              {detail.overview || "Tidak ada deskripsi untuk series ini."}
            </p>
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/series/?genre=${g.id}`}
                    className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300 border border-white/10 hover:bg-white/10 hover:border-white/20 transition"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Info</h2>
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

        {cast.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Cast</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {cast.map((p) => {
                const initial = (p.name || "?").charAt(0);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/20 transition">
                    {p.profile_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posterUrl(p.profile_path)}
                        alt={p.name}
                        loading="lazy"
                        className="w-12 h-12 rounded-full object-cover border border-white/10 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-ink-700 border border-white/10 flex items-center justify-center text-sm font-bold text-gray-400 flex-shrink-0">
                        {initial}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-white truncate">{p.name}</span>
                      {p.character && (
                        <span className="text-xs text-gray-400 truncate">{p.character}</span>
                      )}
                    </div>
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

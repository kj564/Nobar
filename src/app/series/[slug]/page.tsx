import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, ArrowLeft, Star, Tv } from "lucide-react";
import {
  fetchAllSeriesForPrerender,
  fetchTVDetail,
  findSeriesBySlug,
  slugify,
  posterUrl,
  formatYear,
  formatViews,
  SERVERS_TV,
  type Server,
} from "@/lib/tmdb";
import { MoviePlayer } from "@/components/MoviePlayer";
import { Navbar } from "@/components/Navbar";

// Pre-render detail pages for ALL TV series accessible in the app.
// Sources: trending TV 1-10 + similar from trending.
export const dynamicParams = false;

export async function generateStaticParams() {
  const series = await fetchAllSeriesForPrerender();
  const slugs = series.map((s) => ({
    slug: slugify(s.name || s.title, s.first_air_date),
  }));
  console.log(`[generateStaticParams:series] Pre-rendering ${slugs.length} series detail pages`);
  return slugs;
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SeriesDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve slug → TMDB ID by searching the full pre-render set.
  let series;
  try {
    const allSeries = await fetchAllSeriesForPrerender();
    series = findSeriesBySlug(allSeries, slug);
  } catch (err) {
    console.error("Series slug resolution failed:", err);
  }

  if (!series) return notFound();

  // Fetch full detail (with credits + similar).
  let detail;
  try {
    detail = await fetchTVDetail(series.id);
  } catch (err) {
    console.error("fetchTVDetail failed:", err);
    return notFound();
  }

  const title = detail.name || detail.title || "Untitled";
  const creator = detail.created_by?.[0]?.name;
  const cast = (detail.credits?.cast || []).slice(0, 8);
  const similar = (detail.similar?.results || []).slice(0, 10);
  const genres = detail.genres || [];
  const seasons = detail.number_of_seasons;
  const episodes = detail.number_of_episodes;
  const status = detail.status;
  const runtime = detail.episode_run_time?.[0];

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header — IDLIX pill style (shared component) */}
      <Navbar>
        <Link
          href="/series/"
          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Link>
      </Navbar>

      {/* Body — pt-16 pushes content below fixed navbar */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pt-24 space-y-6">
        {/* Title + meta */}
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-2">
            <span className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-400 font-semibold uppercase tracking-wide inline-flex items-center gap-1">
              <Tv className="w-3 h-3" />
              Series
            </span>
            <span>{formatYear(detail.first_air_date)}</span>
            {seasons && (
              <>
                <span>•</span>
                <span>{seasons} Season{seasons > 1 ? "s" : ""}</span>
              </>
            )}
            {episodes && (
              <>
                <span>•</span>
                <span>{episodes} Episode</span>
              </>
            )}
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Star className="w-3 h-3 fill-brand-500 text-brand-500" />
              {detail.vote_average ? detail.vote_average.toFixed(1) : "—"}
            </span>
            <span>•</span>
            <span>{formatViews(detail.vote_count)} suara</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold leading-tight">
            {title}
          </h1>
          {creator && (
            <p className="mt-2 text-sm text-gray-400">
              Dibuat oleh: <span className="text-white font-medium">{creator}</span>
            </p>
          )}
          {status && (
            <p className="mt-1 text-xs text-gray-500">
              Status: <span className="text-gray-300">{status}</span>
            </p>
          )}
        </div>

        {/* Player + server picker + season/episode selector */}
        <MoviePlayer
          videoId={detail.id}
          title={title}
          servers={SERVERS_TV as unknown as Server[]}
          kind="series"
          seasons={detail.seasons}
        />

        {/* Description */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Deskripsi</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            {detail.overview || "Tidak ada deskripsi untuk series ini."}
          </p>
        </div>

        {/* Tags */}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <span
                key={g.id}
                className="px-2.5 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/5"
              >
                #{g.name}
              </span>
            ))}
          </div>
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Pemeran</h2>
            <div className="flex flex-wrap gap-2">
              {cast.map((p) => {
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

        {/* Similar series */}
        {similar.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Karya Terkait</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scroll-row">
              {similar.map((s) => {
                const similarTitle = s.name || s.title || "Untitled";
                const similarSlug = slugify(s.name || s.title, s.first_air_date);
                return (
                  <Link
                    key={s.id}
                    href={`/series/${similarSlug}`}
                    className="shrink-0 w-28 sm:w-32 text-left group"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 group-hover:border-brand-500/50 transition">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterUrl(s.poster_path)}
                        alt={similarTitle}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white">
                        ⭐ {s.vote_average ? s.vote_average.toFixed(1) : "—"}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-xs font-medium text-gray-300 group-hover:text-white transition line-clamp-2 leading-tight">
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

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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

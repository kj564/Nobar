import { notFound } from "next/navigation";
import Link from "next/link";
import { Play, ArrowLeft, Star } from "lucide-react";
import {
  fetchTrending,
  fetchMovieDetail,
  findMovieBySlug,
  slugify,
  posterUrl,
  formatRuntime,
  formatYear,
  formatViews,
  SERVERS,
  type Server,
} from "@/lib/tmdb";
import { MoviePlayer } from "@/components/MoviePlayer";
import { Navbar } from "@/components/Navbar";

// Pre-render detail pages for top 20 trending movies at build time.
// (Static export limitation: only these slugs will have working URLs.
// Clicks on movies outside this set will return 404 on GitHub Pages.)
export const dynamicParams = false;

export async function generateStaticParams() {
  try {
    const trending = await fetchTrending(1);
    return trending.results.slice(0, 20).map((m) => ({
      slug: slugify(m.title || m.name, m.release_date),
    }));
  } catch (err) {
    console.error("generateStaticParams (movie) failed:", err);
    return [];
  }
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MovieDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // Resolve slug → TMDB ID by re-fetching trending (cached, so cheap).
  const trending = await fetchTrending(1);
  const movie = findMovieBySlug(trending.results, slug);
  if (!movie) return notFound();

  // Fetch full detail (with credits + similar).
  let detail;
  try {
    detail = await fetchMovieDetail(movie.id);
  } catch (err) {
    console.error("fetchMovieDetail failed:", err);
    return notFound();
  }

  const title = detail.title || detail.name || "Untitled";
  const director = detail.credits?.crew?.find((p) => p.job === "Director")?.name;
  const cast = (detail.credits?.cast || []).slice(0, 8);
  const similar = (detail.similar?.results || []).slice(0, 10);
  const genres = detail.genres || [];

  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header — IDLIX pill style (shared component) */}
      <Navbar>
        <Link
          href="/movie/"
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
            <span className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-400 font-semibold uppercase tracking-wide">
              Film
            </span>
            <span>{formatYear(detail.release_date)}</span>
            <span>•</span>
            <span>{formatRuntime(detail.runtime)}</span>
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
          {director && (
            <p className="mt-2 text-sm text-gray-400">
              Sutradara: <span className="text-white font-medium">{director}</span>
            </p>
          )}
        </div>

        {/* Player + server picker */}
        <MoviePlayer
          videoId={detail.id}
          title={title}
          servers={SERVERS as unknown as Server[]}
          kind="movie"
        />

        {/* Description */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Deskripsi</h2>
          <p className="text-sm text-gray-300 leading-relaxed">
            {detail.overview || "Tidak ada deskripsi untuk film ini."}
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

        {/* Similar movies */}
        {similar.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-3">Karya Terkait</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scroll-row">
              {similar.map((m) => {
                const similarTitle = m.title || m.name || "Untitled";
                const similarSlug = slugify(m.title || m.name, m.release_date);
                return (
                  <Link
                    key={m.id}
                    href={`/movie/${similarSlug}`}
                    className="shrink-0 w-28 sm:w-32 text-left group"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 group-hover:border-brand-500/50 transition">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterUrl(m.poster_path)}
                        alt={similarTitle}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white">
                        ⭐ {m.vote_average ? m.vote_average.toFixed(1) : "—"}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-xs font-medium text-gray-300 group-hover:text-white transition line-clamp-2 leading-tight">
                      {similarTitle}
                    </h3>
                    <p className="text-[10px] text-gray-500">{formatYear(m.release_date)}</p>
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

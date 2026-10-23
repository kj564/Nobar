import Link from "next/link";
import { Play, Star, MessageSquare, Tv } from "lucide-react";
import {
  type TMDBMovie,
  posterUrl,
  formatYear,
  formatViews,
  buildMovieSlug,
  buildSeriesSlug,
} from "@/lib/tmdb";

// MovieCard — idlixku-polished: rank stroke italic, quality badge, hover info reveal
export function MovieCard({
  movie,
  rank,
  featured = false,
}: {
  movie: TMDBMovie;
  rank?: number;
  featured?: boolean;
}) {
  const title = movie.title || movie.name || "Untitled";
  const href = `/movie/${buildMovieSlug(movie)}`;
  return (
    <Link
      href={href}
      className={`group video-card flex flex-col gap-2 fade-in ${
        featured ? "flex-none w-40 md:w-48 snap-start" : ""
      }`}
    >
      <div className="card-thumb relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 ring-1 ring-white/5 group-hover:ring-2 group-hover:ring-brand-500/50 transition-all"
        style={
          movie.poster_path
            ? { backgroundImage: `url(${posterUrl(movie.poster_path)})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {/* Rank number (idlixku stroke italic style) */}
        {rank !== undefined && (
          <span
            className="rank-number absolute -top-2 -left-1 text-[5rem] leading-none pointer-events-none z-10"
          >
            {rank}
          </span>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent z-0 pointer-events-none"></div>

        {/* Quality badge (top-right) — derive from vote_average as proxy */}
        <div className="absolute top-2 right-2 z-10">
          <span className={`quality-badge q-${movie.vote_average && movie.vote_average >= 8 ? "1080" : movie.vote_average && movie.vote_average >= 6 ? "720" : "480"}`}>
            HD
          </span>
        </div>

        {/* Rating + views (bottom) */}
        <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
          {movie.vote_average ? movie.vote_average.toFixed(1) : "—"}
        </div>
        <div className="absolute bottom-2 right-2 z-10 text-[10px] text-gray-300 flex items-center gap-1 font-semibold">
          <MessageSquare className="w-2.5 h-2.5 text-gray-400" />
          {formatViews(movie.vote_count)}
        </div>

        {/* Play button overlay (idlixku hover reveal) */}
        <div className="card-play absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 group-hover:bg-brand-500 flex items-center justify-center shadow-xl ring-2 ring-white/20">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Title + year (idlixku-style truncate + muted year) */}
      <h3 className="text-sm font-medium text-white truncate group-hover:text-brand-400 transition-colors">{title}</h3>
      <p className="text-[11px] text-gray-500 -mt-1">{formatYear(movie.release_date)}</p>
    </Link>
  );
}

// SeriesCard — idlixku-polished: TV badge, rank stroke, quality badge
export function SeriesCard({
  series,
  rank,
  featured = false,
}: {
  series: TMDBMovie;
  rank?: number;
  featured?: boolean;
}) {
  const title = series.name || series.title || "Untitled";
  const href = `/series/${buildSeriesSlug(series)}`;
  return (
    <Link
      href={href}
      className={`group video-card flex flex-col gap-2 fade-in ${
        featured ? "flex-none w-40 md:w-48 snap-start" : ""
      }`}
    >
      <div className="card-thumb relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 ring-1 ring-white/5 group-hover:ring-2 group-hover:ring-brand-500/50 transition-all"
        style={
          series.poster_path
            ? { backgroundImage: `url(${posterUrl(series.poster_path)})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        {/* Rank number */}
        {rank !== undefined && (
          <span
            className="rank-number absolute -top-2 -left-1 text-[5rem] leading-none pointer-events-none z-10"
          >
            {rank}
          </span>
        )}

        {/* TV badge (top-right) */}
        <div className="absolute top-2 right-2 z-10">
          <span className="tv-badge">
            <Tv className="w-2 h-2" />
            TV
          </span>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent z-0 pointer-events-none"></div>

        {/* Rating + views */}
        <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
          {series.vote_average ? series.vote_average.toFixed(1) : "—"}
        </div>
        <div className="absolute bottom-2 right-2 z-10 text-[10px] text-gray-300 flex items-center gap-1 font-semibold">
          <MessageSquare className="w-2.5 h-2.5 text-gray-400" />
          {formatViews(series.vote_count)}
        </div>

        {/* Play button overlay */}
        <div className="card-play absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 group-hover:bg-brand-500 flex items-center justify-center shadow-xl ring-2 ring-white/20">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>

      <h3 className="text-sm font-medium text-white truncate group-hover:text-brand-400 transition-colors">{title}</h3>
      <p className="text-[11px] text-gray-500 -mt-1">{formatYear(series.first_air_date)}</p>
    </Link>
  );
}

import Link from "next/link";
import { Play, Star, MessageSquare, Tv } from "lucide-react";
import {
  type TMDBMovie,
  type TMDBSeries,
  posterUrl,
  formatYear,
  formatViews,
  slugify,
} from "@/lib/tmdb";

// MovieCard — IDLIX template style:
// - Portrait aspect-[2/3] poster
// - Big numbered rank (1, 2, 3...) top-left with text-shadow
// - S badge top-right (season indicator placeholder)
// - Rating bottom-left, vote count bottom-right
// - Title below poster (truncate)
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
  const href = `/movie/${slugify(movie.title || movie.name, movie.release_date)}`;
  return (
    <Link
      href={href}
      className={`group cursor-pointer flex flex-col gap-2 fade-in ${
        featured ? "flex-none w-40 md:w-48 snap-start" : ""
      }`}
    >
      <div
        className="relative aspect-[2/3] rounded-lg overflow-hidden bg-cover bg-center bg-ink-800"
        style={
          movie.poster_path
            ? { backgroundImage: `url(${posterUrl(movie.poster_path)})` }
            : undefined
        }
      >
        {/* Big numbered rank (top-left) — only if rank provided */}
        {rank !== undefined && (
          <span
            className="absolute -top-2 -left-1 text-[5rem] font-black text-white z-10 leading-none pointer-events-none"
            style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)" }}
          >
            {rank}
          </span>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent z-0 pointer-events-none"></div>

        {/* Rating (bottom-left) */}
        <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
          {movie.vote_average ? movie.vote_average.toFixed(1) : "—"}
        </div>

        {/* Vote count (bottom-right) */}
        <div className="absolute bottom-2 right-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <MessageSquare className="w-2.5 h-2.5 text-gray-400" />
          {formatViews(movie.vote_count)}
        </div>

        {/* Hover play overlay */}
        <div className="card-play absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-medium text-white truncate">{title}</h3>
    </Link>
  );
}

// SeriesCard — same IDLIX template style, with TV icon badge
export function SeriesCard({
  series,
  rank,
}: {
  series: TMDBSeries;
  rank?: number;
}) {
  const title = series.name || series.title || "Untitled";
  const href = `/series/${slugify(series.name || series.title, series.first_air_date)}`;
  return (
    <Link
      href={href}
      className="group cursor-pointer flex flex-col gap-2 fade-in"
    >
      <div
        className="relative aspect-[2/3] rounded-lg overflow-hidden bg-cover bg-center bg-ink-800"
        style={
          series.poster_path
            ? { backgroundImage: `url(${posterUrl(series.poster_path)})` }
            : undefined
        }
      >
        {/* Big numbered rank (top-left) */}
        {rank !== undefined && (
          <span
            className="absolute -top-2 -left-1 text-[5rem] font-black text-white z-10 leading-none pointer-events-none"
            style={{ textShadow: "2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)" }}
          >
            {rank}
          </span>
        )}

        {/* TV badge (top-right) — TV icon indicator */}
        <span className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/20 z-10 inline-flex items-center gap-1">
          <Tv className="w-2 h-2" />
          TV
        </span>

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent z-0 pointer-events-none"></div>

        {/* Rating (bottom-left) */}
        <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
          {series.vote_average ? series.vote_average.toFixed(1) : "—"}
        </div>

        {/* Vote count (bottom-right) */}
        <div className="absolute bottom-2 right-2 z-10 text-[10px] text-white flex items-center gap-1 font-semibold">
          <MessageSquare className="w-2.5 h-2.5 text-gray-400" />
          {formatViews(series.vote_count)}
        </div>

        {/* Hover play overlay */}
        <div className="card-play absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 fill-white ml-0.5" />
          </div>
        </div>
      </div>
      <h3 className="text-sm font-medium text-white truncate">{title}</h3>
    </Link>
  );
}

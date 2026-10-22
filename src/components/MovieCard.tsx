import Link from "next/link";
import { Play, Tv } from "lucide-react";
import {
  type TMDBMovie,
  type TMDBSeries,
  posterUrl,
  formatYear,
  formatViews,
  slugify,
} from "@/lib/tmdb";

// Shared MovieCard — used by homepage (featured + grid) and /movie/ listing.
export function MovieCard({
  movie,
  featured = false,
}: {
  movie: TMDBMovie;
  featured?: boolean;
}) {
  const title = movie.title || movie.name || "Untitled";
  const href = `/movie/${slugify(movie.title || movie.name, movie.release_date)}`;
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

// Shared SeriesCard — used by homepage and /series/ listing.
export function SeriesCard({ series }: { series: TMDBSeries }) {
  const title = series.name || series.title || "Untitled";
  const href = `/series/${slugify(series.name || series.title, series.first_air_date)}`;
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

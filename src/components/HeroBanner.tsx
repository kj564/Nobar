"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Play, Star, ChevronLeft, ChevronRight, Info } from "lucide-react";
import {
  type TMDBMovie,
  type TMDBMovieDetail,
  backdropUrl,
  logoUrl,
  formatYear,
  formatViews,
  buildMovieSlug,
  buildSeriesSlug,
  fetchMovieDetail,
  fetchMovieImages,
} from "@/lib/tmdb";

type HeroBannerProps = {
  movies: TMDBMovie[];
};

export function HeroBanner({ movies }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [details, setDetails] = useState<Record<number, TMDBMovieDetail>>({});
  const [logos, setLogos] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (movies.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [movies.length]);

  useEffect(() => {
    if (movies.length === 0) return;
    let cancelled = false;
    Promise.all(
      movies.map(async (m) => {
        try {
          const [detail, images] = await Promise.all([
            fetchMovieDetail(m.id),
            fetchMovieImages(m.id),
          ]);
          return {
            id: m.id,
            detail,
            logo: images.logos?.[0]?.file_path || null,
          };
        } catch {
          return { id: m.id, detail: null, logo: null };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const detailMap: Record<number, TMDBMovieDetail> = {};
      const logoMap: Record<number, string | null> = {};
      for (const r of results) {
        if (r.detail) detailMap[r.id] = r.detail;
        logoMap[r.id] = r.logo;
      }
      setDetails(detailMap);
      setLogos(logoMap);
    });
    return () => {
      cancelled = true;
    };
  }, [movies]);

  const goToSlide = useCallback(
    (index: number) => {
      if (movies.length === 0) return;
      setActiveIndex(((index % movies.length) + movies.length) % movies.length);
    },
    [movies.length]
  );

  const goPrev = useCallback(() => goToSlide(activeIndex - 1), [activeIndex, goToSlide]);
  const goNext = useCallback(() => goToSlide(activeIndex + 1), [activeIndex, goToSlide]);

  if (movies.length === 0) {
    return (
      <section className="relative h-screen min-h-[600px] w-full bg-ink-950 overflow-hidden">
        <div className="absolute inset-0 skeleton opacity-30" />
        <div className="absolute bottom-0 left-0 px-6 md:px-12 pb-24 space-y-4 max-w-2xl">
          <div className="skeleton h-5 w-20 rounded" />
          <div className="skeleton h-16 w-80 rounded" />
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton h-24 w-full rounded" />
          <div className="skeleton h-12 w-40 rounded-lg" />
        </div>
      </section>
    );
  }

  const movie = movies[activeIndex];
  const title = movie.title || movie.name || "Untitled";
  const backdrop = backdropUrl(movie.backdrop_path, "original");
  const isMovie = Boolean(movie.title);
  const mediaTypeLabel = isMovie ? "Film" : "TV Series";
  const href = isMovie ? `/movie/${buildMovieSlug(movie)}` : `/series/${buildSeriesSlug(movie)}`;
  const detail = details[movie.id];
  const logo = logos[movie.id];
  const tagline = detail?.tagline;
  const genres = detail?.genres?.slice(0, 3).map((g) => g.name).join(", ");
  const overview = movie.overview || "Belum ada sinopsis resmi untuk film ini.";
  const status = detail?.status;
  const ongoingStatuses = ["Returning Series", "In Production", "Post Production", "Planned", "Rumored", "Pilot"];
  const endedStatuses = ["Ended", "Canceled"];
  const isOngoing = status && ongoingStatuses.includes(status);
  const isEnded = status && endedStatuses.includes(status);

  return (
    <section className="relative h-screen min-h-[600px] w-full overflow-hidden bg-ink-950">
      {/* Background image */}
      {backdrop && (
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdrop} alt={title} fetchPriority="high" className="w-full h-full object-cover opacity-80" />
        </div>
      )}

      {/* Gradient overlays — match IDLIX dual layer */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-0 pointer-events-none" />

      {/* Slider arrows (desktop) */}
      {movies.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white transition"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={goNext}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 items-center justify-center rounded-full bg-black/40 hover:bg-black/70 text-white transition"
            aria-label="Next slide"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Main content — bottom left, half width */}
      <main className="relative z-10 flex flex-col justify-end w-full md:w-1/2 px-6 md:px-12 pb-24 gap-y-3 h-full">
        {/* Badge */}
        <div className="bg-brand-500 text-white text-[11px] font-bold px-2 py-1 rounded w-max tracking-wider uppercase">
          {mediaTypeLabel}
        </div>

        {/* Tagline (above title) */}
        {tagline && tagline.trim() !== "" && (
          <p className="text-gray-400 italic text-sm md:text-base font-light">
            {tagline}
          </p>
        )}

        {/* Title — logo image if available, else text */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl(logo, "w500")}
            alt={title}
            className="w-64 md:w-80 lg:w-96 object-contain my-1 drop-shadow-2xl"
          />
        ) : (
          <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight my-1 text-balance">
            {title}
          </h1>
        )}

        {/* Metadata line */}
        <div className="flex flex-wrap items-center text-xs md:text-sm text-gray-300 gap-y-2 gap-x-2">
          {detail?.vote_average && (
            <div className="flex items-center font-bold">
              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500 mr-1" />
              <span className="text-yellow-500">{detail.vote_average.toFixed(1)}</span>
            </div>
          )}
          <span className="text-gray-600">•</span>
          <span>{formatYear(movie.release_date)}</span>
          {detail?.runtime && (
            <>
              <span className="text-gray-600">•</span>
              <span>{Math.floor(detail.runtime / 60)}h {detail.runtime % 60}m</span>
            </>
          )}
          <span className="text-gray-600">•</span>
          <span>{formatViews(movie.vote_count)} suara</span>
          {genres && (
            <>
              <span className="text-gray-600 hidden sm:inline">•</span>
              <span className="hidden sm:inline text-gray-300">{genres}</span>
            </>
          )}
          {isOngoing && (
            <span className="ml-1 border border-green-500 text-green-500 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-green-500/10 uppercase">
              Ongoing
            </span>
          )}
          {isEnded && (
            <span className="ml-1 border border-accent-500 text-accent-500 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide bg-accent-500/10 uppercase">
              {status}
            </span>
          )}
        </div>

        {/* Synopsis */}
        <p className="text-gray-400 text-sm md:text-base leading-snug max-w-xl mb-2 line-clamp-2 sm:line-clamp-3">
          {overview}
        </p>

        {/* CTA buttons */}
        <div className="flex items-center gap-3">
          <Link
            href={href}
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 px-6 rounded-lg flex items-center gap-3 w-max transition-all shadow-lg shadow-brand-500/30 group"
          >
            <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
            <span>Watch Now</span>
          </Link>
          <Link
            href={href}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2.5 px-6 rounded-lg flex items-center gap-3 w-max transition border border-white/10"
          >
            <Info className="w-4 h-4" />
            <span>Detail</span>
          </Link>
        </div>
      </main>

      {/* Slider dots — bottom LEFT (IDLIX style) */}
      {movies.length > 1 && (
        <div className="absolute bottom-8 left-6 md:left-12 flex space-x-2 items-center z-10">
          {movies.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`rounded-full cursor-pointer transition-all duration-300 ${
                i === activeIndex
                  ? "h-1.5 w-8 bg-brand-500"
                  : "h-1.5 w-1.5 bg-gray-500 hover:bg-gray-400"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

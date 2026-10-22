"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Play, Star, Info, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type TMDBMovie,
  backdropUrl,
  formatYear,
  formatViews,
  slugify,
} from "@/lib/tmdb";

type HeroBannerProps = {
  movies: TMDBMovie[];
};

export function HeroBanner({ movies }: HeroBannerProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-rotate every 8 seconds when multiple movies available
  useEffect(() => {
    if (movies.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [movies.length]);

  const goToSlide = useCallback(
    (index: number) => {
      if (movies.length === 0) return;
      setActiveIndex(((index % movies.length) + movies.length) % movies.length);
    },
    [movies.length]
  );

  const goPrev = useCallback(() => goToSlide(activeIndex - 1), [activeIndex, goToSlide]);
  const goNext = useCallback(() => goToSlide(activeIndex + 1), [activeIndex, goToSlide]);

  // Skeleton state — no movies loaded yet
  if (movies.length === 0) {
    return (
      <div className="relative w-full h-[65vh] sm:h-[75vh] md:h-[85vh] min-h-[460px] max-h-[720px] bg-[#141414] overflow-hidden">
        <div className="absolute inset-0 skeleton opacity-30" />
        <div className="absolute bottom-0 left-0 w-full p-5 sm:p-10 md:p-14 flex flex-col items-start justify-end h-full gap-4">
          <div className="skeleton h-6 w-24 rounded" />
          <div className="skeleton h-12 w-3/4 max-w-2xl rounded" />
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton h-16 w-full max-w-md rounded" />
          <div className="skeleton h-12 w-40 rounded" />
        </div>
      </div>
    );
  }

  const movie = movies[activeIndex];
  const title = movie.title || movie.name || "Untitled";
  const backdrop = backdropUrl(movie.backdrop_path, "original");
  const slug = slugify(movie.title || movie.name, movie.release_date);
  const isMovie = Boolean(movie.title);
  const mediaTypeLabel = isMovie ? "Film" : "TV Series";
  const href = isMovie ? `/movie/${slug}` : `/series/${slug}`;

  return (
    <div
      id="heroBannerSection"
      className="relative w-full h-[65vh] sm:h-[75vh] md:h-[85vh] min-h-[460px] max-h-[720px] bg-[#141414] bg-cover bg-center bg-no-repeat overflow-hidden"
      style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
    >
      {/* Gradient overlays — dual layer for text contrast on mobile */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/75 to-[#141414]/30 md:via-[#141414]/40 md:to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />

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

      {/* Content — bottom left, flex column */}
      <div className="absolute bottom-0 left-0 w-full p-5 sm:p-10 md:p-14 z-10 flex flex-col items-start justify-end h-full">
        {/* Red badge — media type */}
        <div className="bg-brand-500 text-white text-xs font-bold px-3 py-1.5 rounded mb-4 uppercase tracking-wider">
          {mediaTypeLabel}
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight mb-4 max-w-2xl text-balance">
          {title}
        </h1>

        {/* Metadata info bar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm font-semibold mb-4 text-gray-200">
          {/* Rating — gold star */}
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
            <span className="text-yellow-500">
              {movie.vote_average ? movie.vote_average.toFixed(1) : "—"}
            </span>
          </span>
          <span className="text-gray-600">•</span>
          {/* Year */}
          <span>{formatYear(movie.release_date)}</span>
          <span className="text-gray-600">•</span>
          {/* Vote count */}
          <span className="text-gray-400 font-normal">
            {formatViews(movie.vote_count)} suara
          </span>
          {/* Ongoing badge — green */}
          <span className="bg-emerald-600/90 text-white text-[10px] sm:text-xs px-2 py-0.5 rounded font-bold uppercase">
            Ongoing
          </span>
        </div>

        {/* Synopsis — line-clamp responsive */}
        <p className="line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm max-w-xs sm:max-w-md md:max-w-xl text-gray-300 mb-6 leading-relaxed">
          {movie.overview || "Tidak ada deskripsi tersedia untuk saat ini."}
        </p>

        {/* CTA buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={href}
            className="bg-brand-500 text-white flex items-center gap-2 px-6 py-2.5 sm:px-8 sm:py-3.5 rounded font-bold text-sm sm:text-base hover:bg-red-700 transition transform active:scale-95 shadow-lg shadow-brand-500/30"
          >
            <Play className="w-4 h-4 fill-white" />
            Watch Now
          </Link>
          <Link
            href={href}
            className="bg-white/10 backdrop-blur text-white flex items-center gap-2 px-6 py-2.5 sm:px-8 sm:py-3.5 rounded font-bold text-sm sm:text-base hover:bg-white/20 transition border border-white/10"
          >
            <Info className="w-4 h-4" />
            Detail
          </Link>
        </div>
      </div>

      {/* Slider dots — bottom center */}
      {movies.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {movies.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? "w-10 bg-brand-500 hover:bg-red-400"
                  : "w-1.5 bg-gray-500 hover:bg-gray-400"
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

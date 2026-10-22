"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Play, Star, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type TMDBMovie,
  type TMDBMovieDetail,
  backdropUrl,
  logoUrl,
  formatYear,
  formatViews,
  slugify,
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

  // Auto-rotate every 8 seconds
  useEffect(() => {
    if (movies.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % movies.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [movies.length]);

  // Fetch ALL movie details + images in parallel on mount (NOT lazy).
  // Promise.all → parallel fetch, store in maps keyed by movie id.
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
            // Prefer first logo (English or language-neutral)
            logo: images.logos?.[0]?.file_path || null,
          };
        } catch (e) {
          console.warn("Hero fetch failed for", m.id, e);
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

  // Skeleton state
  if (movies.length === 0) {
    return (
      <div className="relative w-full h-[65vh] sm:h-[75vh] md:h-[85vh] min-h-[460px] max-h-[720px] bg-[#141414] overflow-hidden">
        <div className="absolute inset-0 skeleton opacity-30" />
        <div className="absolute bottom-0 left-0 w-full md:w-3/4 lg:w-3/5 xl:w-1/2 p-6 md:p-16 pb-28 flex flex-col justify-end gap-4">
          <div className="skeleton h-5 w-20 rounded" />
          <div className="skeleton h-24 w-80 rounded" />
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
          <div className="skeleton h-24 w-full max-w-md rounded" />
          <div className="skeleton h-12 w-40 rounded-lg" />
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
  const detail = details[movie.id];
  const logo = logos[movie.id];
  const tagline = detail?.tagline;
  const genres = detail?.genres?.slice(0, 3).map((g) => g.name).join(", ");
  const overview = movie.overview || "Belum ada sinopsis resmi untuk film ini.";

  return (
    <div
      id="heroBannerSection"
      className="relative w-full h-[65vh] sm:h-[75vh] md:h-[85vh] min-h-[460px] max-h-[720px] bg-[#141414] bg-cover bg-center bg-no-repeat overflow-hidden"
      style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}
    >
      {/* Background image with opacity (template: opacity-80) */}
      {backdrop && (
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backdrop}
            alt={title}
            className="w-full h-full object-cover opacity-80"
          />
        </div>
      )}

      {/* Heavy dark gradient overlays (template: dual layer) */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/80 to-transparent z-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent z-0" />

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

      {/* Main content — bottom left, half width on desktop */}
      <main className="relative z-10 flex-grow flex flex-col justify-end px-6 md:px-16 pb-28 w-full md:w-3/4 lg:w-3/5 xl:w-1/2 h-full">
        {/* Red badge — media type */}
        <div className="bg-brand-500 text-white text-xs font-bold px-3 py-1.5 rounded w-max mb-4 uppercase tracking-wider">
          {mediaTypeLabel}
        </div>

        {/* Title — logo image (TMDB /movie/{id}/images) if available, else text */}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl(logo, "w500")}
            alt={title}
            className="w-80 md:w-96 lg:max-w-md object-contain mb-2 drop-shadow-2xl"
          />
        ) : (
          <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight mb-2 text-balance">
            {title}
          </h1>
        )}

        {/* Tagline — conditional render (hidden if empty), below title.
            line-clamp-1 truncates with "..." if too long. */}
        {tagline && tagline.trim() !== "" && (
          <p className="text-gray-400 italic text-xs sm:text-sm font-medium tracking-wide mb-2 block line-clamp-1">
            {tagline}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center text-xs md:text-sm text-gray-300 mb-6 gap-y-2 mt-2">
          {/* Rating — gold star */}
          <div className="flex items-center mr-3 font-semibold">
            <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500 mr-1.5" />
            <span className="text-yellow-500">
              {movie.vote_average ? movie.vote_average.toFixed(1) : "—"}
            </span>
          </div>

          <span className="mx-2 text-gray-600 hidden sm:inline">•</span>

          {/* Year */}
          <span className="mr-3">{formatYear(movie.release_date)}</span>

          <span className="mx-2 text-gray-600 hidden sm:inline">•</span>

          {/* Vote count */}
          <span className="mr-3">{formatViews(movie.vote_count)} suara</span>

          {/* Genres (from pre-fetched detail) */}
          {genres && (
            <>
              <span className="mx-2 text-gray-600 hidden md:inline">•</span>
              <span className="mr-4 text-gray-400">{genres}</span>
            </>
          )}

          {/* Ongoing badge — outline style */}
          <span className="border border-green-500 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-green-500/10 mt-2 sm:mt-0">
            Ongoing
          </span>
        </div>

        {/* Synopsis — responsive line-clamp + fallback text.
            line-clamp-2 on mobile, line-clamp-3 on sm+ truncates with "..." */}
        <p className="text-gray-300 text-xs sm:text-sm md:text-base max-w-xs sm:max-w-md md:max-w-xl mb-6 line-clamp-2 sm:line-clamp-3 leading-relaxed">
          {overview}
        </p>

        {/* CTA button — rounded-lg + shadow + group hover */}
        <Link
          href={href}
          className="bg-brand-500 hover:bg-red-700 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center space-x-3 w-max transition-all shadow-lg shadow-brand-500/30 group"
        >
          <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
          <span>Watch Now</span>
        </Link>
      </main>

      {/* Slider dots — LEFT aligned (template: left-6 md:left-16) */}
      {movies.length > 1 && (
        <div className="absolute bottom-8 left-6 md:left-16 flex space-x-3 items-center z-10">
          {movies.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`h-1.5 rounded-full cursor-pointer transition-colors ${
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

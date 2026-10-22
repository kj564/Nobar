'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Subtitles, X, Loader2, Volume2, VolumeX } from 'lucide-react';

type FilmMeta = {
  title: string;
  originalTitle?: string;
  year: string;
  runtime: string;
  director: string;
  country: string;
  language: string;
  format: string;
  logline: string;
  notes: string[];
};

const FILM: FilmMeta = {
  title: 'Nobar',
  originalTitle: 'A Late-Night Screening',
  year: '2026',
  runtime: '2h 10m',
  director: 'Unlisted',
  country: 'ID',
  language: 'Indonesia · soft subs',
  format: '1080p · H.264 · MKV',
  logline:
    'A single feature, streamed plainly. No carousel, no algorithm, no autoplay trailer of something else. One room, one screen, one film.',
  notes: [
    'Streamed directly from a private source with byte-range seeking.',
    'Subtitle track carried inside the container — extracted on first request.',
    'Best experienced in fullscreen, with the lights low.',
  ],
};

export default function Home() {
  const [playing, setPlaying] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [subtitleReady, setSubtitleReady] = useState<boolean | null>(null);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Probe whether subtitle is available without blocking the page.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/subtitle', { method: 'GET' })
      .then((r) => {
        if (cancelled) return;
        setSubtitleReady(r.ok);
      })
      .catch(() => {
        if (!cancelled) setSubtitleReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying(true);
    // Wait for video to mount, then play.
    requestAnimationFrame(() => {
      const v = videoRef.current;
      if (v) {
        v.muted = muted;
        v.play().catch(() => {});
      }
    });
  }, [muted]);

  const exitPlayer = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    setPlaying(false);
  }, []);

  // Keyboard: Esc to exit, M to mute, C to toggle subs.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPlayer();
      if (e.key === 'm' || e.key === 'M') {
        const v = videoRef.current;
        if (v) {
          v.muted = !v.muted;
          setMuted(v.muted);
        }
      }
      if (e.key === 'c' || e.key === 'C') {
        setSubtitlesOn((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, exitPlayer]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header — minimal, editorial */}
      <header className="px-6 sm:px-10 lg:px-16 pt-8 pb-6 flex items-center justify-between border-b border-border/60">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl tracking-tight">Kinephile</span>
          <span className="hidden sm:inline text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            a streaming room
          </span>
        </div>
        <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span className="hidden sm:inline border-b border-foreground/40 pb-0.5 text-foreground">Now Showing</span>
          <span className="hidden md:inline opacity-40">Archive</span>
          <span className="hidden md:inline opacity-40">Notes</span>
        </nav>
      </header>

      {/* Hero — asymmetric, content-first, no gradient blobs */}
      <main className="flex-1 px-6 sm:px-10 lg:px-16 py-10 lg:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left: poster column */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
              {!posterLoaded && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted/40" />
              )}
              <img
                src="/api/poster"
                alt={`${FILM.title} — still frame`}
                onLoad={() => setPosterLoaded(true)}
                onError={() => setPosterLoaded(true)}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                  posterLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
              {/* Play overlay — appears on hover */}
              <button
                onClick={togglePlay}
                aria-label="Play film"
                className="group absolute inset-0 flex items-end justify-start p-5 bg-gradient-to-t from-black/70 via-black/0 to-black/0 transition-opacity duration-300 hover:from-black/80"
              >
                <span className="inline-flex items-center gap-2 text-sm tracking-wide text-foreground/90">
                  <span className="grid place-items-center h-10 w-10 rounded-full border border-foreground/60 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
                  </span>
                  <span className="uppercase tracking-[0.2em] text-[11px]">Begin</span>
                </span>
              </button>
            </div>
            {/* Caption under poster */}
            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Still · 00:05:00
            </p>
          </div>

          {/* Right: editorial column */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-6">
              <span>Now Showing</span>
              <span className="h-px flex-1 bg-border/60" />
              <span>{FILM.format}</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight text-balance">
              {FILM.title}
            </h1>
            <p className="font-serif italic text-xl sm:text-2xl text-muted-foreground mt-2">
              {FILM.originalTitle}
            </p>

            {/* Metadata strip — no generic card grid */}
            <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6 text-sm">
              <Meta label="Year" value={FILM.year} />
              <Meta label="Runtime" value={FILM.runtime} />
              <Meta label="Country" value={FILM.country} />
              <Meta label="Language" value={FILM.language} />
            </dl>

            <p className="mt-8 text-base sm:text-lg leading-relaxed text-foreground/85 text-pretty max-w-2xl">
              {FILM.logline}
            </p>

            {/* Action row */}
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={togglePlay}
                className="inline-flex items-center gap-3 px-7 py-3.5 bg-foreground text-background text-sm tracking-wide hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <Play className="h-4 w-4" fill="currentColor" />
                <span className="uppercase tracking-[0.18em] text-[11px]">Play Feature</span>
              </button>

              <button
                onClick={() => setSubtitlesOn((s) => !s)}
                disabled={subtitleReady === false}
                aria-pressed={subtitlesOn}
                className="inline-flex items-center gap-2.5 px-5 py-3.5 border border-border text-sm hover:border-foreground/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Subtitles className="h-4 w-4" />
                <span className="uppercase tracking-[0.18em] text-[11px]">
                  {subtitleReady === null
                    ? 'Subs · …'
                    : subtitleReady === false
                    ? 'Subs · None'
                    : subtitlesOn
                    ? 'Subs · On'
                    : 'Subs · Off'}
                </span>
              </button>

              <span className="ml-auto hidden sm:inline text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Press <kbd className="font-mono text-foreground/70 border border-border px-1.5 py-0.5">C</kbd> for subs · <kbd className="font-mono text-foreground/70 border border-border px-1.5 py-0.5">M</kbd> mute · <kbd className="font-mono text-foreground/70 border border-border px-1.5 py-0.5">Esc</kbd> exit
              </span>
            </div>

            {/* Notes — editorial blockquote feel */}
            <div className="mt-12 border-t border-border/60 pt-8 max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-4">
                Projection Notes
              </p>
              <ul className="space-y-3">
                {FILM.notes.map((n, i) => (
                  <li key={i} className="flex gap-3 text-sm text-foreground/70 leading-relaxed">
                    <span className="font-serif italic text-muted-foreground shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — quiet, sticky to bottom */}
      <footer className="mt-auto px-6 sm:px-10 lg:px-16 py-6 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Kinephile · No algorithm, no queue</span>
        <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
          source · private drive · range-enabled
        </span>
      </footer>

      {/* Player overlay */}
      {playing && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-4 text-white/80">
              <span className="font-serif text-lg">Now Playing</span>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                {FILM.title} · {FILM.year}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (v) {
                    v.muted = !v.muted;
                    setMuted(v.muted);
                  }
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="grid place-items-center h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setSubtitlesOn((s) => !s)}
                disabled={subtitleReady === false}
                aria-pressed={subtitlesOn}
                className="grid place-items-center h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <Subtitles className="h-4 w-4" />
              </button>
              <button
                onClick={exitPlayer}
                aria-label="Exit player"
                className="grid place-items-center h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Video */}
          <div className="flex-1 grid place-items-center bg-black">
            <video
              ref={videoRef}
              autoPlay
              controls
              playsInline
              className="max-h-full max-w-full h-full w-full"
            >
              <source src="/api/stream" type="video/mp4" />
              {subtitlesOn && subtitleReady !== false && (
                <track
                  src="/api/subtitle"
                  kind="subtitles"
                  label="Indonesia"
                  srcLang="id"
                  default
                />
              )}
            </video>
          </div>

          {/* Subtitle extraction hint */}
          {subtitleReady === null && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm text-white/70 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Extracting subtitle track from container…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
        {label}
      </dt>
      <dd className="text-sm text-foreground/90">{value}</dd>
    </div>
  );
}

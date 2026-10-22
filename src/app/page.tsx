'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Star, X, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { FILMS, ROWS, getFilm, type Film, type Source } from '@/lib/films';

export default function Home() {
  const [selected, setSelected] = useState<Film | null>(null);
  const [playing, setPlaying] = useState<{ film: Film; source: Source } | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Close modal on Escape, lock scroll when open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (playing) setPlaying(null);
        else if (selected) setSelected(null);
        else if (searchOpen) setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, selected, searchOpen]);

  useEffect(() => {
    document.body.style.overflow = playing || selected ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [playing, selected]);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return FILMS.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.director.toLowerCase().includes(q) ||
        f.genres.some((g) => g.toLowerCase().includes(q)) ||
        String(f.year).includes(q)
    );
  }, [query]);

  const featured = FILMS.find((f) => f.featured) ?? FILMS[0];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/60">
        <div className="px-4 sm:px-8 lg:px-12 py-4 flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-2xl tracking-tight">Kinephile</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              public-domain cinema
            </span>
          </div>
          <nav className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <button
              onClick={() => { setSearchOpen(true); }}
              className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            <span className="hidden md:inline border-b border-foreground/40 pb-0.5 text-foreground">Browse</span>
            <span className="hidden md:inline opacity-40">Lists</span>
            <span className="hidden md:inline opacity-40">Notes</span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className={`absolute inset-0 bg-gradient-to-br ${featured.stillColor}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
        <div className="relative px-4 sm:px-8 lg:px-12 pt-16 pb-20 lg:pt-28 lg:pb-32 max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-primary mb-4">
            Featured · {featured.year}
          </p>
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight text-balance">
            {featured.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/70">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              {featured.rating.toFixed(1)}
            </span>
            <span>{featured.runtime}</span>
            <span>{featured.country}</span>
            <span className="hidden sm:inline">{featured.language}</span>
          </div>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-foreground/85 text-pretty max-w-xl">
            {featured.logline}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setPlaying({ film: featured, source: featured.sources[0] })}
              className="inline-flex items-center gap-3 px-7 py-3.5 bg-foreground text-background hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              <span className="uppercase tracking-[0.18em] text-[11px]">Play</span>
            </button>
            <button
              onClick={() => setSelected(featured)}
              className="inline-flex items-center gap-3 px-6 py-3.5 border border-border hover:border-foreground/60 transition-colors"
            >
              <span className="uppercase tracking-[0.18em] text-[11px]">Details</span>
            </button>
          </div>
        </div>
      </section>

      {/* Rows */}
      <main className="flex-1 px-4 sm:px-8 lg:px-12 py-10 space-y-12">
        {filtered ? (
          <Row title={`Search · “${query}”`} subtitle={`${filtered.length} result${filtered.length === 1 ? '' : 's'}`} films={filtered} onSelect={setSelected} />
        ) : (
          ROWS.map((row) => (
            <Row
              key={row.title}
              title={row.title}
              subtitle={row.subtitle}
              films={row.ids.map((id) => getFilm(id)).filter(Boolean) as Film[]}
              onSelect={setSelected}
            />
          ))
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto px-4 sm:px-8 lg:px-12 py-6 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Kinephile · Public-domain cinema room</span>
        <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
          sources · internet archive · youtube
        </span>
      </footer>

      {/* Detail Modal */}
      {selected && (
        <DetailModal film={selected} onClose={() => setSelected(null)} onPlay={(src) => { setPlaying({ film: selected, source: src }); setSelected(null); }} />
      )}

      {/* Player Overlay */}
      {playing && (
        <PlayerOverlay film={playing.film} source={playing.source} onClose={() => setPlaying(null)} />
      )}

      {/* Search Overlay */}
      {searchOpen && (
        <SearchOverlay
          query={query}
          setQuery={setQuery}
          onClose={() => setSearchOpen(false)}
          onPick={(f) => { setSelected(f); setSearchOpen(false); }}
          results={filtered}
        />
      )}
    </div>
  );
}

function Row({ title, subtitle, films, onSelect }: { title: string; subtitle?: string; films: Film[]; onSelect: (f: Film) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (films.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button onClick={() => scrollBy(-1)} aria-label="Scroll left" className="grid place-items-center h-9 w-9 border border-border hover:border-foreground/60 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => scrollBy(1)} aria-label="Scroll right" className="grid place-items-center h-9 w-9 border border-border hover:border-foreground/60 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="flex gap-4 overflow-x-auto scrollbar-thin pb-2 -mx-1 px-1 snap-x"
        style={{ scrollbarWidth: 'thin' }}
      >
        {films.map((f) => (
          <FilmCard key={f.id} film={f} onSelect={() => onSelect(f)} />
        ))}
      </div>
    </section>
  );
}

function FilmCard({ film, onSelect }: { film: Film; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group relative shrink-0 w-40 sm:w-48 snap-start text-left"
    >
      <div className={`relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-br ${film.posterColor}`}>
        {/* Poster typography fallback — no AI image, just the title set in serif */}
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/70">{film.year}</span>
          <div>
            <span className="font-serif text-xl sm:text-2xl leading-tight text-white block">{film.title}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 mt-1 block">{film.director}</span>
          </div>
        </div>
        {/* Hover gradient + play hint */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 grid place-items-center h-12 w-12 rounded-full border border-white/70 bg-black/40 backdrop-blur-sm">
            <Play className="h-4 w-4 text-white translate-x-px" fill="currentColor" />
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{film.runtime}</span>
        <span className="inline-flex items-center gap-1">
          <Star className="h-3 w-3 fill-primary text-primary" />
          {film.rating.toFixed(1)}
        </span>
      </div>
    </button>
  );
}

function DetailModal({ film, onClose, onPlay }: { film: Film; onClose: () => void; onPlay: (s: Source) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin bg-card border border-border">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 z-10 grid place-items-center h-9 w-9 bg-black/60 text-white hover:bg-black/80 transition-colors">
          <X className="h-5 w-5" />
        </button>
        {/* Banner */}
        <div className={`relative h-48 sm:h-64 bg-gradient-to-br ${film.stillColor}`}>
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.25em] text-primary mb-2">{film.year} · {film.country}</p>
            <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">{film.title}</h2>
          </div>
        </div>
        {/* Body */}
        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/70 mb-5">
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                {film.rating.toFixed(1)}
              </span>
              <span>{film.runtime}</span>
              <span>{film.language}</span>
              <span>Dir. {film.director}</span>
            </div>
            <p className="text-base leading-relaxed text-foreground/85 text-pretty">{film.synopsis}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {film.genres.map((g) => (
                <span key={g} className="px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] border border-border text-muted-foreground">{g}</span>
              ))}
            </div>
          </div>
          <div className="sm:col-span-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Watch now</p>
            <div className="flex flex-col gap-2">
              {film.sources.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => onPlay(s)}
                  className={`inline-flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                    i === 0
                      ? 'bg-foreground text-background hover:bg-primary hover:text-primary-foreground'
                      : 'border border-border hover:border-foreground/60'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Play className="h-3.5 w-3.5" fill="currentColor" />
                    <span className="uppercase tracking-[0.16em] text-[11px]">{s.label}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">{s.kind}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
              All sources are legal public-domain streams or official trailers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerOverlay({ film, source, onClose }: { film: Film; source: Source; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-4 text-white/80">
          <span className="font-serif text-lg">{film.title}</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">{film.year} · {source.label}</span>
        </div>
        <button onClick={onClose} aria-label="Exit player" className="grid place-items-center h-9 w-9 text-white/70 hover:text-white hover:bg-white/10 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 grid place-items-center bg-black p-2 sm:p-4">
        <div className="w-full h-full max-w-[1280px] aspect-video">
          {source.kind === 'youtube' || source.kind === 'archive' ? (
            <iframe
              key={source.url}
              src={source.url}
              title={`${film.title} — ${source.label}`}
              className="w-full h-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchOverlay({ query, setQuery, onClose, onPick, results }: { query: string; setQuery: (s: string) => void; onClose: () => void; onPick: (f: Film) => void; results: Film[] | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card border border-border">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, director, genre, year…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button onClick={onClose} aria-label="Close search" className="grid place-items-center h-7 w-7 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {results === null ? (
            <div className="p-4 text-sm text-muted-foreground">Start typing to search the catalog.</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No films match “{query}”.</div>
          ) : (
            <ul>
              {results.map((f) => (
                <li key={f.id}>
                  <button onClick={() => onPick(f)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted transition-colors text-left">
                    <div className={`shrink-0 w-10 h-14 bg-gradient-to-br ${f.posterColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-base truncate">{f.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{f.year} · {f.director} · {f.runtime}</div>
                    </div>
                    <Star className="h-3.5 w-3.5 fill-primary text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground shrink-0">{f.rating.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

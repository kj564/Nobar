// Curated catalog of public-domain films.
// All entries stream from the Internet Archive (legal, free, public domain)
// or YouTube's official embed (trailers). No third-party piracy embeds,
// no private-drive proxies, no ffmpeg.

export type SourceKind = 'youtube' | 'archive';

export type Source = {
  kind: SourceKind;
  label: string;
  // For 'archive': Internet Archive embed URL (public-domain player).
  // For 'youtube': official YouTube embed URL (trailer).
  url: string;
};

export type Film = {
  id: string;
  title: string;
  year: number;
  director: string;
  runtime: string;
  country: string;
  language: string;
  rating: number; // 0-10
  genres: string[];
  logline: string;
  synopsis: string;
  posterColor: string; // tailwind gradient classes for poster placeholder
  stillColor: string; // tailwind gradient for hero backdrop
  sources: Source[];
  featured?: boolean;
};

const Y = (id: string) => `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
const IA = (id: string) => `https://archive.org/embed/${id}`;

export const FILMS: Film[] = [
  {
    id: 'nosferatu',
    title: 'Nosferatu',
    year: 1922,
    director: 'F.W. Murnau',
    runtime: '1h 34m',
    country: 'DE',
    language: 'Silent',
    rating: 7.9,
    genres: ['Horror', 'Silent', 'Public Domain'],
    logline:
      'A real-estate agent travels to the Carpathians and meets a count who casts a long, thin shadow over the city he returns to.',
    synopsis:
      'One of the most influential films of the silent era — an unauthorized adaptation of Dracula whose surviving prints were ordered destroyed by the Stoker estate. The count survived anyway. Public domain worldwide.',
    posterColor: 'from-slate-800 via-slate-900 to-black',
    stillColor: 'from-black via-slate-950 to-slate-900',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('Nosferatu1922') },
      { kind: 'youtube', label: 'Trailer · Restoration', url: Y('1zG4MBsWYpA') },
    ],
    featured: true,
  },
  {
    id: 'metropolis',
    title: 'Metropolis',
    year: 1927,
    director: 'Fritz Lang',
    runtime: '2h 23m',
    country: 'DE',
    language: 'Silent',
    rating: 8.3,
    genres: ['Sci-Fi', 'Silent', 'Public Domain'],
    logline:
      'A city of thinkers above and workers below; one man tries to bridge them, and nearly brings both worlds down.',
    synopsis:
      'A landmark of science-fiction and one of the most expensive films of the silent era. Restored in 2010 with rediscovered footage from Buenos Aires. Public domain.',
    posterColor: 'from-zinc-700 via-zinc-900 to-black',
    stillColor: 'from-zinc-950 via-zinc-900 to-amber-950/30',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('Metropolis1927') },
      { kind: 'youtube', label: 'Trailer · Restored', url: Y('Q0fcbWpYasg') },
    ],
  },
  {
    id: 'night-living-dead',
    title: 'Night of the Living Dead',
    year: 1968,
    director: 'George A. Romero',
    runtime: '1h 36m',
    country: 'US',
    language: 'English',
    rating: 7.8,
    genres: ['Horror', 'Cult', 'Public Domain'],
    logline:
      'Seven strangers barricade themselves in a farmhouse against a tide of the newly restless dead.',
    synopsis:
      'The film that codified the modern zombie. Released without a copyright notice, it immediately entered the public domain — a happy accident for everyone except its makers.',
    posterColor: 'from-stone-700 via-stone-900 to-black',
    stillColor: 'from-black via-stone-950 to-stone-900',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('NightOfTheLivingDead1968') },
      { kind: 'youtube', label: 'Trailer', url: Y('1FoyM3VxErs') },
    ],
  },
  {
    id: 'general',
    title: 'The General',
    year: 1926,
    director: 'Buster Keaton',
    runtime: '1h 7m',
    country: 'US',
    language: 'Silent',
    rating: 8.1,
    genres: ['Comedy', 'Action', 'Silent', 'Public Domain'],
    logline:
      'A Confederate engineer chases his stolen locomotive across enemy lines to rescue the woman he loves — and the engine he loves more.',
    synopsis:
      'Buster Keaton’s personal favorite of his own films. A real locomotive, a real bridge, a real river. The most expensive shot in silent comedy. Public domain.',
    posterColor: 'from-amber-800 via-stone-800 to-stone-950',
    stillColor: 'from-stone-950 via-amber-950/30 to-stone-900',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('TheGeneral1926') },
      { kind: 'youtube', label: 'Trailer', url: Y('8sZxjM7TyP0') },
    ],
  },
  {
    id: 'trip-moon',
    title: 'A Trip to the Moon',
    year: 1902,
    director: 'Georges Méliès',
    runtime: '13m',
    country: 'FR',
    language: 'Silent',
    rating: 8.0,
    genres: ['Sci-Fi', 'Silent', 'Public Domain', 'Short'],
    logline:
      'Astronomers build a bullet-shaped capsule, are fired from a giant cannon, and land in the eye of the moon.',
    synopsis:
      'The first science-fiction film. Colorized by hand, frame by frame, in 1902. The image of the rocket in the moon’s eye is one of the most reproduced shots in cinema. Public domain.',
    posterColor: 'from-indigo-900 via-stone-900 to-black',
    stillColor: 'from-black via-indigo-950/40 to-stone-950',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('ATripToTheMoon1902') },
      { kind: 'youtube', label: 'Restored · Color', url: Y('_FroVDvCefg') },
    ],
  },
  {
    id: 'charlie-chaplin-kid',
    title: 'The Kid',
    year: 1921,
    director: 'Charlie Chaplin',
    runtime: '1h 8m',
    country: 'US',
    language: 'Silent',
    rating: 8.2,
    genres: ['Comedy', 'Drama', 'Silent', 'Public Domain'],
    logline:
      'A tramp raises an abandoned child in a garret; five years later, the state decides that was a mistake.',
    synopsis:
      'Chaplin’s first feature. He kept the negative out of his divorce settlement by smuggling it to Salt Lake City in a crate labeled “screwdrivers.” Public domain.',
    posterColor: 'from-orange-900 via-stone-800 to-stone-950',
    stillColor: 'from-stone-950 via-orange-950/30 to-stone-900',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('TheKid1921') },
      { kind: 'youtube', label: 'Trailer', url: Y('7eLQy3U0e7Y') },
    ],
  },
  {
    id: 'movie-camera',
    title: 'Man with a Movie Camera',
    year: 1929,
    director: 'Dziga Vertov',
    runtime: '1h 8m',
    country: 'SU',
    language: 'Silent',
    rating: 8.1,
    genres: ['Documentary', 'Avant-garde', 'Silent', 'Public Domain'],
    logline:
      'A day in a Soviet city, shot by a man with a movie camera, edited by his wife, and watched by us, who are also being watched.',
    synopsis:
      'Often cited as the greatest documentary ever made. No actors, no script, no intertitles. Just the city, the cameraman, and the cut. Public domain.',
    posterColor: 'from-stone-700 via-stone-900 to-black',
    stillColor: 'from-black via-stone-950 to-stone-900',
    sources: [
      { kind: 'archive', label: 'Internet Archive', url: IA('ManWithAMovieCamera1929') },
      { kind: 'youtube', label: 'Restored', url: Y('zPw4e1LhYJ0') },
    ],
  },
];

export const ROWS: { title: string; subtitle?: string; ids: string[] }[] = [
  {
    title: 'Featured Tonight',
    subtitle: 'Tonight’s pick.',
    ids: ['nosferatu'],
  },
  {
    title: 'Public Domain · The Silent Era',
    subtitle: 'Free to watch, free to keep.',
    ids: ['nosferatu', 'metropolis', 'general', 'trip-moon', 'charlie-chaplin-kid', 'movie-camera'],
  },
  {
    title: 'After Dark · Horror',
    subtitle: 'For the lights-low hours.',
    ids: ['night-living-dead', 'nosferatu'],
  },
  {
    title: 'Short & Strange',
    subtitle: 'Under 15 minutes.',
    ids: ['trip-moon'],
  },
];

export function getFilm(id: string): Film | undefined {
  return FILMS.find((f) => f.id === id);
}

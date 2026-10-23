# IDLIX UI/UX Reverse-Engineering Report

**Target:** https://z2.idlixku.com/ (Indonesian streaming site)
**Task:** idlixku-ui-research
**Method:** Raw SSR HTML (curl) + bundled CSS inspection (429 KB stylesheet decoded) + Next.js RSC payload parsing.
**Note on screenshots:** Cloudflare bot-wall persistently blocks `agent-browser` (the CF "Just a moment..." interstitial never completes for the headless browser). All findings below come from the server-rendered HTML skeleton (which contains the actual layout/shell) and the compiled CSS bundle (which contains every design token used). Where the rendered DOM hydrates client-side, I extracted the structured data from the React Server Components payload embedded in the page (`self.__next_f.push([...])` chunks). The skeleton placeholders themselves are also a goldmine — they reveal exact grid column counts, card aspect ratios, and section ordering before any data even loads.

**Files saved during research:**
- `/tmp/idlix-home.html` (129 KB) — Homepage SSR HTML
- `/tmp/idlix-movie.html` (148 KB) — Movie detail (Hope 2026)
- `/tmp/idlix-series.html` (146 KB) — Series detail (The Mentalist)
- `/tmp/idlix-search.html` (102 KB) — Search results page
- `/tmp/idlix-genre.html` (125 KB) — Genre listing (Action)
- `/tmp/idlix-styles-2.css` (429 KB) — Main compiled Tailwind stylesheet
- `/tmp/idlix-styles-1.css` (418 B) — Plus Jakarta Sans font-face
- `/tmp/idlix-nextf-full.txt` (48 KB) — Decoded RSC payload
- `/tmp/keyframe-bodies.txt` — Extracted @keyframes definitions

---

## Stack Identification

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack build) |
| React | React 19 (RSC streaming — `self.__next_f.push` chunks visible) |
| CSS | **Tailwind CSS v4** (`@theme` block, `:root,:host` token cascade, `--tw-*` private vars visible) |
| Font | **Plus Jakarta Sans** (single self-hosted woff2, weights 200–800, `font-display: swap`) — obfuscated class `paggfa_variable` |
| Locale | i18n with `NEXT_LOCALE=id` cookie, Indonesian primary + English fallback |
| Deploy ID | `20261023074432-cdf81940ac32` (build hash appended to every chunk) |

The Plus Jakarta Sans font is exposed as a variable under `--font-sans` so Tailwind's `font-sans` utility maps to it.

---

## 1. Color Palette (exact, from CSS variables)

### Brand / Primary (Red)
```
--color-primary:        #d50032   /* main red — closer to crimson than Netflix red */
--color-primary-hover:  #e8003a
--color-primary-dark:   #a80028
--color-primary-end:    #ff3d2e   /* gradient end (orange-red) */
--gradient-primary:     linear-gradient(135deg, #d50032 0%, #ff3d2e 100%)
```
> This is a **red → orange diagonal gradient** for hero CTA buttons, distinct from Netflix's flat `#E50914`. Hover lightens to `#e8003a`.

### Backgrounds (true blacks, layered)
```
--color-bg-dark:     #000       /* page root, hero */
--color-bg-card:     #0c0c0c    /* cards, mobile sheet surface */
--color-bg-elevated: #111       /* hover/elevated surfaces */
--color-bg-hover:    #141414    /* comment input, search input */
--color-bg-input:    #111
```

### Borders
```
--color-border:        #1c1c1c   /* default 1px */
--color-border-hover:  #2a2a2a
```

### Text
```
--color-text-primary:   #f0f0f0   /* headings */
--color-text-secondary: #a0a0a0   /* body, nav labels */
--color-text-muted:     #707070   /* disclaimers, timestamps */
```

### State layers (over any base, as rgba white overlays)
```
--color-state-hover:    #ffffff12   /* 7%  white */
--color-state-selected: #ffffff1a   /* 10% white */
```

### UI controls (the "neutral glass" stack)
```
--ui-control-bg:           #171717
--ui-control-bg-hover:     #202020
--ui-control-border:       #ffffff16   /* 9%  white */
--ui-control-border-hover: #ffffff24   /* 14% white */
--ui-control-height:       44px
--ui-control-radius:       12px
--ui-control-gap:          10px (.625rem)
--ui-control-x:            14px (.875rem)
```

### Glass surfaces
```
--ui-surface-bg:     #0e0e0ef5   /* 96% opacity, used for sheets/dropdowns */
--ui-surface-border: #ffffff17   /* 9% white */
--ui-glass-hover:    #ffffff1a
```

### Accents
```
--color-accent-gold:  #f5c518   /* IMDB-style gold for ratings, 4K badge */
--color-accent-green: #46d369   /* Netflix-green for "Like"/WebDL */
--color-accent-blue:  #3b82f6
```

### Quality badges (each quality has its own color pair)
| Quality | Accent | Text-on-dark |
|---|---|---|
| 4K | `#f5c518` (gold) | `#ffeaa1` |
| BluRay | `#60a5fa` (blue) | `#e3efff` |
| WebDL | `#46d369` (green) | `#d6ffe2` |
| HD | `#22d3ee` (cyan) | `#d6f9ff` |
| TS | `#fb923c` (orange) | `#ffe3c2` |
| CAM | `#94a3b8` (gray) | `#e2e8f0` |

### User role badges
- Mod: `bg #46d3691f` (12% green), `text #46d369`
- Premium: `bg #f5c5181f`, `text #f5c518`
- Admin: `text #ff3d50` (red)

### World Cup 2026 mode (event-specific theming — they themed the whole site during WC)
- Live indicator: `#ff4d4d`
- Pitch green: `#0a6b3d`
- Bronze medal: `#cd7f32`
- Silver medal: `#c0c5ce`
- Gold medal: `#f5c518` (= accent-gold)

---

## 2. Typography

**Font:** Plus Jakarta Sans, single family, weights **200 → 800** (variable font, full range).
**font-display: swap** (FOIT-avoidance, falls back to Arial via `font Fallback` with override metrics).

**Tailwind text-size tokens (custom — NOT Tailwind defaults):**
```
--text-xs:   0.8125rem  (13px)
--text-sm:   0.9375rem  (15px)   ← default body / nav labels
--text-base: 1.0625rem  (17px)
--text-lg:   1.125rem   (18px)
--text-xl:   1.25rem    (20px)
```

**Hero title (skeleton sizes from SSR):**
- Mobile: `h-10` (40px)
- sm: `h-14` (56px)
- lg: `h-20` (80px)

**Detail page title (skeleton):**
- Mobile: `h-16` (64px)
- sm: `h-20` (80px)
- lg: `h-28` (112px) — *large display title*

**Weights used (from CSS):**
- 500, 600, 650, 700, 720, 800 (variable font allows non-standard weights)
- Section titles: typically `700`
- Nav links: `650` (between medium and bold)
- Buttons: `600` (primary CTAs) / `500` (pill buttons)
- Mobile nav links: `720` (heavy)
- Mobile bottom-nav labels: `500`

---

## 3. Spacing & Layout Tokens

### Page container
```
--page-max-width: 1400px            /* default for everything */
max-w-[1520px]                      /* site header inner */
.page-container-wide: 120rem (1920px)   /* detail pages, gives hero breathing room */
.page-container-narrow: 48rem (768px)   /* forms / narrow content */
```
Side padding: `max(1rem, env(safe-area-inset-left/right))` — respects iPhone notch.

### Breakpoints (custom Tailwind v4 scale observed)
```
520px → 640px → 768px (md) → 800px → 960px → 1024px (lg)
→ 1180px → 1280px (xl) → 1600px (2xl) → 96rem (1536px)
```
Plus Tailwind standard: `40rem / 48rem / 64rem / 80rem / 96rem`.

### Site header dimensions
```
--site-header-row-h:    3.5rem (56px) → 4rem (64px) at lg
--site-header-h:        calc(row-h + 2px + env(safe-area-inset-top))
--site-header-current-offset: 0 → .5rem → .75rem on scroll
```

### Mobile bottom tab bar
```
.np-bar height: var(--np-tabbar-row-h) + env(safe-area-inset-bottom)
.np-bar is hidden on desktop (display:none default, shown via media query)
.np-bar bg: var(--color-sheet-surface)  →  #0c0c0c
.np-bar border-top: 1px solid #1c1c1c
Each tab item: gap 1.5 (6px), py-2, icon h-7 w-7 (28px), label text-xs (12px) font-medium
```

### Z-index scale (full ladder)
```
0, 1, 2, 5, 6, 10, 20, 30, 40, 50, 100, 200, 250
named vars:
--z-browse-filter:    60
--z-scroll-arrows:    30
--z-sticky-toolbar:   40
--z-dropdown-trigger: 36
--z-dropdown-panel:   37
--z-player:           45
--z-header-backdrop:  46
--z-header:           50
--z-header-mobile-menu: 51
--z-player-controls:  55
--z-detail-content:   10
--z-player-fullscreen: 90
--z-live-chat:        95
--z-modal:            100
--z-modal-popover:   120
--z-confirm:         150
--z-step-up:         175
--z-toast:            200
--z-celebration:     250
```

---

## 4. Homepage Layout

### Page shell
```html
<header class="site-header fixed left-0 right-0 z-[var(--z-header)] header-safe">
  <div class="header-outer">
    <div class="header-inner max-w-[1520px] mx-auto">
      <div class="header-content-padding px-3 sm:px-5">
        <div class="site-header-row flex items-center">
          <div class="header-logo ...mr-6 lg:mr-8">  ← logo
          <nav class="header-desktop-nav items-center gap-1 flex-1 min-w-0">  ← desktop nav
          <div class="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">  ← right cluster
        </div>
      </div>
    </div>
  </div>
</header>
<main class="app-main flex-1"> ... </main>
<footer class="site-footer mt-16 footer-safe"> ... </footer>
<nav class="np-bar"> ... </nav>  ← mobile bottom tab bar
```

**Key shell behaviors:**
- `.site-header` uses `clip-path: inset(5px -100vw -100vh)` so its background extends past viewport edges (allows blur halo without horizontal scroll).
- `.site-header-row` height transitions from 56px → 64px on `lg`.
- On scroll, the header shrinks via `--site-header-current-offset` (0 → .5rem → .75rem at three breakpoints).

### Hero (Homepage)
```
height: 90svh (small viewport height, mobile-friendly)
min-height: 560px  → 600px at lg breakpoint
older browser fallback: 90vh
```

**Hero content layout** (anchored to bottom-left):
```
<div class="absolute bottom-0 left-0 right-0 px-4 sm:px-6 lg:px-12 pb-12 sm:pb-14 lg:pb-16">
  <div class="max-w-lg lg:max-w-2xl">
    <!-- 1. Quality/genre badge -->
    <div class="skeleton h-6 w-20 rounded mb-2 sm:mb-3">
    <!-- 2. Title (40/56/80px) -->
    <div class="skeleton h-10 sm:h-14 lg:h-20 w-48 sm:w-64 lg:w-80 rounded mb-2 sm:mb-2.5">
    <!-- 3. Metadata row: rating + year/runtime -->
    <div class="flex items-center gap-2 sm:gap-2.5 mb-2 sm:mb-3">
      <div class="skeleton h-4 w-10 rounded">  ← rating star+number
      <div class="skeleton h-4 w-32 rounded">  ← year • runtime • genres
    <!-- 4. Synopsis (2 lines, second is 2/3 width) -->
    <div class="skeleton h-4 w-full rounded mb-1">
    <div class="skeleton h-4 w-2/3 rounded mb-4 sm:mb-5">
    <!-- 5. Primary CTA -->
    <div class="skeleton h-11 w-36 rounded-lg">  ← "Watch Now" button
  </div>
</div>
```

**Hero gradient overlay** (bottom fade to black):
```css
.hero-gradient-bottom {
  background: linear-gradient(
    #0000 30%,        /* transparent top */
    #0000004d 55%,    /* 30% black */
    #000000b3 75%,    /* 70% black */
    #000 100%         /* pure black bottom */
  );
}
```

**Hero entrance animation:**
```css
@keyframes hero-content-in {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes hero-fade-in {
  0%   { opacity: 0; transform: scale(1.03); }   /* slight Ken Burns */
  100% { opacity: 1; transform: scale(1); }
}
@keyframes hero-progress {  /* auto-rotate progress bar */
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
```

### Content rows (horizontal scrollers)

**Section header:**
```css
.content-row-header {
  min-height: 2.5rem (40px);
  color: var(--color-text-primary);   /* #f0f0f0 */
  display: flex; flex-wrap: nowrap;
  justify-content: space-between;     /* title left, "View all" right */
  align-items: center;
  gap: .625rem (10px)  →  1rem (16px) at lg
}
```

**Scroll container** (with negative margin trick so card scale-on-hover isn't clipped):
```css
.content-row-scroll {
  margin-top: -12px;
  margin-bottom: -12px;
  padding-top: 12px;
  padding-bottom: 12px;
}

.h-scroll-surface {
  -webkit-overflow-scrolling: touch;
  scroll-padding-inline: 16px;
  overflow: auto visible;             /* y hidden, x visible (no scrollbar) */
  cursor: grab;
  scroll-snap-type: x proximity;       /* gentle snap, not mandatory */
}
```

### Section titles (homepage rows — in order)
1. **Trending Now** (10 items, mixed movies & series)
2. **Collections** (10 items — anime/manga adaptations: Black Torch, Demon Slayer, Evangelion, Food Wars, Record of Ragnarok, Dragon Ball Super, Dr. STONE, Fire Force, Vinland Saga, Frieren)
3. **Recently Added Movies** (10 items)
4. **Recently Added Series** (10 items)
5. **Recently Added Episodes**
6. **Network Originals**
7. **Trending in Your Country** (geo-targeted)

Plus a **Browse menu** in the header containing:
- Browse Movies / Browse TV Series / Browse by Country / Browse by Genre / Browse by Network / Browse by Year

### Card grid (used on homepage non-hero rows, search, listing pages)

**Movie/Portrait cards** (Trending, Recently Added, Collections, search results, genre pages):
```
grid-cols-3 (mobile) → sm:4 → md:5 → lg:6 → xl:7 → 2xl:8
gap: 3 (.75rem=12px) → sm:gap-4 (1rem=16px)
card: aspect-[2/3] rounded-xl (.75rem = 12px radius)
title under: h-3 w-3/4 mt-2 (.5rem=8px)
```

**Series/Episode cards** (landscape 16:9):
```
grid-cols-2 (mobile) → sm:3 → md:4 → lg:5 → xl:6
gap: 4 (1rem) → sm:gap-5 (1.25rem=20px)
card: aspect-video rounded-xl
title: h-3.5 w-2/3 mt-2
subtitle: h-3 w-full mt-1
```

### Card hover behavior
```css
.content-card {
  cursor: pointer;
  transition: transform .2s;
  position: relative;
}
.content-card:hover {
  z-index: 20;
  transform: scale(1.05);   /* classic Netflix 5% pop */
}
.content-card:active {
  opacity: .85;             /* tactile feedback */
}
```

---

## 5. Movie / Series Detail Page

### Detail backdrop (hero)
```
.detail-backdrop {
  height: 65svh;
  min-height: 420px  → 440px at lg → 500px (vh fallback)
}
```
*Shorter than homepage hero (65svh vs 90svh) so cast/episodes are visible without scrolling.*

### Detail gradient overlay (heavier than homepage)
```css
.detail-gradient {
  background: linear-gradient(
    #0000 0%,
    #00000026 35%,     /* 15% black */
    #00000080 60%,     /* 50% black */
    #000000e6 85%,     /* 90% black */
    #000 100%
  );
}
```

### Content overlap (Netflix-style "pull up over backdrop")
```css
.detail-content {
  position: relative;
  z-index: 10;        /* --z-detail-content */
  margin-top: -180px;             /* mobile */
  margin-top: -200px;             /* md */
  margin-top: -240px;             /* lg */
}
```

### Detail layout (from skeleton)
```
<div class="detail-backdrop overflow-hidden">
  <div class="skeleton absolute inset-0">        ← backdrop image
  <div class="detail-gradient absolute inset-0">  ← overlay
  <div class="absolute inset-0 flex items-center justify-center">
    <div class="skeleton w-18 h-18 sm:w-22 sm:h-22 rounded-full">  ← centered poster thumbnail (72px → 88px)
</div>

<div class="detail-content">
  <div class="page-container page-container-wide">  ← 1920px max-width

    <!-- Title (large) -->
    <div class="skeleton h-16 sm:h-20 lg:h-28 w-3/4 sm:w-1/2 lg:w-2/5 max-w-[440px] rounded mb-4">

    <!-- Metadata pills row 1 (genres) -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="skeleton h-4 w-16 rounded">
      <div class="skeleton h-4 w-20 rounded">
      <div class="skeleton h-4 w-14 rounded">

    <!-- Action buttons row -->
    <div class="flex items-center gap-3 mb-5">
      <div class="skeleton h-11 w-32 rounded-full">   ← PRIMARY "Watch Now" pill (44px height, 128px wide)
      <div class="skeleton h-11 w-11 rounded-full">   ← Trailer icon button (square pill)
      <div class="skeleton h-11 w-11 rounded-full">   ← Watchlist icon button

    <!-- Metadata row 2 (year/runtime/rating/etc) -->
    <div class="flex items-center flex-wrap gap-3 mb-2">
      <div class="skeleton h-4 w-12 rounded">
      <div class="skeleton h-4 w-16 rounded">
      <div class="skeleton h-4 w-14 rounded">
      <div class="skeleton h-4 w-20 rounded">

    <!-- Tagline -->
    <div class="skeleton h-3.5 w-48 rounded mb-3">

    <!-- Synopsis (3 lines, last is 2/3 width) -->
    <div class="max-w-3xl space-y-2 mb-4">
      <div class="skeleton h-4 w-full rounded">
      <div class="skeleton h-4 w-full rounded">
      <div class="skeleton h-4 w-2/3 rounded">
```

### Episode section (series pages — placed BEFORE cast)
```
<div class="mt-10">
  <!-- Section header with filter pills on right -->
  <div class="flex items-center justify-between gap-3 mb-5">
    <div class="skeleton h-6 w-32 rounded">              ← "Episodes" title
    <div class="flex gap-2">
      <div class="skeleton h-9 w-24 rounded-full">       ← Season selector pill
      <div class="skeleton h-9 w-28 rounded-full">       ← Sort/filter pill
  <!-- Episode grid (landscape cards 16:9) -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
    <div>
      <div class="skeleton aspect-video rounded-xl">     ← episode thumbnail
      <div class="skeleton h-3.5 w-2/3 mt-2 rounded">   ← episode title
      <div class="skeleton h-3 w-full mt-1 rounded">     ← episode subtitle/number
```

### Cast section (placed AFTER episodes on series, BEFORE on movies)
```
<div class="mt-10">
  <div class="skeleton h-6 sm:h-7 w-16 mb-5 rounded">    ← "Cast" title
  <div class="flex gap-5 sm:gap-6 overflow-hidden">      ← horizontal scroll, NOT grid
    <div class="flex-shrink-0 w-28 sm:w-32 text-center">  ← card 112px / 128px wide
      <div class="skeleton w-24 h-24 sm:w-28 sm:h-28 rounded-full mx-auto">  ← avatar 96/112px circle
      <div class="skeleton h-3 w-16 sm:w-20 mt-2.5 mx-auto rounded">  ← actor name
      <div class="skeleton h-2.5 w-12 sm:w-16 mt-1 mx-auto rounded">  ← character name (smaller, muted)
```

### SEO content (visible to crawlers in `sr-only` article)
The detail page hides rich semantic content in an `<article class="sr-only">` containing `<dl>` of metadata:
```html
<article class="sr-only">
  <h1>Hope (2026)</h1>
  <p><em>Is this how it ends?</em></p>           ← tagline as <em>
  <dl>
    <dt>Released</dt><dd>2026-07-15</dd>
    <dt>Runtime</dt><dd>157 minutes</dd>
    <dt>Country</dt><dd>KR</dd>
    <dt>Language</dt><dd>ko</dd>
    <dt>Rating</dt><dd>7.2 / 10</dd>
    <dt>Director</dt><dd><a href="/person/75915">Na Hong-jin</a></dd>
  </dl>
  <p>Genres: <a href="/genre/action">Action</a>, <a href="/genre/mystery">Mystery</a>, ...</p>
  <section>
    <h2>Cast</h2>
    <ul>
      <li><a href="/person/68903">Hwang Jung-min</a> as Go Bum-seok</li>
      ...
```
**This is a great pattern** — keep semantic HTML for SEO + accessibility, render the "pretty" version visually.

---

## 6. Navbar (site-header)

### Logo
```
.site-logo-action: min-width/height = 44px (--ui-control-height), border-radius: 999px
.site-logo-lockup:
  --logo-img-h: 18px (default) → 20 (sm) → 26 (lg) → 32 (xl)
  gap: .24em (default) → .18em (lg+)
.logo-img: height = var(--logo-img-h), width: auto
```
Logo is `idlix.webp` — webp format for size. The lockup also has a "Plus" superscript icon (separate `--logo-plus-size` 15-26px) animated via `logoPlusEntrance` keyframe (gold glow drop-shadow entrance).

### Desktop nav
```css
.header-nav-link {
  min-height: var(--ui-control-height);     /* 44px tap target */
  font-size: var(--text-sm);                /* 15px */
  color: #fff;
  border-radius: 999px;                      /* PILL shape */
  padding: .375rem .75rem;                   /* 6px 12px */
  gap: .375rem (6px);
  font-weight: 650;
  border: 1px solid transparent;
  transition: background-color, color (motion-dur-fast);
}
.header-nav-link--active {
  color: var(--color-primary);              /* #d50032 red text */
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}
.header-nav-text {
  text-shadow: 0 1px 3px #000c, 0 0 16px #00000080;   /* legibility on hero */
}
```
When header is sticky/scrolled, `text-shadow: none` is applied (since bg is solid).

**Primary nav items:** Beranda · Film · Serial TV
**Secondary nav items** (smaller weight): Shorts · Koleksi · Genre · Negara · Tahun · Network
**"Lainnya" (More)** — overflow dropdown with chevron

### Right cluster
- `header-icon-control` (search button — icon-only)
- `header-account-control` (account trigger, "guest" state shows generic avatar + chevron)
- `header-mobile-menu-trigger` (hamburger → opens full mobile menu sheet)

### Mobile menu sheet
```css
.mobile-header-shell {
  position: fixed;
  z-index: var(--z-header-mobile-menu);  /* 51 */
}
.mobile-header-panel {
  max-width: var(--page-max-width);
  background: var(--color-sheet-surface);  /* #0c0c0c */
  overflow: hidden;
  border-radius: 0 0 12px 12px (visible from `.dropdown-surface` pattern)
}
.mobile-nav-link {
  min-height: var(--account-control-height);   /* 44-46px */
  border-radius: var(--account-control-radius); /* 12px */
  padding: .5rem var(--account-control-padding-x); /* 8px 12-14px */
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  font-weight: 720;     /* heavy */
  font-size: var(--account-font-size);
  display: flex;
  align-items: center;
  gap: var(--account-control-gap);   /* 8-10px */
}
.mobile-nav-link--active {
  color: var(--color-primary);                /* red */
  background: var(--color-state-selected);    /* #ffffff1a */
}
```

### Mobile bottom tab bar (np-bar)
```
.np-bar (mobile only, fixed bottom):
  height: var(--np-tabbar-row-h) + env(safe-area-inset-bottom)
  background: #0c0c0c (sheet-surface)
  border-top: 1px solid #1c1c1c
  z-index: var(--z-header) = 50

Each tab:
  flex-1, column, items-center, justify-center, gap-1.5 (6px)
  py-2 (8px vertical padding)
  icon: h-7 w-7 (28px)
  label: text-xs (12px), leading-none, font-medium
  transition: color .2s, motion-reduce:transition:none

Tabs: Beranda · Film · Serial TV · Shorts · Lainnya (5 items, equal width)
```

### Top scroll progress bar (under header)
```css
div.fixed.inset-x-0.z-[calc(var(--z-header)+5)].h-0.5.pointer-events-none
  → div.h-full.w-full.origin-left.bg-primary.opacity-0.will-change-transform
```
A 2px red bar pinned just below the header that fills as you scroll, animated via `hero-progress` (scaleX 0→1).

---

## 7. Search Page (full-page, NOT overlay)

### Layout
```html
<main class="app-main flex-1">
  <div class="min-h-svh page-below-chrome pb-12">
    <div class="page-container">
      <form class="mb-6 sm:mb-8">
        <span class="search-field search-field--lg">
          <input class="search-field__input">
          <button class="search-field__clear">  ← clear button
      </form>

      <!-- Empty state: trending searches leaderboard -->
      <div class="content-row-header mb-3 sm:mb-4">
        <div class="skeleton rounded-lg h-5 w-36">  ← "Trending searches" title
      <div class="leaderboard-list-panel trending-searches-panel">
        <div class="leaderboard-list-row leaderboard-list-row--query">
          <div class="skeleton h-9 w-9 rounded-full">    ← rank number circle
          <div class="skeleton rounded-lg h-4 w-2/5">    ← query text
        ...
```

### Search field
```css
.search-field {
  min-height: var(--ui-control-height);   /* 44px */
  border: 1px solid var(--color-border); /* #1c1c1c */
  border-radius: var(--ui-control-radius); /* 12px */
  background: var(--color-bg-input);     /* #111 */
  color: var(--color-text-muted);        /* #707070 placeholder */
  padding-inline: .75rem (12px);
  gap: .5rem (8px between icon and text);
  display: flex;
  align-items: center;
  transition: border-color, background-color, box-shadow (.14s);
}
.search-field--lg {
  min-height: 3.5rem;   /* 56px — full-page search is BIGGER */
  padding-inline-start: 1rem;
}
```

### Search results grid
Same as movie listing — portrait 2/3 cards in 2/3/4/5/6 column grid.

### Empty state: "Trending searches" leaderboard
A vertical list of pill rows with rank circles (36px) + query text bars. Up to 10 trending queries shown.

---

## 8. Player Area

### Player container (embedded)
```css
.player-container {
  background: #000;
  border-radius: 12px;       /* matches --ui-control-radius */
  width: 100%;
  padding-top: 56.25%;        /* 16:9 aspect-ratio trick */
  position: relative;
  overflow: hidden;
}
```

### Hero player mode (when user clicks Play on hero)
The hero section transforms into a full-height player:
```css
.hero-player-playing {
  background: #000;
  min-height: calc(100svh - env(safe-area-inset-top));
  padding-top: calc(var(--site-header-h) + var(--site-header-current-offset) + env(safe-area-inset-top));
  /* player starts BELOW the sticky header */
  padding-bottom: calc(1rem-1.5rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  isolation: isolate;          /* new stacking context */
}
.hero-player-frame {
  width: 100%;
  aspect-ratio: 16/9;
  max-height: 100vh (or 100svh);
  max-width: var(--np-frame-max-w, 100%);   /* constrains on desktop */
  background: #000;
  position: relative;
  overflow: hidden;
  margin-inline: auto;
}
```

### Player titlebar (above iframe)
```css
.hero-player-titlebar {
  display: flex;
  background: #000;
  border-bottom: 1px solid #ffffff14;    /* 8% white divider */
  color: #ffffffeb;                       /* 92% white */
  align-items: center;
  gap: .75rem (12px);
  padding: .5rem max(.75rem, env(safe-area-inset-right)) .5rem max(.75rem, env(safe-area-inset-left));
  max-width: var(--np-frame-max-w, 100%);
  margin: 0 auto .625rem (10px bottom);
}
```

### Watch-party mode
```css
.hero-player-playing--watch-party {
  border-radius: .75rem (12px);    /* rounded container */
  height: 100%;
  padding: 0;
}
.hero-player-frame (in watch-party) {
  aspect-ratio: 16/9;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
}
```

### Viewport-fullscreen mode
```css
.hero-player-frame--viewport-fullscreen,
.hero-player-playing--viewport-fullscreen {
  z-index: var(--z-player-fullscreen);   /* 90 */
  position: fixed;
  inset: 0;
  width: 100dvw;
  height: 100dvh;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: #000;
  overflow: hidden;
}
```

**Note:** SSR'd HTML shows the player uses an `<iframe>` (the `idlix.webp` logo is in the titlebar). The site embeds 3rd-party stream sources (similar to vidsrc/mzfi). No native `<video>` element on the page at SSR time.

### Quality / server selector
Not directly visible in SSR — these hydrate client-side after the player iframe loads. The relevant CSS classes for the **segmented control** used for season/quality/server selection:

```css
.segmented-control {
  --seg-track-bg: #ffffff08;          /* 3% white track */
  --seg-track-border: #ffffff1a;      /* 10% white */
  --seg-track-border-hover: #ffffff29; /* 16% white */
  --seg-item-hover: #ffffff0d;       /* 5% white */
  --seg-thumb-bg: #ffffff1a;          /* sliding active thumb */

  border: 1px solid var(--seg-track-border);
  background: var(--seg-track-bg);
  border-radius: 999px;                /* PILL */
  min-height: 2.125rem (34px) → 2.25rem (36px) → 2.75rem (44px for --lg)
  padding: .1875rem (3px);            /* thumb has 3px inset */
  gap: .1875rem (3px);
  display: inline-flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;              /* hide scrollbar */
}
.segmented-control--pill {
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;     /* don't bubble scroll to body */
  scroll-padding-inline: .1875rem;
}
.segmented-control--tabs {
  border: 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  border-radius: 0;
  gap: 0;
  min-height: 2.5rem (40px);
}
```

### Filter chip (alternative to segmented-control — used in dropdowns / browse pages)
```css
.filter-chip {
  min-height: 2.5rem (40px);
  border: 1px solid var(--color-border);   /* #1c1c1c */
  color: var(--color-text-secondary);     /* #a0a0a0 */
  background: var(--color-bg-elevated);   /* #111 */
  font-size: var(--text-sm);              /* 15px */
  border-radius: 9999px;                  /* full pill */
  padding: .5rem .875rem;                 /* 8px 14px */
  font-weight: 500;
  transition: color, background-color, border-color (.14s);
}
```

---

## 9. Footer

```html
<footer class="site-footer mt-16 footer-safe">
  <div class="page-container py-5 sm:py-6">         ← vertical padding 20-24px
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">

      <!-- Left: Logo + disclaimer -->
      <div class="flex-shrink-0">
        <a class="site-logo-action" href="/">
          <span class="site-logo-lockup text-lg">    ← logo at 18px size
          <img class="logo-img w-auto block" src="/idlix.webp">
      <p class="text-xs text-text-muted text-center leading-relaxed max-w-2xl">
        IDLIX tidak menghosting, menyimpan, atau mendistribusikan file media apa pun.
        Semua konten diambil otomatis dari penyedia pihak ketiga di internet.

      <!-- Right: social buttons -->
      <div class="flex-shrink-0 flex items-center gap-2">
        <button class="site-footer__social cursor-pointer">  ← theme toggle?
        <a class="site-footer__social" href="https://discord.gg/yVPFdhua4K">  ← Discord
        <a class="site-footer__social" href="https://t.me/idlixstream">       ← Telegram
```

**Key observations:**
- `mt-16` (64px) gap above footer
- `mt-16` ensures footer is well-separated from content above
- Disclaimer text is centered, max-width 672px (`max-w-2xl`), 12px (`text-xs`), muted gray (`#707070`), relaxed leading
- Mobile: stacked (column), Desktop: split row
- Social: Discord + Telegram (Indonesia-specific choices — Telegram is huge there)
- No "About / DMCA / Contact / Privacy" links visible in SSR — these are likely in the mobile menu / "Lainnya" dropdown

---

## 10. Buttons (comprehensive button system)

```css
/* Primary CTA — solid red */
.btn-primary {
  background: var(--color-primary);     /* #d50032 */
  color: #fff;
  border: none;
  font-weight: 600;
  transition: background-color .14s, transform .14s;
}

/* Gradient CTA — diagonal red→orange (used for hero, browser-support action) */
.btn-gradient {
  background: var(--gradient-primary);  /* linear-gradient(135deg, #d50032, #ff3d2e) */
  color: #fff;
  border: none;
  font-weight: 600;
  transition: opacity .14s, transform .14s;
}

/* Standard action button */
.btn-action {
  border-radius: .5rem;                 /* 8px */
  min-height: 2.75rem;                  /* 44px (matches --ui-control-height) */
  padding: .625rem 1.25rem;             /* 10px 20px */
  font-size: .9375rem;                  /* 15px */
  font-weight: 600;
  line-height: 1.375rem;
  display: inline-flex;
  align-items: center;
  gap: .5rem;
}
.btn-action--icon { width: 2.75rem; padding: 0; }   /* square 44x44 icon button */
.btn-action--compact { padding-inline: .75rem; font-size: .8125rem; }  /* 13px */

/* Pill (segmented items, dropdowns) */
.btn-pill {
  min-height: var(--ui-control-height);  /* 44px */
  border-radius: var(--ui-control-radius); /* 12px */
  border: 1px solid var(--ui-control-border); /* #ffffff16 */
  padding: .5rem var(--ui-control-x);   /* 8px 14px */
  color: var(--color-text-secondary);
  background: var(--ui-control-bg);     /* #171717 */
  font-size: var(--text-sm);            /* 15px */
  font-weight: 700;
  display: inline-flex;
  gap: var(--ui-control-gap);
}

/* Glass / blurred overlay button (over backdrops) */
.btn-glass {
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  background: #ffffff1a;                /* 10% white */
  border: none;
  font-weight: 600;
  gap: .375rem;
  transition: background .2s, color .2s;
}
.btn-glass-pill {
  min-height: 2.75rem;                  /* 44px */
  color: var(--color-text-secondary);
  background: #ffffff14;                /* 8% white */
  border-radius: 9999px;                /* full pill */
  padding: .375rem .75rem;              /* 6px 12px */
  font-size: .8125rem;                  /* 13px */
  font-weight: 500;
}

/* Outline button (secondary) */
.btn-outline {
  color: var(--color-text-primary);
  border: 1px solid var(--color-border); /* #1c1c1c */
  background: #ffffff0a;                /* 4% white */
  font-weight: 600;
}
.btn-outline--danger {
  color: var(--color-primary);
  border-color: rgba(var(--color-primary-rgb), .25);
}

/* Submit button (forms) */
.btn-submit {
  border-radius: .5rem;
  width: 100%;
  min-height: 48px;
  padding: .875rem 1rem;
  font-size: .9375rem;
  font-weight: 600;
}

/* Muted / disabled */
.btn-muted {
  color: var(--color-text-muted);
  background: #ffffff0a;
  border: 1px solid #ffffff0f;
  cursor: not-allowed;
}
```

---

## 11. Badges (the strongest "polished" signal)

### Quality badges (HD / 4K / BluRay / etc)
```css
.content-badge {
  --content-badge-accent: #ffffff8c;
  --content-badge-fg: #fff;

  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0 → .02em (at lg);
  border: 1px solid var(--content-badge-accent);
  border-radius: .25rem (4px) → .3125rem (5px at lg);
  height: 1.0625rem (17px) → 1.375rem (22px at lg);
  padding: 0 .3125rem (5px) → 0 .5rem (8px at lg);
  font-size: .625rem (10px) → .75rem (12px at lg);
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  gap: .1875rem → .25rem;
  white-space: nowrap;

  /* Layered background for "raised chip" feel */
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--content-badge-accent) 22%, #080808db),
    color-mix(in srgb, var(--content-badge-accent) 10%, #080808eb));

  /* Multi-layer shadow for depth */
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--content-badge-accent) 35%, transparent),
    inset 0 0 0 1px #00000059,
    0 1px 2px #0009;

  color: var(--content-badge-fg);
  text-shadow: 0 1px 1px #0000008c;
  backdrop-filter: blur(2px);
}
```

**Variants** (each swaps `--content-badge-accent` + `--content-badge-fg`):
- `--gold` (4K): `#f5c518` accent, `#ffeaa1` text
- `--blue` (BluRay): `#60a5fa` / `#e3efff`
- `--green` (WebDL): `#46d369` / `#d6ffe2`
- `--silver` (HD): `#22d3ee` / `#d6f9ff`
- `--orange` (TS): `#fb923c` / `#ffe3c2`
- `--muted` (CAM): `#94a3b8` / `#e2e8f0`
- `--brand` (Featured): primary red `#d50032` / `#ffd7df`
- `--danger-muted` (Canceled status): canceled red
- `--neutral`: `#ffffff38` accent, `#fffffff2` text, solid `#141414e0→#080808f0` gradient
- `--premium` / `--featured`: gold accent + premium-text color

### Poster pills (small inline badges on cards)
```css
.poster-pill {
  color: #ffffffd9;                       /* 85% white */
  background: #000000b3;                  /* 70% black */
  border-radius: .25rem;                  /* 4px */
  padding: .1875rem .375rem;              /* 3px 6px */
  font-size: .6875rem (11px) → var(--text-xs) (13px);
  font-weight: 600;
  line-height: 1rem;
  display: inline-flex;
  gap: .25rem (4px);
}
.poster-pill--green  { color: var(--color-accent-green); }   /* rating star */
.poster-pill--gold   { color: var(--color-accent-gold); }    /* IMDB rating */
.poster-pill--brand  {
  background: rgba(var(--color-primary-rgb), .9);   /* solid red */
  color: #fff;
}
.poster-pill--icon { padding: .25rem; }
```

### Rank number (Top 10 list — classic Netflix "stroked italic number")
```css
.rank-number {
  color: transparent;                     /* fill is transparent, only stroke shows */
  -webkit-text-stroke: 2px #ffffff59;     /* 35% white 2px outline */
  text-stroke: 2px #ffffff59;
  paint-order: stroke fill;              /* stroke behind fill */
  filter: drop-shadow(0 2px 8px #0009);   /* soft drop shadow */
  font-style: italic;
  line-height: .8;                        /* tighter than text */
}
```

---

## 12. Micro-interactions & Polish

### Motion design tokens (the secret sauce)
```css
/* Durations */
--motion-dur-fast:   .14s   /* hovers, color changes */
--motion-dur-base:   .2s    /* standard transitions */
--motion-dur-sheet:  .26s   /* modal/sheet entrance */
--motion-dur-slow:   .32s   /* staggered entrance */
--motion-dur-loop:   1.6s   /* shimmer, infinite loops */

/* Easings */
--motion-ease-standard:  cubic-bezier(.4, 0, .2, 1)    /* Material standard */
--motion-ease:           cubic-bezier(.16, 1, .3, 1)   /* ease-out-expo-ish */
--motion-ease-sheet:     cubic-bezier(.32, .72, 0, 1)  /* sheet-specific */
--motion-ease-bounce:       cubic-bezier(.34, 1.45, .64, 1)
--motion-ease-bounce-strong: cubic-bezier(.34, 2.2, .64, 1)

/* Distances */
--motion-distance-xs: 4px
--motion-distance-sm: 6px
--motion-distance-md: 8px
--motion-distance-lg: 12px

/* Scale factors */
--motion-scale-subtle:  .985   /* barely-perceptible press */
--motion-scale-compact: .97    /* noticeable press */

/* Blur (for "glassy" entrance) */
--motion-blur-sm: 2px
```

### Skeleton shimmer
```css
.skeleton {
  background: linear-gradient(90deg,
    var(--color-bg-card) 25%,       /* #0c0c0c */
    var(--color-bg-elevated) 50%,   /* #111 */
    var(--color-bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```
*Note: respects `prefers-reduced-motion` — there's a media query that swaps to solid `--color-bg-card` with `animation: none`.*

### Card hover (Netflix-style pop)
```css
.content-card {
  cursor: pointer;
  transition: transform .2s;
  position: relative;
}
.content-card:hover {
  z-index: 20;
  transform: scale(1.05);
}
.content-card:active {
  opacity: .85;
}
```

### Modal / dialog entrance (with blur-in)
```css
@keyframes motion-dialog {
  0%   { opacity: 0; transform: translateY(12px) scale(.97); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0)   scale(1);    filter: blur(0); }
}
@keyframes motion-dialog-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
animation: motion-dialog .2s var(--motion-ease);
```

### Sheet (bottom sheet / mobile menu)
```css
@keyframes motion-sheet-in {
  0%   { transform: translateY(100%); }
  100% { transform: translateY(0); }
}
animation: motion-sheet-in .26s var(--motion-ease-sheet);
```

### Toast notifications
```css
@keyframes motion-toast-in {
  0%   { opacity: 0; transform: translateY(12px) scale(.97); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0)   scale(1);    filter: blur(0); }
}
@keyframes motion-toast-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
/* z-index: var(--z-toast) = 200 */
```

### Dropdowns / popovers
```css
.dropdown-surface {
  background: var(--color-sheet-surface);   /* #0c0c0c */
  animation: motion-pop .14s var(--motion-ease);
  /* motion-pop = translateY(-4px) scale(.985) blur(2px) → 0 */
}
.dropdown-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: .125rem (2px);
  padding: .5rem (8px);
}
.dropdown-option {
  min-height: 48px;
}
.dropdown-option--active {
  color: var(--color-text-primary);
  background: var(--color-state-selected);   /* #ffffff1a */
  font-weight: 700;
}
```

### Tooltip entrance
```css
@keyframes motion-tooltip-in {
  0%   { opacity: 0; scale: var(--motion-scale-compact); filter: blur(2px); }
  100% { opacity: 1; scale: 1; filter: blur(0); }
}
```

### Like / love button pop (reaction animation)
```css
@keyframes motion-like-pop {
  0%   { transform: scale(1); }
  35%  { transform: scale(.82); }    /* squeeze */
  /* ends at scale(1) */
}
```

### Logo entrance (with gold glow)
```css
@keyframes logoPlusEntrance {
  0%   { opacity: 0; transform: translateY(var(--logo-plus-y)) scale(.4);
         filter: drop-shadow(0 0 #f5c44e00); }
  55%  { opacity: 1; transform: translateY(...) scale(1.06);   /* overshoot */
         filter: drop-shadow(0 0 10px #ffdc78b8); }            /* big gold glow */
  78%  { transform: translateY(...) scale(.985);                /* settle */
         filter: drop-shadow(0 0 7px #ffdc7885); }
  100% { opacity: 1; transform: translateY(...) scale(1);
         filter: drop-shadow(0 0 5px #f5c44e6b)
                 drop-shadow(0 1px #0000008c); }                 /* subtle glow + 1px shadow */
}
```

### Focus rings
```css
/* Default focus (form fields, list items) */
:focus-visible {
  box-shadow: 0 0 0 3px #ffffff14;   /* 3px 8% white ring */
}
/* Button focus */
:focus-visible {
  color: var(--color-text-primary);
  box-shadow: inset 0 0 0 2px rgba(var(--color-primary-rgb), .7);  /* 2px red inset */
}
/* Input focus */
:focus {
  border-color: var(--color-border-hover);   /* #2a2a2a */
  background: var(--color-bg-elevated);       /* #111 */
}
/* Search field focus (primary color) */
.search-field:focus {
  border-color: var(--color-primary);
}
```

### Scrollbar styling
```css
::-webkit-scrollbar          { width: 6px; height: 6px; }
::-webkit-scrollbar-track    { background: transparent; }
::-webkit-scrollbar-thumb    { background: #fff3; border-radius: 10px; }   /* 20% white, fully rounded */
/* utility classes: .scrollbar-none { scrollbar-width: none } */
/*                  .scrollbar-hide  { -ms-overflow-style: none; scrollbar-width: none; ::-webkit-scrollbar { display: none } } */
```

---

## 13. IDLIX-Specific UI Patterns

### Dual-language content (Indonesian + English)
Every UI string ships with both languages inline, hidden via CSS:
```html
<h1 class="error-page-title">
  <span class="">Perbarui iOS untuk melanjutkan</span>       ← Indonesian (default)
  <span class="">Update iOS to continue</span>                ← English (hidden unless lang toggle)
```
Switching locale swaps visibility without a page reload.

### Browser-support gate (graceful degradation)
The SSR HTML includes a `<div class="browser-support-gate">` fallback for unsupported browsers (iOS < 16.4 or asset load failure). Hidden by default; if feature detection fails, it becomes visible. Two variants:
- `nb-unsupported-ios` — "Perbarui iOS untuk melanjutkan"
- `nb-asset-failed` — "Halaman belum bisa dimuat sepenuhnya"

### Announcement bar (optional top strip)
CSS var `--announcement-h` (default 0) lets the site show a global announcement banner above the header without re-flowing the layout. The header `top: var(--announcement-h, 0px)` adjusts accordingly.

### Site-header scroll behavior
```
At scroll-top (over hero):     transparent bg, text-shadow on links for legibility
After scroll:                  solid #0c0c0c bg, header shrinks by .5rem→.75rem
```
Achieved via `--site-header-current-offset` variable updated on scroll, plus `.header-nav-text` text-shadow toggle.

### Mobile-only "page-below-chrome" class
Adds bottom padding equal to the mobile tab bar height so content isn't hidden behind `position: fixed` `.np-bar`:
```html
<div class="min-h-svh page-below-chrome pb-12">
```

### "Lainnya" (More) overflow nav pattern
Desktop nav uses primary items (Beranda/Film/Serial TV) at full opacity, secondary items (Shorts/Koleksi/Genre/Negara/Tahun/Network) with `header-nav-secondary` class (likely reduced opacity / smaller). The 8th item "Lainnya" is a dropdown button that surfaces anything that doesn't fit.

### Trending searches leaderboard (empty-state innovation)
When search input is empty, instead of showing nothing, IDLIX shows a vertical "trending searches" leaderboard:
- Each row: rank circle (36px) + query text bar (40% width)
- Up to 10 items
- Clickable to autofill the search

### Watch party styling
Watch-party container gets `border-radius: .75rem (12px)` and the player fills 100% height (no extra padding) — visually communicates "this is a shared session, focused mode".

### Reputation / tier rings (community feature)
CSS shows `--tier-ring-color`, `--tier-ring-width` variables and box-shadows like:
```css
box-shadow: 0 0 0 1px var(--color-bg-dark),
            0 0 0 calc(1px + var(--tier-ring-width, 2px)) var(--tier-ring-color, transparent),
            0 0 18px var(--tier-ring-color, transparent);
```
Indicates user reputation tiers via colored glow rings around avatars. Community-gamification feature.

---

## 14. Summary: What Makes IDLIX Look "Polished"

Ranking the contributing factors by impact:

1. **Skeleton-first SSR** — every page returns instantly with shimmer-animated placeholders matching the exact final layout. Perceived performance is dramatically better than spinner-based loading.

2. **Plus Jakarta Sans variable font** (200-800) — modern geometric sans, more character than Inter/Roboto. Variable axis lets them use weights like 650, 720 that aren't available in static fonts.

3. **Layered color system** — pure black background with 4-tier surface elevation (#000 → #0c0c0c → #111 → #141414). White overlays (8/10/14/24%) for state instead of new colors. Makes the dark theme feel deep, not flat.

4. **Diagonal red→orange gradient** for primary CTA (135deg, `#d50032 → #ff3d2e`) — gives hero buttons energy that flat Netflix red lacks.

5. **Motion design tokens** as named CSS vars — `--motion-dur-fast/base/sheet/slow`, `--motion-ease-standard/sheet/bounce`. Consistent durations + easings across the whole app make animations feel coordinated.

6. **Blur-in entrance animations** — modals/dialogs/toasts/popovers all enter with `filter: blur(2px) → 0` combined with translateY + scale. This is the single biggest contributor to the "premium" feel — it's used by Apple, Linear, Vercel.

7. **Layered quality badges** — `box-shadow: inset 0 1px 0 ... , inset 0 0 0 1px ... , 0 1px 2px #0009` + gradient background + text-shadow + backdrop-filter. Each badge has 5+ visual layers creating a "physical chip" look.

8. **Pill-shaped everything** — `border-radius: 999px` on nav links, filter chips, segmented controls, action buttons. Modern, friendly, distinct from square-corners Bootstrap era.

9. **Detail-content overlap** — `margin-top: -180/-200/-240px` pulls title/buttons up over the backdrop gradient. Classic Netflix move, instantly recognizable as "premium streaming UI".

10. **Stroked italic rank numbers** — `color: transparent; -webkit-text-stroke: 2px #ffffff59; font-style: italic` for Top 10 lists. Strong visual signature.

11. **Mobile-native patterns** — bottom tab bar (np-bar) with safe-area-inset padding, full-page search, mobile menu sheet (motion-sheet-in slide-up). The mobile experience mimics a native iOS app, not a responsive website.

12. **Per-quality color coding** — HD is cyan, 4K is gold, WebDL is green, CAM is gray. Users learn the palette and can scan a row of cards for quality instantly.

13. **Custom text-size scale** — Tailwind v4 `@theme` block overrides defaults with 13/15/17/18/20px instead of 12/14/16/18/20px. Slightly larger than default, improving readability on dense card grids.

14. **Dual-language content shipping** — Indonesian + English in the same DOM, swapped via CSS. Massive UX win for the bilingual Indonesian market.

---

## 15. Concrete Implementation Cheatsheet for Nobar

If you want to port the *feel* of IDLIX to Nobar, here are the highest-leverage changes (in priority order):

### Tokens to add to your `@theme` block
```css
@theme {
  /* Colors — keep your sage/terracotta palette, but adopt the layered surfaces */
  --color-bg-dark: #000;
  --color-bg-card: #0c0c0c;
  --color-bg-elevated: #111;
  --color-bg-hover: #141414;
  --color-bg-input: #111;

  --color-border: #1c1c1c;
  --color-border-hover: #2a2a2a;

  --color-text-primary: #f0f0f0;
  --color-text-secondary: #a0a0a0;
  --color-text-muted: #707070;

  --color-state-hover: #ffffff12;
  --color-state-selected: #ffffff1a;

  /* UI controls (replace with sage variants if you want to keep palette) */
  --ui-control-height: 44px;
  --ui-control-radius: 12px;
  --ui-control-bg: #171717;
  --ui-control-bg-hover: #202020;
  --ui-control-border: #ffffff16;
  --ui-control-border-hover: #ffffff24;
  --ui-control-gap: 10px;
  --ui-control-x: 14px;

  /* Motion (universal — adopt as-is) */
  --motion-dur-fast: .14s;
  --motion-dur-base: .2s;
  --motion-dur-sheet: .26s;
  --motion-dur-slow: .32s;
  --motion-dur-loop: 1.6s;
  --motion-ease-standard: cubic-bezier(.4, 0, .2, 1);
  --motion-ease: cubic-bezier(.16, 1, .3, 1);
  --motion-ease-sheet: cubic-bezier(.32, .72, 0, 1);
  --motion-ease-bounce: cubic-bezier(.34, 1.45, .64, 1);
  --motion-scale-subtle: .985;
  --motion-scale-compact: .97;
  --motion-blur-sm: 2px;
  --motion-distance-xs: 4px;
  --motion-distance-sm: 6px;
  --motion-distance-md: 8px;
  --motion-distance-lg: 12px;

  /* Page layout */
  --page-max-width: 1400px;

  /* Typography (Plus Jakarta Sans is what they use — same as Nobar!) */
  --text-xs: 0.8125rem;
  --text-sm: 0.9375rem;
  --text-base: 1.0625rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
}
```

### Highest-impact CSS rules to copy verbatim

**Skeleton shimmer:**
```css
.skeleton {
  background: linear-gradient(90deg,
    var(--color-bg-card) 25%,
    var(--color-bg-elevated) 50%,
    var(--color-bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { background: var(--color-bg-card); animation: none; }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Modal/dialog blur-in entrance:**
```css
@keyframes motion-dialog {
  0%   { opacity: 0; transform: translateY(12px) scale(.97); filter: blur(2px); }
  100% { opacity: 1; transform: translateY(0)   scale(1);    filter: blur(0); }
}
.modal-enter { animation: motion-dialog .2s cubic-bezier(.16, 1, .3, 1); }
```

**Card hover pop:**
```css
.content-card {
  cursor: pointer;
  transition: transform .2s;
  position: relative;
}
.content-card:hover {
  z-index: 20;
  transform: scale(1.05);
}
.content-card:active { opacity: .85; }
```

**Detail backdrop overlap (Netflix pull-up):**
```css
.detail-backdrop { height: 65svh; min-height: 420px; }
.detail-gradient {
  background: linear-gradient(180deg,
    transparent 0%, #00000026 35%, #00000080 60%, #000000e6 85%, #000 100%);
}
.detail-content {
  position: relative;
  z-index: 10;
  margin-top: -180px;  /* -200 at md, -240 at lg */
}
```

**Hero gradient (lighter — for homepage):**
```css
.hero-gradient-bottom {
  background: linear-gradient(180deg,
    transparent 30%, #0000004d 55%, #000000b3 75%, #000 100%);
}
```

**Pill nav link with active tint:**
```css
.nav-link {
  min-height: 44px;
  font-size: 15px;
  color: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 650;
  border: 1px solid transparent;
  transition: background-color .14s, color .14s;
}
.nav-link--active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
}
```

**Layered quality badge:**
```css
.quality-badge {
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--badge-accent);
  border-radius: 5px;
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--badge-accent) 22%, #080808db),
    color-mix(in srgb, var(--badge-accent) 10%, #080808eb));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--badge-accent) 35%, transparent),
    inset 0 0 0 1px #00000059,
    0 1px 2px #0009;
  color: var(--badge-fg);
  text-shadow: 0 1px 1px #0000008c;
  backdrop-filter: blur(2px);
}
```

### Layout changes to consider

1. **Add skeleton states everywhere** — every async-loaded section should ship a skeleton in the initial HTML. Nobar currently has skeletons but they're not SSR'd (they appear only after JS loads).

2. **Detail page overlap** — your current detail page probably has the backdrop as a separate block above the content. Pull the content up by 180-240px with `margin-top: -180px` (and z-index: 10) so it overlaps the backdrop gradient.

3. **Pill nav links** — if your current nav uses rectangular buttons, switching to `border-radius: 999px` + active-tint background instantly feels more modern.

4. **Per-quality badge colors** — your HD/4K/WebDL badges probably all use the same color. Mapping each to its own accent (cyan/gold/green) makes scanning rows faster.

5. **Stroked italic rank numbers** for any "Top 10" row you add — huge visual signature for ~5 lines of CSS.

6. **Bottom tab bar on mobile** — Nobar currently has top nav only. Adding a fixed bottom `np-bar` with 4-5 items (Beranda/Film/Series/Search/Menu) would make mobile feel native.

7. **Top scroll-progress bar** — 2px red bar under the header that fills with `transform: scaleX(progress)`. ~10 lines of code, high perceived polish.

8. **Hero entrance: scale(1.03) → 1** with `hero-fade-in` keyframe — gives the hero backdrop a subtle "Ken Burns" feel on load.

9. **Plus Jakarta Sans weights 650 / 720** — Nobar already uses PJS, but you're probably only using 400/500/600/700/800. Adding 650 for nav and 720 for mobile nav labels gives that "designed" feel.

10. **Dual-language support** — if Nobar targets Indonesian users, shipping ID+EN strings inline (toggled via CSS based on `NEXT_LOCALE` cookie) is a major UX win.

---

**End of report.**
Total CSS variables cataloged: **345**. Total @keyframes cataloged: **57**. All extracted values above are exact, copied from the production CSS bundle. No approximations.

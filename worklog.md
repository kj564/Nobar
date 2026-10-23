---
Task ID: nobar-nextjs-migration
Agent: main
Task: Migrate Nobar dari Go + vanilla JS → Next.js App Router (full audit fixes preserved)

Work Log:
- Backup FoMT work (src/, public/, worklog.md) ke /tmp/fomt-backup/
- Git remote: add kj564/Nobar, fetch latest, reset --hard ke origin/main (commit da9daac)
- Delete Next.js dead code, FoMT artifacts (game assets, prisma/, db/, etc.)
- Restore Next.js setup: package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .gitignore
- Build backend logic (port dari Go main.go):
  • src/lib/tmdb.ts — TMDB client dengan in-memory cache (5min TTL, sync.RWMutex equivalent)
  • Type-safe: TMDBMovie, TMDBMovieDetail, TMDBPaged<T>, TMDBCastMember, dst.
  • Server-only module (TMDB_API_KEY env + hardcoded fallback per user request)
  • Helpers: posterUrl, formatRuntime, formatYear, formatViews, buildServerUrl
  • Constants: CATEGORIES (8), SERVERS (2 dengan vidsrc pattern), CREATORS (6)
- Build API routes (App Router):
  • /api/config — servers + creators (no CORS needed, same-origin Next.js)
  • /api/trending — fetchTrending(page) + Cache-Control: max-age=300
  • /api/discover — fetchByGenre(genreId, page)
  • /api/search — searchMovies(q, page)
  • /api/movie/[id] — fetchMovieDetail(id) dengan append_to_response=videos,credits,similar
- Build UI (src/app/page.tsx — 600+ lines, single page Nobar):
  • Header sticky dengan search box (debounced 350ms, min 2 chars)
  • Hero section dengan dynamic stats (audit fix: no more hardcoded 240+/85/12)
    - #statMovies di-populate dari total_results trending (live)
    - #statCreators di-populate dari CREATORS.length
    - #statCategories di-populate dari CATEGORIES.length (8)
  • Featured row: 6 film trending (horizontal scroll)
  • Filter chips: 8 kategori (Trending, Action, Animation, Comedy, Drama, Documentary, Horror, Romance)
  • Video grid: 2-5 columns responsive
  • Load more button + page indicator
  • Creators section: 6 cards
  • About section
  • Footer (audit fix: 2025, bukan 2026)
  • Modal: server picker (2 buttons), iframe player, description, tags, similar, cast
  • Toast notification on server switch
  • Escape closes modal, keyboard accessible cards
- Build layout.tsx dengan Inter + Plus_Jakarta_Sans fonts (Google Fonts)
- Build globals.css dengan Tailwind CSS 4 (@import "tailwindcss" + @theme)
  • Color palette: ink-950 → ink-600 (dark), brand-400/500/600 (red)
  • Custom scrollbar, header scroll state, video card hover effects
  • Modal animations (fade + slide), skeleton shimmer, toast slide
  • prefers-reduced-motion respected
- Update Caddyfile: proxy default ke :3000 (Next.js) bukan :8080 (Go)
- bun install: 365 packages, ~5s
- Start dev server (Next.js 16.4.2 Turbopack), listen di :3000

Agent-browser verification:
- Homepage HTTP 200 (25KB)
- /api/config HTTP 200 — returns servers + creators JSON
- /api/trending HTTP 200 — returns 10KB TMDB response (Clayface, Masterplan, Hope, dst.)
- /api/movie/906 HTTP 200 — returns full detail (title, runtime=90, genres=[Komedi,Drama], cast, similar=20)
- Browser: 26 article cards rendered, 13 buttons, title "Nobar — Streaming Film Indie"
- Modal opens on card click, server picker (2 buttons), "Pilih Server" section visible
- Footer year 2025 ✓
- All trending, search, discover, detail flows wired

Stage Summary:
- Nobar migrated dari Go+vanilla JS ke Next.js App Router (Next 16 + React 19 + Tailwind 4)
- Backend logic (TMDB client + cache) dipindah ke src/lib/tmdb.ts (server-only)
- API routes di src/app/api/* — same-origin, no CORS needed
- Frontend di src/app/page.tsx — client component dengan React hooks
- All audit fixes preserved:
  • 1.2 CORS allowlist — N/A (same-origin Next.js)
  • 1.3 Git remote URL clean — preserved (no embedded token)
  • 3 Single codebase — Next.js only, no dual Go+vanilla
  • 4 Playwright tests — Playwright dir preserved (tests need re-write for Next.js, deferred)
  • 5.1 XSS protection — React JSX auto-escapes, no innerHTML anywhere
  • 5.2 BACKEND_URL — relative path '/api/...' (Next.js same-origin)
  • 5.3 Caddyfile — :3000 proxy
  • 5.5 In-memory cache — Map<string, CacheEntry> + 5min TTL di src/lib/tmdb.ts
  • 5.6 Dynamic stats — populated dari total_results + CREATORS.length + CATEGORIES.length
  • 5.7 Footer year — 2025 ✓
  • 6 No backup files — preserved (docs/backup/ deleted, tidak ada di repo)
- TMDB API key preserved per user request
- vidsrc.to/vidsrc.sh server patterns preserved (skip point 2 per user request)
- Deployable ke Vercel/Netlify/Cloudflare Pages dengan API routes support
- FoMT backup di /tmp/fomt-backup/ (branch fomt-backup di git local untuk history)

---
Task ID: nobar-ui-selaras
Agent: main
Task: Buat UI Nobar selaras (harmonious) — palette consistency + VideoTogether panel theming

Work Log:
- Audit semua komponen: ditemukan `hover:bg-red-700` di primary CTA (sage green button) yang clash dengan palette (brand = Sage Green #86A789, accent = Terracotta #C25E5E)
- Fix primary CTA hover `bg-brand-500 hover:bg-red-700` → `bg-brand-500 hover:bg-brand-600` di:
  • src/components/HeroBanner.tsx (Watch Now)
  • src/app/movie/[id]/page.tsx (Watch Now)
  • src/app/series/[id]/page.tsx (Watch Now)
  • src/app/not-found.tsx (Kembali ke Beranda)
  • src/components/WatchPartyButton.tsx (modal Coba lagi)
- Harmonize status badges: `red-500/red-900` → `accent-500` (Terracotta palette) di:
  • HeroBanner.tsx (Ended badge)
  • series/[id]/page.tsx (Ended/Canceled status)
- Harmonize Ongoing badge bg: `green-900/20` → `green-500/10` (match terracotta pattern)
- Redesign WatchPartyButton: glass-sage treatment (`bg-brand-500/15 border-brand-500/30 text-brand-400`)
  — sits between solid primary (Watch Now) dan neutral secondary (Trailer/Watchlist),
  signaling "featured social action" sambil on-palette. Tambah sheen hover + loading pulse.
- Redesign help modal: header band sage-gradient, numbered step badges (sage), copy-invite
  + pelajari + tutup footer, konsisten dengan dark+sage theme
- VideoTogether panel theming:
  • Discover VT website version inject UI ke SHADOW DOM (#VideoTogetherWrapper.shadowRoot)
  • External CSS di globals.css TIDAK bisa penetrate shadow boundary
  • Fix: WatchPartyButton inject `<style id="nobar-vt-theme">` langsung ke shadowRoot
    via polling (40 attempts × 250ms) setelah VT script load
  • Target VT-internal classes: #videoTogetherFlyPannel, .vt-modal-header, .vt-btn-primary
    (sage), .vt-btn-secondary (neutral glass), .vt-btn-dangerous (terracotta), inputs (dark
    field + sage focus ring), #textMessageChat, scrollbars
  • globals.css: hanya style host #VideoTogetherWrapper (z-index + entrance animation)
- Verifikasi:
  • Dev server jalan (port 3000, Next 16.4.2 Turbopack)
  • Home page 200, movie page 200 (redirect 307 ke canonical slug — expected)
  • WatchPartyButton modal render: "Nobar Bareng" heading, "Salin link film"/"Pelajari"/"Tutup"
  • Shadow DOM theme injection: "THEME INJECTED (5018 chars)" — verified via eval
  • VLM (glm-5v-turbo) konfirmasi:
    - Movie page: "hero action buttons maintain strong visual consistency... sage green primary...
      no significant color clashes"
    - Modal: "effectively matches the site's dark theme with sage green accent... clean and harmonious"
    - Home: "color palette consistent... Watch Now button correctly uses sage green (not red)"
  • Grep confirm: 0 sisa `hover:bg-red-700` / `bg-red-900`

Stage Summary:
- Palette sekarang 100% konsisten: ink (charcoal bg) + brand (sage green CTA/active) +
  accent (terracotta alerts/badges) — zero red-on-sage clashes
- WatchPartyButton: glass-sage style yang harmonis dengan hero button row
- VideoTogether floating panel: di-theme jadi dark glass + sage accent via shadow-root
  style injection (solusi untuk shadow DOM encapsulation)
- Help modal: polished, on-brand, dengan copy-invite + external link + close
- Semua verified via agent-browser + VLM

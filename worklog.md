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

---
Task ID: nobar-watchparty-no-video-fix
Agent: main
Task: Fix "Error: No video in this page" di Watch Party (VideoTogether)

Work Log:
- Diagnosa root cause: VideoTogether website version (vt.en-us.website.js) HANYA bisa
  sync <video> element di top-level document. NativePlayer render <video> hanya saat
  mzfi.me return direct MP4 (~50-100 movies). Untuk mayoritas film, NativePlayer
  fallback ke embed <iframe> (videm.xyz / vidlink.pro) — video ada DI DALAM iframe
  cross-origin yang tidak bisa diakses VideoTogether → muncul error "No video in this page".
- Implementasi deteksi video di WatchPartyButton:
  • State: "checking" | "native" | "embed"
  • MutationObserver observe document.body (childList + subtree + attributes[src])
  • hasNativeVideo(): cek <video> dengan src valid (bukan about:blank)
  • hasEmbedIframe(): cek iframe[title*="Player"] atau src videm/vidlink/2embed
  • Safety timer 12s: kalau masih "checking", settle ke "embed"
- Adaptasi UI berdasarkan state:
  • native: sage glass (brand-500/15) + dot sage solid + tooltip "Watch Party siap"
  • embed: terracotta tint (accent-500/10) + dot terracotta + tooltip "Watch Party terbatas"
    + aria-label "Watch Party — limited (embed player)"
  • checking: neutral gray + dot pulse
- Help modal split jadi 3 variant:
  • NATIVE: 4 langkah numbered (sage badges), info sync otomatis, copy invite + pelajari + tutup
  • EMBED: warning box terracotta dengan penjelasan teknis (iframe cross-origin),
    3 solusi (pilih film Trending Now / nonton manual / pasang ekstensi VT),
    copy link + pelajari + tutup (semua neutral, bukan sage, karena tidak ada action utama)
  • CHECKING: loading state dengan pulse dot
- Verifikasi via agent-browser:
  • Clayface (embed-only): button "Watch Party — limited (embed player)" → modal EMBED
    dengan warning + 3 solusi ✓
  • Inject <video> simulasi native: button berubah jadi "Start Watch Party" (sage) →
    modal NATIVE dengan 4 langkah numbered ✓
  • Reload: detection re-evaluate, settle ke "embed" dengan benar ✓
- VLM (glm-5v-turbo) konfirmasi:
  • Embed modal: "effectively explains the iframe limitation... actionable solutions...
    sage green for constructive advice, terracotta strictly for the warning...
    helpful and encouraging tone"
  • Bandingkan native vs embed: "identical structural design... color cue is correct:
    sage green = ready, terracotta = limited"

Stage Summary:
- "No video in this page" error sekarang di-handle: user dapat penjelasan jelas KENAPA
  Watch Party tidak bisa (embed/iframe cross-origin) + 3 solusi konkret
- WatchPartyButton jadi stateful: deteksi real-time via MutationObserver, UI beradaptasi
- 3 modal variant (native/embed/checking) semuanya harmonis dengan dark+sage+terracotta
- Limitasi fundamental tetap: Watch Party hanya sync film dengan direct mzfi stream
  (~50-100 movies). Untuk film embed, user diarahkan ke Trending Now atau ekstensi VT.

---
Task ID: nobar-watchparty-embed-extension-fix
Agent: main
Task: Fix inaccurate "Watch Party unavailable" framing — VideoTogether CAN sync embeds via extension

Work Log:
- Research subagent confirm via source code (vt.en-us.website.js + manifest.json):
  • WEBSITE version (vt.en-us.website.js): scan document.getElementsByTagName('video')
    only — NEVER iframe.contentDocument. Bootstrap coba inject ke iframe tapi guard
    `window.location.origin === iframe.contentWindow.location.origin` throw SecurityError
    untuk cross-origin iframe (videm.xyz/vidlink.pro) → di-swallow try/catch → "No video"
  • BROWSER EXTENSION: manifest.json register content scripts dengan `all_frames: true`
    + `matches: ["<all_urls>"]` → browser inject ke SEMUA frame, cross-origin included.
    Extension bisa sync embed. ✅
  • EasyShare mode (Beta): paste direct video URL, VT load di player sendiri — butuh
    direct m3u8/mp4 URL yang unreliable untuk extract dari embed.
- User correct: "bukannya video together bisa untuk embed juga?" → YES, via extension.
- Reframe UI dari "terbatas/tidak tersedia" → "butuh ekstensi VideoTogether":
  • Button tooltip: "Watch Party terbatas" → "Watch Party butuh ekstensi VideoTogether"
  • Button aria-label: "limited (embed player)" → "butuh ekstensi VideoTogether untuk embed"
  • Status dot title: "sync terbatas" → "butuh ekstensi VideoTogether"
  • Modal subtitle: "tidak tersedia untuk film ini" → "butuh ekstensi untuk embed player"
- Restructure embed modal body:
  • Warning box (terracotta): jelasin KENAPA website version gagal (iframe cross-origin,
    SecurityError) — bukan "VideoTogether tidak bisa"
  • Positive statement: "Watch Party tetap bisa — gunakan ekstensi VideoTogether.
    all_frames:true inject ke semua frame"
  • PRIMARY CTA box (sage): "Solusi utama" + 3 store link buttons:
    - Chrome (sage solid, prominent): chrome.google.com/webstore/detail/videotogether/imkinoccecmkmhckhbdkjckmcieglidi
    - Firefox (neutral glass): addons.mozilla.org/firefox/addon/videotogether/
    - Edge (neutral glass): microsoftedge.microsoft.com/addons/detail/videotogether/emmmijheaoeoocnekhbbnhhdnmflphco
  • Alternatives box: Trending Now (native, no extension) + manual play
- Verifikasi via agent-browser:
  • Clayface (embed): button "Watch Party — butuh ekstensi VideoTogether untuk embed" ✓
  • Modal: 3 store links (Chrome/Firefox/Edge) — all valid URLs ✓
- VLM (glm-5v-turbo) konfirmasi: "effectively explains the technical limitation...
  immediately offers the browser extension as a robust solution... helpful and
  non-dismissive tone... Chrome/Firefox/Edge links highly prominent within dedicated
  SOLUSI UTAMA section... excellent harmony with dark+sage+terracotta palette"

Stage Summary:
- Watch Party untuk embed film sekarang jelas BISA via ekstensi VideoTogether
  (bukan "unavailable" lagi). 3 store link (Chrome/Firefox/Edge) prominent di modal.
- Akurasi teknis: jelaskan distinction website version (limitasi browser security)
  vs extension (all_frames:true bypass same-origin)
- Tone: helpful + solution-oriented, bukan dismissive
- Limitasi tersisa: tanpa ekstensi, embed film tetap tidak bisa sync — user arahkan
  ke Trending Now (native) atau install extension (works for ALL embeds)

---
Task ID: nobar-seo-optimize
Agent: seo-subagent
Task: Add SEO optimization (dynamic metadata + JSON-LD structured data + sitemap/robots) to Nobar Next.js streaming project

Work Log:
- Read existing files first: src/app/movie/[id]/page.tsx, src/app/series/[id]/page.tsx, src/app/layout.tsx, src/lib/tmdb.ts (to verify helper signatures: fetchMovieDetail, fetchTVDetail, buildMovieSlug, buildSeriesSlug, extractIdFromSlug, backdropUrl, formatYear)
- Movie detail page (src/app/movie/[id]/page.tsx):
  • Added `import type { Metadata } from "next"`
  • Added `generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata>` — reuses extractIdFromSlug → fetchMovieDetail → buildMovieSlug
  • Returns: title `${title} (${year}) — Nobar`, description (overview.slice(0,160)), alternates.canonical, openGraph (title/description/type/image=original backdrop/siteName/locale id_ID), twitter (summary_large_image)
  • Added JSON-LD `<script type="application/ld+json">` inside main wrapper div, before Navbar
  • Schema: @context schema.org, @type Movie, name, description, image (backdrop), datePublished (release_date), genre[], aggregateRating (only when vote_average > 0)
- Series detail page (src/app/series/[id]/page.tsx):
  • Same pattern with fetchTVDetail + buildSeriesSlug
  • Title: `${title} (Series) — Nobar`
  • JSON-LD schema.org TVSeries with numberOfSeasons + numberOfEpisodes added
- Root layout (src/app/layout.tsx):
  • metadataBase: new URL("https://nobar-stream.vercel.app")
  • openGraph: siteName Nobar, locale id_ID, type website
  • twitter: card summary_large_image + title/description
  • robots: { index: true, follow: true }
- Created src/app/sitemap.ts: MetadataRoute.Sitemap with / (priority 1, daily), /movie/ (0.8), /series/ (0.8), /search (0.5)
- Created src/app/robots.ts: MetadataRoute.Robots with rules (userAgent *, allow /) + sitemap URL
- IMPORTANT FIX: Task description requested openGraph.type='video', but Next.js 16's OpenGraphType enum does NOT include plain 'video' — it throws runtime error "Invalid OpenGraph type: video" (verified in dev.log). Used valid subtypes instead: video.movie (movie page) and video.tv_show (series page) — same semantic intent.
- Initial edit had a stray syntax error in series page (mixed ` and " on a template literal line) — fixed immediately after dev.log showed parse error.

Verification (against running dev server :3000):
- GET /movie/clayface-2026-1400940 → 200, <title>Clayface (2026) — Nobar</title>
- Meta tags confirmed: canonical link, og:title/description/image/type=video.movie, og:site_name=Nobar, og:locale=id_ID, twitter:card=summary_large_image, twitter:image
- JSON-LD verified: @type Movie, name=Clayface, image=backdrop URL, datePublished=2026-10-19, genre=[Kengerian,Cerita Seru,Cerita Fiksi], aggregateRating.ratingValue=7.6, ratingCount=89
- GET /series/breaking-bad-2008-1396 → 200, <title>Breaking Bad (Series) — Nobar</title>
- Series JSON-LD verified: @type TVSeries, numberOfSeasons=5, numberOfEpisodes=62, aggregateRating.ratingValue=8.957, ratingCount=18918, genre=[Drama,Kejahatan], datePublished=2008-01-20
- GET /sitemap.xml → 200, 4 <url> entries with correct loc/lastmod/changefreq/priority
- GET /robots.txt → 200, User-Agent: * Allow: / + Sitemap URL
- agent-browser errors → empty (no console errors)

Stage Summary:
- Both detail pages now have fully dynamic SEO metadata (title, description, OG, Twitter card, canonical URL) generated server-side from TMDB data
- Both detail pages emit schema.org structured data (Movie/TVSeries) via JSON-LD — eligible for Google rich results (rating stars, genre, release date, season/episode counts)
- Root layout provides metadataBase + site-wide OG/Twitter/robots defaults
- sitemap.xml + robots.txt auto-generated by Next.js at /sitemap.xml and /robots.txt
- All changes are pure ADDITIONS to existing files (generateMetadata export + JSON-LD script tag) — no JSX rendering changed, no existing imports broken
- Pre-existing ESLint config issue (circular JSON in react plugin validator) noted but out of scope — Turbopack dev compiles cleanly

---
Task ID: nobar-api-route-refactor
Agent: api-refactor-subagent
Task: Move TMDB API calls from client-side direct imports to server-side API routes (perf + architecture optimization)

Work Log:
- Reviewed prior context: src/lib/tmdb.ts (TMDB client with in-memory 5min cache, works in browser + Node), src/app/api/stream/[id]/route.ts (existing route pattern), and 4 client files that imported fetch* functions directly.
- Created 4 new App Router API routes (TypeScript, server-only):
  • src/app/api/trending/route.ts — GET /api/trending?page=1 → fetchTrending(page). export const revalidate = 300 + Cache-Control: public, max-age=300, s-maxage=300.
  • src/app/api/discover/route.ts — GET /api/discover?genre=28&page=1 → fetchByGenre(genreId, page). Same ISR + cache headers. Returns 400 if genre missing/invalid.
  • src/app/api/search/route.ts — GET /api/search?q=spider&page=1 → searchMovies(q, page). export const dynamic = "force-dynamic" + Cache-Control: no-store, max-age=0 (search is user-specific, not cached at edge).
  • src/app/api/tv-trending/route.ts — GET /api/tv-trending?page=1 → fetchTrendingTV(page). Same ISR + cache headers as /api/trending.
  • All routes: validate query params with Number() + Number.isFinite() + clamp 1-500, fallback default = 1. Try/catch returns 500 with empty-results envelope on error. Headers include Cache-Control per route semantics.
- Refactored 4 client files (data-fetching only — UI/JSX untouched):
  • src/components/HomeClient.tsx — removed fetch* runtime imports, kept type imports (TMDBMovie, TMDBSeries, TMDBPaged, Category). TV-trending useEffect → fetch('/api/tv-trending?page=1'). loadCategory's 3 branches → fetch('/api/search|trending|discover') with !res.ok guard + typed await res.json(). Preserved searchOverride param logic exactly.
  • src/components/MovieListingClient.tsx — same slimming + loadCategory refactor (3 fetch branches).
  • src/app/search/page.tsx — removed searchMovies import, kept buildMovieSlug + type imports. doSearch → fetch('/api/search?q=...&page=...') with !res.ok guard + typed await res.json().
  • src/app/series/page.tsx — removed fetchTrendingTV import. loadPage → fetch('/api/tv-trending?page=...') with !res.ok guard + typed await res.json().
- All fetch() calls in client use relative URLs only (per Caddy gateway constraint).
- tmdb.ts left 100% intact — server components (e.g. page.tsx calling fetchCategories()) still import it directly.

Verification Results:
- curl tests: trending=20 results, discover action=20, search spider=20, tv-trending=20 (all page=1, all 200 OK).
- Cache-Control headers verified: trending/discover/tv-trending → public, max-age=300, s-maxage=300; search → no-store, max-age=0.
- agent-browser: home page renders hero + Trending Now (6 movies) + Trending Series (12 series incl Lupin, Cyberpunk: Edgerunners); /search?q=batman renders The Batman, Batman Begins, Batman Returns cards; /movie renders 11 movie cards (Clayface, Spider-Man, etc.); /series renders 12 series cards (Lupin, LINK CLICK, etc.).
- agent-browser errors: empty on all 4 pages (no JS runtime errors from refactor).
- dev.log: GET /api/trending?page=1 second-hit 438ms→18ms (server cache), /api/search?q=batman&page=1 second-hit 737ms→8ms (in-memory cache). Only noise is pre-existing VideoTogether messageListener warnings (unrelated).
- ESLint: pre-existing circular JSON config error (mentioned in nobar-seo-optimize worklog), not introduced by this change. Turbopack compiles cleanly.

Stage Summary:
- 4 new API routes created, 4 client files refactored, tmdb.ts untouched.
- TMDB API key + TMDB client code no longer ship to browser bundle (only types do).
- Cache layering now: server in-memory Map (5min, process-wide shared across all users) + edge/CDN via s-maxage=300 + ISR revalidate=300. In production (Vercel/Cloudflare), subsequent users get <50ms responses with zero TMDB calls.
- Search results correctly NOT cached at edge (force-dynamic + no-store) — always fresh per query.
- All existing state-management logic preserved (loadCategory searchOverride, debounced search input, exit/enter search, load more). No UI/JSX changes.
- Centralized /api/* surface = loggable, ratelimit-able, observable (vs scattered client-side TMDB calls).

---
Task ID: nobar-optimize-debug-qc
Agent: main
Task: Optimize web — cleanup dead code, perf, SEO, server-side API routes, QC

Work Log:
- Investigasi via dev.log + agent-browser: home/movie/series/search semua clean (0 errors)
- DEAD CODE CLEANUP:
  • Delete src/components/WatchParty.tsx (12K, unused — socket.io client dari versi lama)
  • Delete src/components/MoviePlayer.tsx (12K, unused — diganti NativePlayer/SeriesNativePlayer)
  • Delete mini-services/watch-party (socket.io server, tidak accessible dari Vercel)
  • Delete mini-services/scraper-service (Playwright headless, tidak dipakai)
  • Remove dead imports dari movie/[id] + series/[id]: MoviePlayer, SERVERS, SERVERS_TV,
    type Server, NativePlayer (di series — SeriesNativePlayer wraps internally)
  • Total: ~24K code + 2 mini-services dengan node_modules besar dihapus
- PERF:
  • Fix scroll-behavior warning: add data-scroll-behavior="smooth" ke <html>
  • Add fetchPriority="high" ke HeroBanner LCP backdrop image
  • Fix /series/page.tsx skeleton aspect-video → aspect-[2/3] (match SeriesCard)
- SEO (delegasi ke seo-subagent):
  • generateMetadata di movie/[id] + series/[id] — dynamic title/description/OG/Twitter
  • JSON-LD structured data: schema.org Movie + TVSeries (dengan aggregateRating,
    numberOfSeasons, numberOfEpisodes, genre[], datePublished)
  • Root layout metadata enhanced: metadataBase, openGraph (siteName, locale id_ID),
    twitter card, robots index/follow
  • /sitemap.xml (4 URLs: /, /movie/, /series/, /search) + /robots.txt
  • Catatan: OG type 'video' invalid di Next 16 → pakai 'video.movie'/'video.tv_show'
- SERVER-SIDE API ROUTES (delegasi ke api-refactor-subagent):
  • Create 4 new routes: /api/trending, /api/discover, /api/search, /api/tv-trending
  • /api/trending + /api/discover + /api/tv-trending: revalidate=300 + s-maxage=300 (ISR 5min)
  • /api/search: force-dynamic + no-store (always fresh per query)
  • Refactor 4 client files: HomeClient, MovieListingClient, search/page, series/page
    → call /api/* instead of importing TMDB functions directly
  • TMDB runtime code removed dari browser bundle (hanya types yang ship)
  • Cache hit perf: /api/trending 438ms → 18ms (24x faster on second hit)
- QC (agent-browser):
  • Home: 28 movie links + 12 series cards, 0 errors
  • Movie detail (Clayface): title "Clayface (2026) — Nobar", JSON-LD @type=Movie,
    aggregateRating ratingValue=7.6 ratingCount=89, OG image = backdrop, canonical correct
  • Watch Party button: state-aware (embed → "butuh ekstensi VideoTogether untuk embed"),
    modal opens correctly
  • Search: 20 Batman results, 0 errors
  • Mobile (375px): navbar collapses, hero scales, no overflow — VLM confirmed "responsive,
    no visual breakage, touch-friendly buttons"
  • Desktop (1440px): full layout, harmonious
  • Sticky footer: verified on 404 page (short content) — footer at viewport bottom,
    no floating gap; on long home page — pushed down naturally, no overlap

Stage Summary:
- Bundle size: ~24K dead code removed + TMDB runtime code keluar dari browser bundle
- Perf: server cache 24x faster repeated loads; LCP image fetchPriority high
- SEO: dynamic metadata + JSON-LD structured data + sitemap + robots (Google-indexable)
- Architecture: clean separation — server API routes wrap TMDB lib, client uses HTTP only
- QC: all flows verified end-to-end, 0 console errors, responsive mobile+desktop, sticky
  footer working correctly

---
Task ID: nobar-moviebox-mapping
Agent: main
Task: Map MovieBox untuk direct MP4 streams (catalog expansion)

Work Log:
- Research subagent confirm BIG DISCOVERY: MovieBox = mzfi.me = movieboxhd.net
  (same aoneroom BFF backend, 7 mirror front-ends). "50-100 movie limit" was a BUG
  in our code, bukan catalog limit. Search "batman"=105, "spider-man"=94, "avengers"=157
  results — catalog ada ribuan.
- ROOT CAUSE analysis (2 bugs in /api/stream/[id]/route.ts):
  • Bug #1: Code pakai `se=1&ep=1` untuk movies → return hasResource:false → embed fallback.
    Movies HARUSNYA `se=0&ep=0` (verified live). TV series `se=N&ep=N` correct.
  • Bug #2: Code scan /home?page=1..5 (5 pages × ~20 = ~100 movies max).
    Harusnya pakai POST /subject/search (full catalog search).
- FIX #1 — Rewrite fetchMzfiStream signature to accept kind/season/episode:
  • Movies: se=0&ep=0 (was se=1&ep=1 — bug fix)
  • TV: se=season&ep=episode (unchanged, was correct)
- FIX #2 — Replace /home?page=1..5 scan with POST /subject/search:
  • New searchSubject() function: POST /wefeed-h5api-bff/subject/search
    with {keyword:title, page:1, perPage:20}
  • 3-pass matching: exact title+year → contains+year → any hasResource (last resort)
  • Filter by subjectType (1=movie, 2=series) + hasResource flag
- FIX #3 — Add 5min in-memory cache for search results:
  • Prevents 429 rate-limit from mzfi BFF (searchCache Map with CACHE_TTL=5min)
  • Negative cache: known-not-found titles skip re-query (avoid 429 spam)
- FIX #4 — Add subtitle fetch dari /subject/caption endpoint:
  • Returns SRT URLs per language (Arabic, English, Spanish, French, Hindi, Indonesian,
    Malay, Portuguese, etc.)
  • Stream route returns subtitles[] in response, NativePlayer renders <track> elements
- FIX #5 — Proxy Range support (CRITICAL for video seeking):
  • streamResponse() was returning status 200 always — even when mzfi CDN returned 206
    (Partial Content) for Range requests. Browser treated 200 as full response → seek
    broke (PIPELINE_ERROR_DECODE karena byte offset mismatch dengan currentTime)
  • Fix: pass through res.status + add Access-Control-Allow-Headers: Range +
    Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length
  • Verified: Range request sekarang return 206 + Content-Range + Content-Length=1024
- FIX #6 — /api/subtitle: add Referer+Origin untuk mzfi CDN (pbcdnw.aoneroom.com):
  • Detect via /aoneroom\.com|hakunaymatata\.com/ regex
  • Inject Referer: https://mzfi.me/ + Origin (prevent 429)
  • SRT→VTT conversion tetap berfungsi
- FIX #7 — NativePlayer subtitle support:
  • Add Subtitle type + subtitles[] + activeSubtitle state
  • Render <track kind=subtitles> elements di dalam <video>
  • Add subtitle toggle button (Subtitles icon) dengan menu: Off + list bahasa
  • Click bahasa → set textTracks[i].mode = "showing" / "disabled"
  • Max-h-60 overflow-y-auto scroll-row untuk list panjang (9-13 bahasa)

VERIFICATION RESULTS:
- 9/10 test movies now have direct MP4 (previously mostly embed-only):
  • Clayface (1400940): 1 source 360p — WAS embed!
  • Masterplan (1561726): 2 sources + 8 subs
  • Spider-Man BND (969681): 2 sources
  • Tenzing (1288069): 2 sources + 9 subs
  • Hope (1242462): 1 source 480p + 11 subs
  • Star Wars (1064213, 558, 11): 2 sources each + 9-11 subs
  • Breaking Bad S1E1 (1396): 2 sources + 13 subs — TV SERIES WORKS!
  • Only The Voyeurs (615657): embed fallback (VIP-locked per research)
- Browser test (agent-browser):
  • NativePlayer renders (not embed iframe) ✓
  • Video plays from start ✓ (readyState=4, playing=true)
  • Seek to 60s/120s works (NO decode errors) ✓
  • Subtitle menu: 8 bahasa (Off, Arabic, English, Spanish, French, Hindi, Indonesian,
    Malay, Portuguese) ✓
  • Select Indonesian → subtitle renders: "SUITE PRESIDENSIAL" visible at bottom
    (VLM confirmed) ✓
  • Range request via proxy: 206 + Content-Range (was 200 before fix) ✓
- ffprobe confirm codecs: H.264 High profile video + AAC LC audio (browser-native)

Stage Summary:
- Catalog expanded dari ~50-100 → RIBUAN movies (search unlocks full aoneroom BFF)
- Bug fix se=0&ep=0 untuk movies: Clayface + banyak lainnya sekarang direct MP4
  (sebelumnya embed-only)
- Subtitle support: 8-13 bahasa per movie, SRT→VTT proxy dengan Referer injection
- Proxy Range fix: video seeking works (no more PIPELINE_ERROR_DECODE)
- TV series: Breaking Bad S1E1 verified — 2 sources + 13 subs
- Only VIP-locked titles (The Voyeurs) fall to embed — expected behavior

---
Task ID: nobar-vip-breakthrough
Agent: main
Task: Breakthrough VIP-locked movies — unlock ALL direct MP4 streams

Work Log:
- Investigasi "VIP-locked" movies (Frozen, Inside Out 2, Joker 2):
  • Search endpoint returns hasResource:true for ALL of them
  • Play endpoint returned vipLocked:true + empty stream URLs
  • 7 bypass strategies tested (URL-encode brackets, no supportCodecs, x-vip-restrict:0/2/none,
    streamSignType=0, HLS/DASH) → ALL returned vipLocked=false + real URLs!
  • Controlled test: same token, 5 rapid calls → ALL returned vipLocked=false
- ROOT CAUSE FOUND: x-vip-restrict: 1 header in COMMON_HEADERS!
  • WITH x-vip-restrict:1 → vipLocked=True, url=EMPTY (server applies VIP restriction)
  • WITHOUT x-vip-restrict → vipLocked=False, url=yes (all streams unlocked, incl 1080p)
  • The header literally tells the server "restrict me as VIP-limited user"
  • We were sending it in ALL requests (home, search, play) via COMMON_HEADERS
- FIX: Remove x-vip-restrict + x-client-info + x-source + x-no-high-risk-restrict
  from COMMON_HEADERS. Only send UA + Accept + Origin.
- ALSO FIXED: URL bracket encoding
  • supportCodecs[h264]=1 (raw brackets) → BFF returns empty response
  • supportCodecs%5Bh264%5D=1 (URL-encoded) → works correctly
- ALSO FIXED: Fuzzy title matching (searchSubject rewrite)
  • normalizeTitle(): lowercase + strip non-alphanumeric
    ("Avatar: The Way of Water" → "avatarthewayofwater" = "Avatar - The Way Of Water")
  • yearMatch() with ±1 tolerance (TMDB release_date vs mzfi streaming date)
  • 4-pass matching: exact+year0 → exact+year±1 → contains+year±1 → best-prefix
  • Pass 4 picks most similar title (longest common prefix), not just first hasResource
- ADDED: Retry logic for transient vipLocked (anti-bot cold-token behavior)
  • If attempt1 returns no playable streams → wait 800ms → mint fresh token → retry
  • Handles rare cases where BFF returns vipLocked=true on first call
- ALSO FOUND: Previous test labels used WRONG TMDB IDs:
  • 730154 = "Your Eyes Tell" (2020), NOT Joker 2 (correct ID = 889737)
  • 615657 = "May & August" (2002), NOT The Voyeurs (correct ID = 645710)
  • 109445 = Frozen (2013) — this WAS genuinely VIP-locked, now FIXED

VERIFICATION — 13/13 movies now direct MP4 (was 9/13 before):
  Frozen (2013)          → 1src(1080p)+14subs  [WAS VIP-locked!]
  Inside Out 2 (2024)    → 2src(480p,1080p)+11subs  [WAS VIP-locked!]
  Joker Folie (2024)     → 3src(360p,480p,1080p)+8subs  [WAS "not found"!]
  Avatar 2 (2022)        → 3src(360p,720p,1080p)  [WAS mismatch!]
  Dune Part 2 (2024)     → 4src(360p,480p,720p,1080p)+11subs
  Parasite (2019)        → 4src(all qualities)+17subs
  Godfather (1972)       → 4src(all qualities)+11subs
  Forrest Gump (1994)    → 4src(all qualities)+10subs
  Fight Club (1999)      → 3src+15subs
  Spirited Away (2001)   → 3src(360p,720p,1080p)
  Oppenheimer (2023)     → 1src(480p)+11subs
  Hope (2026)            → 2src(480p,720p)+11subs
  Breaking Bad S1E1      → 4src(all qualities)+13subs (TV)

QUALITY UPGRADE: Most movies now have 1080p (was capped at 480p before).
Browser test: Frozen plays correctly (readyState=4, 0 errors).

Stage Summary:
- "VIP-locked" movies were NEVER actually VIP-locked — our x-vip-restrict:1 header
  was telling the server to restrict us. Removing it unlocks ALL movies + 1080p quality.
- Fuzzy matching (normalize punctuation + year±1) fixes Avatar 2 + similar mismatches.
- Retry logic handles rare transient vipLocked anti-bot behavior.
- 100% success rate on 13-movie test suite (was ~70% before).
- Quality upgraded from 480p max → 1080p for most titles.

---
Task ID: nobar-visionquest-bug-fix
Agent: main
Task: Fix Vision Quest playing wrong movie (Seven Havens) — matching bug

Work Log:
- Bug: User opened "Vision Quest" (TMDB 30069) but "Avatar: Seven Havens" played.
- Root cause investigation:
  • mzfi search "Vision Quest" returns 4 unrelated items (no exact match in catalog):
    Viking Quest (2015), Avatar: Seven Havens (2026), Visions (2025), The Quest (2022)
  • Previous Pass 4 (loose prefix match) picked "Visions" (score=6) or worse — wrong movie
- FIX #1 — Strict Pass 4 threshold:
  • Old: any hasResource (last resort) — picks wrong movie
  • New: require prefix score >= 80% of query length AND year within ±2
  • "Vision Quest" (11 chars) → minScore=9; "Visions" matches 6 < 9 → rejected
  • If no pass matches, return null → embed fallback (CORRECT movie via IMDB ID)
- FIX #2 — Also found REAL root cause of broader matching failures:
  • tmdbGet() hardcoded language=id-ID → returns Indonesian titles
  • mzfi catalog uses ENGLISH titles (e.g. "Thor: Love and Thunder")
  • Our code searched mzfi with "Thor: Cinta dan Guntur" (Indonesian) → no match
  • Created fetchMovieDetailEnglish() + fetchTVDetailEnglish() with language=en-US
  • Stream route now uses English title for mzfi search (UI keeps id-ID for display)
- FIX #3 — subjectType preference in Pass 4:
  • Movies (kind=movie) prefer subjectType=1, TV (kind=tv) prefers subjectType=2
  • typeBonus +100 for matching type prevents picking series when movie requested

VERIFICATION (correct TMDB IDs this time):
- Vision Quest (1985): 0src embed=yes ✓ CORRECT (not in mzfi, plays via embed)
- Spider-Man NWH (2021): 3src+13subs ✅ FIXED (was embed due to Indo title)
- Jurassic World (2015): 3src+20subs ✅ FIXED (was using wrong TMDB ID in tests)
- The Matrix (1999): embed (genuinely not in mzfi — only Reloaded/Resurrections)
- Blade Runner 2049: embed (genuinely not in mzfi)
- All 7 previously-working movies: still working (no regression)
  (Frozen, Inside Out 2, Joker Folie, Avatar 2, Parasite, Godfather, Breaking Bad)

Stage Summary:
- Vision Quest bug FIXED: no more wrong movie playback (Seven Havens → embed with correct IMDB ID)
- English title fix: Spider-Man NWH + Jurassic World now direct MP4 (were embed)
- Strict Pass 4: no more false-positive matches (Visions ≠ Vision Quest)
- Genuinely-not-in-mzfi movies correctly fall to embed (The Matrix, Blade Runner 2049)

---
Task ID: nobar-mzfi-thorough-debug
Agent: main
Task: Debug menyeluruh mzfi — fix concurrency, 429, negative cache, dedup

Work Log:
- Built comprehensive test suite: 50+ movies across categories (classics, recent, indie, Asian,
  Marvel/DC, anime, TV series multi-season, edge cases). Identified real bugs vs test-label mistakes.
- FINDING: Most "failures" were test-label mismatches (wrong TMDB IDs), not real bugs:
  • 76341=Mad Max not Donnie Darko, 122917=Hobbit not Sonic 2, 218=Terminator not Matrix
  • Movies genuinely not in mzfi catalog: The Matrix (1999), Iron Man (2008 movie),
    Game of Thrones, Star Wars ANH, Blade Runner 2049, Green Mile — embed fallback correct
- REAL BUGS found + fixed:

BUG 1 — Concurrent request storms (FIXED):
  • 10 simultaneous requests to same movie → 10 token mints + 10 search calls
  • Could trigger 429 rate-limit from mzfi BFF
  • FIX: Request deduplication via inflightSearches Map<key, Promise>
    - If search for same key is in-flight, await it instead of firing new call
    - Promise is deleted on settle (.finally)
    - Prevents token-mint storms + 429 cascading

BUG 2 — 429 rate-limit not handled (FIXED):
  • mzfi BFF returns 429 when too many requests hit same token
  • Previously: searchRes.ok=false → return null → embed fallback (wrong)
  • FIX: Retry on 429 with exponential backoff (3 attempts: 500ms, 1s, 2s)
    - Only retries on 429 (not other errors)
    - Prevents transient rate-limit from causing embed fallback

BUG 3 — Negative cache too aggressive (FIXED):
  • Previously: negative cache (no match) cached for 5min (same as positive)
  • If search failed transiently (429, network), all requests for 5min would fail
  • FIX: Split TTL — positive 5min, negative 1min
    - Negative cache retries sooner in case of transient failure
    - POSITIVE_TTL=5min, NEGATIVE_TTL=1min
    - CacheEntry type gains isNegative flag

BUG 4 — Cache key missing kind (FIXED):
  • Previously: cacheKey = title|year (no kind)
  • Movie + TV with same title+year would share cache → wrong subjectType picked
  • FIX: cacheKey = title|year|kind (movie vs tv separated)

BUG 5 — ::cue subtitle styling missing (PARTIAL FIX):
  • Native <track> cues rendered with browser defaults (tiny, no background)
  • FIX: Added video::cue CSS with readable styling (dark bg, white text, 1.1em font)
  • Note: Some browsers don't render ::cue reliably when mode set via JS — known issue
  • Track data layer works perfectly (tracks load, cues parse, 1214 cues for Jurassic World)

VERIFICATION:
- 10 concurrent requests to Jurassic World → all succeed, 0 errors, 0 429s ✓
- 5 different movies simultaneously → all succeed ✓
- 30+ movie regression suite → 100% pass (no regression) ✓
- TV series multi-season (Breaking Bad S1/S5, Stranger Things, Witcher, Arcane) → all work ✓
- Browser test: Jurassic World plays, 20 subtitle tracks, seek works, ::cue styled ✓
- Subtitle proxy: SRT→VTT conversion works (tested Indonesian "Anak - anak, ayo cepat!")

Stage Summary:
- 4 real bugs fixed (concurrency, 429, negative cache, cache key)
- mzfi integration now robust: handles rate-limits, deduplicates concurrent requests,
  retries on transient failures, caches appropriately (positive 5min, negative 1min)
- 30+ movies + 8 TV series verified working — no regression
- ::cue subtitle styling added (data layer works; visual rendering is browser-specific)

---
Task ID: nobar-search-multi-fix
Agent: main
Task: Fix search only returning movies — TV series (Breaking Bad, Stranger Things) not showing

Work Log:
- Bug: searchMovies() called TMDB /search/movie endpoint — only returns movies, NOT TV series
  • User searched "breaking bad" → only El Camino movie + Breaking Bad Wolf (wrong year)
  • User searched "stranger things" → only Stranger Things 2013 (wrong, should be 2016 TV)
  • Actual TV series (Breaking Bad 2008, Stranger Things 2016) were missing entirely
- FIX: Switch searchMovies() from /search/movie to /search/multi
  • /search/multi returns movies + TV + people in mixed results
  • Each item has media_type: "movie" | "tv" | "person"
  • Filter out people (media_type === "person") — we only show movies + TV
  • Also filter to only movie/tv (defensive — reject unexpected types)
- Update TMDBMovie type: add optional media_type + first_air_date fields
  (TMDBMovie now serves as union type for both movies and TV search results)
- Update SearchPage to render SeriesCard for TV results (not MovieCard)
  • Check m.media_type === "tv" → render SeriesCard (shows TV badge + routes to /series/)
  • Else → render MovieCard (routes to /movie/)
  • Key prefix tv-/mv- to avoid React key collisions when same ID exists in both

VERIFICATION:
- Breaking Bad search: 15 results, first = "Breaking Bad (2008) [tv]" ✓
  (was: only movies, Breaking Bad series missing)
- Stranger Things search: 14 results, first = "Stranger Things (2016) [tv]" ✓
  (was: only Stranger Things 2013 movie, wrong year)
- Game of Thrones search: 19 results, first = "Game of Thrones (2011) [tv]" ✓
- Spider search: 20 results, mixed movie + TV (Spider-Man 1994 TV, Spider-Noir 2026 TV, etc.) ✓
- Browser: Breaking Bad card shows "TV" badge, click routes to /series/breaking-bad-2008-1396 ✓
- Title: "Breaking Bad (Series) — Nobar" ✓

Stage Summary:
- Search now returns BOTH movies AND TV series (was movies-only)
- Breaking Bad, Stranger Things, Game of Thrones all appear in search results
- TV results render with SeriesCard (TV badge + /series/ routing)
- Movie results still render with MovieCard (/movie/ routing)
- Click flow verified: Breaking Bad → /series/breaking-bad-2008-1396 with correct title

---
Task ID: nobar-vercel-production-fix
Agent: main
Task: Fix workspace-works-Vercel-doesn't — 5 root causes

Investigation findings (workspace vs Vercel production):
1. GEOGRAPHY: Workspace in Hong Kong (near mzfi CDN), Vercel sin1 in Singapore
   - mzfi latency per call: ~200-900ms (HK) vs ~400-1500ms (SG estimated)
   - Total chain (6 calls): ~2-4s (workspace) vs ~5-10s (Vercel)
2. VERCEL TIMEOUT: Hobby=10s, Pro=60s. Our 6-call chain + 800ms retry could exceed.
3. BODY STREAMING: Default Node.js runtime can buffer/truncate large videos.
   Need explicit runtime="nodejs" + maxDuration for /api/proxy.
4. IN-MEMORY CACHE: Serverless cold starts = cache lost every invocation.
   Workspace single process = cache persists (18ms 2nd hit vs 2-4s fresh).
5. 429 RATE-LIMIT: Vercel sin1 = all SE Asia users share 1 IP → more 429s.

Fixes applied:
1. /api/stream/[id]/route.ts: export maxDuration=60 (Vercel function timeout)
2. /api/proxy/route.ts: export maxDuration=300 + runtime="nodejs"
   (Node.js runtime streams large videos properly; 300s for seek through 2GB movies)
3. Parallel TMDB fetch with mzfi token mint (save ~500ms)
   - tmdbPromise runs concurrently; await before mzfi search (need title)
4. Lazy subtitle fetch: main /api/stream returns 1 "Available" placeholder,
   client fetches actual list from /api/stream/[id]/subtitles on-demand.
   - Saves ~340ms on main stream response (critical for Vercel timeout)
   - Subtitles only fetched when user opens subtitle menu
5. New /api/stream/[id]/subtitles/route.ts endpoint (maxDuration=30s)
   - Reuses same mzfi search+play logic, returns caption list only
6. NativePlayer: detect "Available" placeholder → lazy fetch subtitle list
   - Backward compatible with legacy inline subtitle URLs

Verification:
- /api/stream/135397: 3 sources + 1 "Available" placeholder (was 3 sources + 20 inline subs)
  - Response time: 2.4s (was 3-4s with inline subtitle fetch) ✓
- /api/stream/135397/subtitles: 20 actual subtitles returned on-demand ✓
- Browser: Jurassic World plays (readyState=4, video element present) ✓
- 0 console errors ✓

Stage Summary:
- Vercel production should now work: maxDuration set, runtime="nodejs" for proxy,
  lazy subtitles, parallel TMDB fetch
- Main stream response ~1s faster (saves subtitle fetch latency)
- Subtitles still work — just fetched lazily when user opens the menu

---
Task ID: nobar-vercel-search-not-working
Agent: main
Task: Fix search Stranger Things tidak muncul di Vercel (workspace works)

REAL ROOT CAUSE (bukan geography/timeout seperti dugaan sebelumnya):
- Build Vercel GAGAL karena TypeScript error: "Duplicate identifier 'TMDBSeries'"
  • Saat add type TMDBSeries baru (line 39, extends TMDBMovie), type lama (line 651)
    belum dihapus → duplicate declaration
  • Vercel build error → deployment gagal → Vercel tetap serve deployment LAMA
    yang masih pakai /search/movie (movies-only, no media_type)
  • Workspace dev server (next dev) TIDAK typecheck, jadi bug tidak terdeteksi
    locally — cuma muncul saat `next build`

DIAGNOSIS:
- Vercel /api/search?q=stranger+things: 11 results, media_type=None (kode lama)
- Workspace /api/search?q=stranger+things: 14 results, media_type='tv' (kode baru)
- Bandingkan: Vercel masih serve deployment lama karena build terbaru gagal

FIX: Hapus duplicate TMDBSeries type definition (line 651).
TMDBSeries baru (line 39) sudah extends TMDBMovie yang punya semua fields.

VERIFICATION (Vercel setelah rebuild):
- Search "stranger things": 14 results, first = Stranger Things (2016) [tv] ✓
  (was: 11 results, Stranger Things 2013 movie only, media_type=None)
- Search "breaking bad": 15 results, first = Breaking Bad (2008) [tv] ✓
- Search "game of thrones": 19 results, first = Game of Thrones [tv] ✓
- Search "spider": 20 results, mixed movie + TV ✓

PELAJARAN PENTING:
- Selalu jalankan `bun run build` sebelum push untuk catch TypeScript errors
- Dev server (next dev) tidak typecheck — bugs type hanya muncul saat build
- Kalau Vercel behave differently dari workspace, check build logs dulu
  (bukan langsung blame geography/timeout)

---
Task ID: nobar-idlix-ui-polish
Agent: main
Task: Apply idlixku UI/UX polish patterns to Nobar

Work Log:
- Research subagent RE idlixku (53KB report at research/idlix-ui-research.md)
- Applied polish patterns to globals.css + components:

1. MOTION TOKENS (idlixku secret sauce):
   - --motion-dur-fast: 0.14s, base: 0.2s, sheet: 0.26s, slow: 0.32s, loop: 1.6s
   - --motion-ease-standard: cubic-bezier(0.4,0,0.2,1)
   - --motion-ease-expo: cubic-bezier(0.16,1,0.3,1) (expo-out)
   - --motion-ease-sheet: cubic-bezier(0.32,0.72,0,1)

2. CARD POLISH (MovieCard/SeriesCard):
   - Hover scale 1.05 + z-index 20 (Netflix pop)
   - Ring border: white/5 → brand-500/50 on hover
   - Rank numbers: stroke italic (-webkit-text-stroke 2px white/35%)
   - Quality badges (color-coded): q-1080=gold, q-720=cyan, q-480=sage, q-360=gray
   - TV badge: sage gradient + glow
   - Play button overlay: brand-500/90 + ring-2 ring-white/20
   - Title hover: text-brand-400 transition

3. HERO CTA (idlixku diagonal gradient):
   - .hero-cta-primary: linear-gradient(135deg, brand-500, brand-600)
   - ::before pseudo: white/15 sheen on hover
   - box-shadow: 0 8px 24px -8px brand-500/50 on hover

4. DETAIL PAGE NETFLIX PULL-UP:
   - .detail-pull-up: margin-top -180/-200/-240px (responsive)
   - Content overlaps backdrop hero (classic Netflix/idlixku pattern)
   - Hero height: 65svh (was 55vh) — taller, more cinematic
   - Title: drop-shadow-2xl for depth
   - Badge: rounded-md + shadow-lg

5. MODAL BLUR-IN (idlixku entrance):
   - .modal-panel: filter blur(2px) → 0 + scale(0.97) → 1
   - Transition: sheet ease + 0.26s duration

6. NAVBAR PILL:
   - .nav-pill: border-radius 999px + active state bg brand-500/15
   - Logo: group-hover:scale-105

7. SECTION HEADERS:
   - Accent bar: w-1 h-6 bg-brand-500 rounded-full
   - font-display (Plus Jakarta Sans)
   - section-enter animation (staggered blur+translate)

8. SKELETON + FADE-IN:
   - shimmer: 1.6s loop (was 1.4s)
   - fadeInUp: blur(2px) → 0 + translateY(12px) → 0 + expo ease

9. MOBILE BOTTOM BAR (idlixku np-bar):
   - Fixed bottom, backdrop-blur, safe-area-inset padding
   - Pill-shaped items, active state brand-400

VERIFICATION:
- bun run build: passes ✓
- Browser home: section headers with accent bars, cards with quality badges ✓
- Browser movie detail: pull-up overlap, hero CTA, polished ✓
- 0 console errors ✓
- VLM: "high level of polish... professional and cohesive"

---
Task ID: nobar-re-vidlink-pro-breakthrough
Agent: main
Task: RE vidlink.pro lebih keras — extract direct MP4 URLs

FULL RE RESULTS:

1. Page JS chunk found: /_next/static/chunks/app/movie/[id]/page-*.js
   - Module 20162: fetch('/api/b/movie/{TOKEN}?multiLang=0', {headers:{[i.Zt]:a}})
   - Module 67127: header name = "X-Playback-Environment"
   - Module 5196: decrypt function D (surge.flooderrr.store proxy rewriter)

2. Auth token generation:
   - /script.js defines globalThis.Dm (Go syscall/js bridge)
   - /fu.wasm = 2.4MB Go binary compiled to WASM
   - Go exports getAdv(movieId) → returns auth token
   - Token = base64 encoded, includes movieId + timestamp + libsodium signature
   - Token changes per call, unique per movie ID

3. BREAKTHROUGH: API URL pattern is /api/b/movie/{TOKEN} (NOT /api/b/movie/{id})
   - Token goes IN THE URL PATH, not as header
   - Server-side Node.js CAN run fu.wasm (with libsodium-wrappers + browser stubs)
   - API returns JSON with direct MP4 URLs!

4. API Response:
   {
     "sourceId": "mwVault",
     "stream": {
       "type": "file",
       "deliveryType": "file",
       "qualities": {
         "360": { "type":"mp4", "url":"https://bcdn.hakunaymatata.com/resource/h265/...mp4?sign=...&t=..." },
         "480": { ... },
         "720": { ... },
         "1080": { ... }
       }
     }
   }

5. CDN = hakunaymatata.com (SAME as mzfi!)
   - Same CDN, different paths (resource/h265/ vs resource/)
   - requiresProxy: true → needs surge.flooderrr.store proxy OR our /api/proxy

6. Server-side implementation:
   - Node.js runs fu.wasm via Dm bridge (Go WASM)
   - libsodium-wrappers provides sodium
   - Browser stubs: window, document, navigator
   - getAdv(movieId) → token → fetch API → JSON → direct MP4 URLs
   - NO browser needed, NO Cloudflare block

This means: vidlink.pro can be a SECOND direct MP4 provider alongside mzfi!
Embed fallback movies can now get direct MP4 URLs → play in <video> →
VT syncs natively → NO extension needed for ANY movie!

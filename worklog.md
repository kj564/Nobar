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

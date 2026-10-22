// Nobar — app.js (Vanilla JS, Go backend API)
//
// Audit fixes applied:
//  • BACKEND_URL port assumption removed — uses relative "/api/..." so the same
//    origin serves both static assets and API. Caddyfile default-handler proxies
//    unknown paths to Go :8080, so /api/* just works through the gateway.
//  • escapeHtml() helper applied to every TMDB-derived string before innerHTML.
//    Prevents XSS via crafted movie titles / cast names from third-party API.
//  • Stats in hero section are now populated from real backend data
//    (CREATORS.length, CATEGORIES.length, trending total_results) — no more
//    fabricated "240+/85/12" placeholders.

(function () {
  'use strict';

  // Relative API base — works whether the page is served by Go directly (:8080)
  // or by the Caddy gateway (which proxies /api/* to :8080 by default).
  const API_BASE = '';
  const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
  const TMDB_IMG_LG = 'https://image.tmdb.org/t/p/w780';
  const TMDB_IMG_ORIG = 'https://image.tmdb.org/t/p/original';

  let SERVERS = [];
  let CREATORS = [];

  const CATEGORIES = [
    { id: 'trending', name: 'Trending', tmdbGenreId: null },
    { id: 28, name: 'Action', tmdbGenreId: 28 },
    { id: 16, name: 'Animation', tmdbGenreId: 16 },
    { id: 35, name: 'Comedy', tmdbGenreId: 35 },
    { id: 18, name: 'Drama', tmdbGenreId: 18 },
    { id: 99, name: 'Documentary', tmdbGenreId: 99 },
    { id: 27, name: 'Horror', tmdbGenreId: 27 },
    { id: 10749, name: 'Romance', tmdbGenreId: 10749 },
  ];

  const state = {
    activeCategory: 'trending',
    page: 1, totalPages: 1,
    movies: [], featured: [],
    loading: false, loadingMore: false, error: null,
    isSearching: false, searchQuery: '',
    totalTrendingResults: 0,
  };

  let currentVideoInModal = null;
  let currentServerId = null;
  let toastTimer = null;

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  const header = $('#header');
  const menuBtn = $('#menuBtn');
  const featuredRow = $('#featuredRow');
  const filterChips = $('#filterChips');
  const videoGrid = $('#videoGrid');
  const creatorRow = $('#creatorRow');
  const modal = $('#videoModal');
  const modalClose = $('#modalClose');
  const iframe = $('#videoIframe');
  const loadingOverlay = $('#modalLoading');
  const toast = $('#toast');
  const serverPicker = $('#serverPicker');
  const currentServerLabel = $('#currentServerLabel');
  const modalSimilar = $('#modalSimilar');
  const modalSimilarRow = $('#modalSimilarRow');
  const modalCast = $('#modalCast');
  const modalCastList = $('#modalCastList');
  const statMovies = $('#statMovies');
  const statCreators = $('#statCreators');
  const statCategories = $('#statCategories');
  let loadMoreWrap = null;

  // ─── XSS hardening ───────────────────────────────────────────────────────
  // Escape any string that will be interpolated into innerHTML. TMDB returns
  // free-form text (titles, overviews, cast names) — never inject raw.
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, (ch) => ESC_MAP[ch]);
  }
  // Allow integer IDs only — used in data-* attributes.
  function intAttr(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? String(n) : '';
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast-show'), 2400);
  }

  function buildServerUrl(server, videoId) {
    return server.pattern.replace('{video_id}', encodeURIComponent(videoId));
  }

  function posterUrl(path, size) {
    if (!path) return 'https://placehold.co/500x750/1c1c20/3a3a40?text=Nobar';
    const base = size === 'lg' ? TMDB_IMG_LG : (size === 'original' ? TMDB_IMG_ORIG : TMDB_IMG);
    return base + path;
  }

  function formatRuntime(minutes) {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
  }

  function formatYear(dateStr) {
    return dateStr ? String(dateStr).slice(0, 4) : '—';
  }

  function formatViews(count) {
    if (!count) return '—';
    if (count >= 1e9) return (count / 1e9).toFixed(1) + 'B';
    if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M';
    if (count >= 1e3) return (count / 1e3).toFixed(1) + 'k';
    return String(count);
  }

  function updateStats() {
    if (statMovies) {
      statMovies.textContent = state.totalTrendingResults > 0
        ? formatViews(state.totalTrendingResults)
        : '—';
    }
    if (statCreators) statCreators.textContent = CREATORS.length || '—';
    if (statCategories) statCategories.textContent = String(CATEGORIES.length);
  }

  // API: fetch via Go backend (relative path — same origin).
  async function apiGet(path, params = {}) {
    const url = new URL(`${API_BASE}${path}`, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Backend ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async function fetchConfig() {
    const data = await apiGet('/api/config');
    SERVERS = data.servers || [];
    CREATORS = data.creators || [];
  }

  async function fetchTrending(page = 1) {
    return apiGet('/api/trending', { page });
  }

  async function fetchByGenre(genreId, page = 1) {
    return apiGet('/api/discover', { genre: genreId, page });
  }

  async function searchMovies(query, page = 1) {
    return apiGet('/api/search', { q: query, page });
  }

  async function fetchDetails(movieId) {
    return apiGet(`/api/movie/${encodeURIComponent(movieId)}`);
  }

  async function fetchCategory(categoryId, page) {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) throw new Error('Kategori tidak dikenal');
    if (cat.tmdbGenreId === null) return fetchTrending(page);
    return fetchByGenre(cat.tmdbGenreId, page);
  }

  function renderFilters() {
    filterChips.innerHTML = CATEGORIES.map(cat => {
      const active = cat.id === state.activeCategory;
      return `<button data-category="${esc(cat.id)}" class="px-4 py-1.5 rounded-full text-sm font-medium border transition ${active ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'}">${esc(cat.name)}</button>`;
    }).join('');
    $$('#filterChips button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.loading) return;
        state.activeCategory = btn.dataset.category;
        state.page = 1; state.movies = [];
        renderFilters(); renderGrid();
        loadCategory(true);
      });
    });
  }

  function cardMarkup(movie, extraClass) {
    const id = intAttr(movie.id);
    const title = esc(movie.title || movie.name || 'Untitled');
    const poster = posterUrl(movie.poster_path);
    const year = esc(formatYear(movie.release_date));
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
    const views = esc(formatViews(movie.vote_count));
    const catName = esc((CATEGORIES.find(c => c.id === state.activeCategory) || {}).name || 'Film');
    return `<article class="video-card ${extraClass || ''} group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in" data-video-id="${id}" tabindex="0" role="button" aria-label="Buka ${title}">
      <div class="card-thumb relative aspect-video overflow-hidden bg-ink-800">
        <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/500x750/1c1c20/3a3a40?text=Nobar'" class="w-full h-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold">${year} • ⭐ ${esc(rating)}</span>
        <div class="card-play absolute inset-0 flex items-center justify-center">
          <div class="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
            <svg viewBox="0 0 24 24" fill="white" class="w-6 h-6 ml-0.5"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <div class="p-3">
        <h3 class="font-display text-sm font-bold leading-snug line-clamp-2">${title}</h3>
        <p class="mt-1 text-xs text-gray-400 line-clamp-1">${catName} • ${views} suara</p>
      </div>
    </article>`;
  }

  function renderFeatured() {
    if (!state.featured.length) { featuredRow.innerHTML = ''; return; }
    featuredRow.innerHTML = state.featured.map(m => cardMarkup(m, 'featured-card')).join('');
  }

  function renderGrid() {
    if (state.loading && !state.movies.length) { videoGrid.innerHTML = renderSkeletonGrid(10); return; }
    if (state.error) { videoGrid.innerHTML = renderError(state.error); return; }
    if (!state.movies.length) { videoGrid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-12">Tidak ada film untuk kategori ini.</p>'; return; }
    videoGrid.innerHTML = state.movies.map(m => cardMarkup(m)).join('');
  }

  function renderSkeletonGrid(n) {
    return Array.from({ length: n }, () => '<div class="rounded-lg overflow-hidden border border-white/5"><div class="skeleton aspect-video"></div><div class="p-3 space-y-2"><div class="skeleton h-3 rounded w-3/4"></div><div class="skeleton h-2 rounded w-1/2"></div></div></div>').join('');
  }

  function renderError(message) {
    return `<div class="col-span-full text-center py-12 px-4">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/15 text-brand-400 mb-3"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg></div>
      <h3 class="font-semibold text-white">Gagal memuat film</h3>
      <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${esc(message)}</p>
      <button id="retryBtn" class="mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded text-sm font-semibold">Coba lagi</button>
    </div>`;
  }

  function renderCreators() {
    creatorRow.innerHTML = CREATORS.map(c => `<div class="bg-ink-900 rounded-lg p-4 text-center border border-white/5 hover:border-white/20 transition"><img src="${esc(c.avatar)}" alt="${esc(c.name)}" loading="lazy" class="w-16 h-16 mx-auto rounded-full object-cover border-2 border-white/10" /><h4 class="mt-3 font-semibold text-sm">${esc(c.name)}</h4><p class="text-xs text-gray-400">${esc(c.role)}</p></div>`).join('');
  }

  function ensureLoadMoreWrap() {
    if (loadMoreWrap) return loadMoreWrap;
    loadMoreWrap = document.createElement('div');
    loadMoreWrap.className = 'flex flex-col items-center gap-3 mt-8';
    videoGrid.parentNode.insertBefore(loadMoreWrap, videoGrid.nextSibling);
    return loadMoreWrap;
  }

  function renderLoadMore() {
    const wrap = ensureLoadMoreWrap();
    if (state.error || state.loading) { wrap.innerHTML = ''; return; }
    if (state.page >= state.totalPages) { wrap.innerHTML = '<p class="text-xs text-gray-500">Sudah mencapai akhir daftar.</p>'; return; }
    wrap.innerHTML = `<button id="loadMoreBtn" class="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm font-semibold transition ${state.loadingMore ? 'opacity-60 cursor-wait' : ''}" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? '<span class="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white mr-2 align-middle animate-spin"></span>Memuat…' : 'Muat Lebih Banyak'}</button><p class="text-xs text-gray-500">Halaman ${state.page} dari ${state.totalPages}</p>`;
    const btn = $('#loadMoreBtn', wrap);
    if (btn) btn.addEventListener('click', () => loadCategory(false, true));
  }

  async function loadCategory(reset = false, append = false) {
    if (reset) { state.page = 1; state.movies = []; }
    const targetPage = append ? state.page + 1 : state.page;
    state.loading = !append; state.loadingMore = append; state.error = null;
    if (!append) renderGrid();
    renderLoadMore();
    try {
      let data;
      if (state.isSearching) data = await searchMovies(state.searchQuery, targetPage);
      else data = await fetchCategory(state.activeCategory, targetPage);
      if (append) {
        const existingIds = new Set(state.movies.map(m => m.id));
        state.movies = state.movies.concat((data.results || []).filter(m => !existingIds.has(m.id)));
        state.page = targetPage;
      } else {
        state.movies = data.results || [];
        state.page = data.page || 1;
        if (!state.isSearching && state.activeCategory === 'trending') {
          state.featured = state.movies.slice(0, 6);
          state.totalTrendingResults = data.total_results || 0;
          updateStats();
          renderFeatured();
        }
      }
      state.totalPages = data.total_pages || 1;
    } catch (err) {
      console.error(err);
      state.error = err.message || 'Gagal memuat data dari backend.';
    } finally {
      state.loading = false; state.loadingMore = false;
      renderGrid(); renderLoadMore();
    }
  }

  function renderSimilar(similarData) {
    const results = (similarData && similarData.results) || [];
    if (!results.length) { modalSimilar.classList.add('hidden'); modalSimilarRow.innerHTML = ''; return; }
    const items = results.slice(0, 10);
    modalSimilarRow.innerHTML = items.map(m => {
      const poster = posterUrl(m.poster_path);
      const title = esc(m.title || m.name || 'Untitled');
      const year = esc(formatYear(m.release_date));
      const rating = m.vote_average ? m.vote_average.toFixed(1) : '—';
      const id = intAttr(m.id);
      return `<button class="similar-card group shrink-0 w-28 sm:w-32 text-left" data-movie-id="${id}" role="button" aria-label="Buka ${title}">
        <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 group-hover:border-brand-500/50 transition">
          <img src="${poster}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/200x300/1c1c20/3a3a40?text=No+Poster'" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
          <span class="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white">⭐ ${esc(rating)}</span>
        </div>
        <h4 class="mt-1.5 text-xs font-medium text-gray-300 group-hover:text-white transition line-clamp-2 leading-tight">${title}</h4>
        <p class="text-[10px] text-gray-500">${year}</p>
      </button>`;
    }).join('');
    modalSimilar.classList.remove('hidden');
    $$('#modalSimilarRow .similar-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const newId = parseInt(btn.dataset.movieId, 10);
        if (Number.isFinite(newId)) {
          openModal(newId);
          modal.querySelector('.modal-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  function renderCast(creditsData) {
    const cast = (creditsData && creditsData.cast) || [];
    if (!cast.length) { modalCast.classList.add('hidden'); modalCastList.innerHTML = ''; return; }
    const topCast = cast.slice(0, 8);
    modalCastList.innerHTML = topCast.map(p => {
      const name = esc(p.name || 'Unknown');
      const character = esc(p.character || '');
      const avatar = p.profile_path ? posterUrl(p.profile_path) : null;
      const initial = esc((p.name || '?').charAt(0));
      const avatarHtml = avatar ? `<img src="${esc(avatar)}" alt="${name}" loading="lazy" onerror="this.src='https://placehold.co/100x100/1c1c20/3a3a40?text=${encodeURIComponent(initial)}'" class="w-8 h-8 rounded-full object-cover border border-white/10" />` : `<div class="w-8 h-8 rounded-full bg-ink-700 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">${initial}</div>`;
      return `<div class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition">${avatarHtml}<div class="flex flex-col"><span class="text-xs font-medium text-white leading-tight">${name}</span>${character ? `<span class="text-[10px] text-gray-400 leading-tight">sebagai ${character}</span>` : ''}</div></div>`;
    }).join('');
    modalCast.classList.remove('hidden');
  }

  async function openModal(movieId) {
    if (!movieId) return;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
    loadingOverlay.style.display = 'flex';
    $('#modalTitle').textContent = 'Memuat…';
    $('#modalCreator').textContent = '';
    $('#modalCategory').textContent = '';
    $('#modalDuration').textContent = '';
    $('#modalYear').textContent = '';
    $('#modalViews').textContent = '';
    $('#modalDescription').textContent = 'Mengambil detail dari backend…';
    $('#modalTags').innerHTML = '';
    modalSimilar.classList.add('hidden'); modalSimilarRow.innerHTML = '';
    modalCast.classList.add('hidden'); modalCastList.innerHTML = '';
    serverPicker.innerHTML = '';
    iframe.src = 'about:blank';

    try {
      const data = await fetchDetails(movieId);
      currentVideoInModal = data;
      $('#modalTitle').textContent = data.title || data.name || 'Untitled';
      $('#modalCreator').textContent = data.credits?.crew?.find(p => p.job === 'Director')?.name || '—';
      $('#modalCategory').textContent = (data.genres?.[0]?.name) || 'Film';
      $('#modalDuration').textContent = formatRuntime(data.runtime);
      $('#modalYear').textContent = formatYear(data.release_date);
      $('#modalViews').textContent = `${formatViews(data.vote_count)} suara`;
      $('#modalDescription').textContent = data.overview || 'Tidak ada deskripsi untuk film ini.';
      const tags = (data.genres || []).map(g => g.name);
      $('#modalTags').innerHTML = tags.map(t => `<span class="px-2.5 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/5">#${esc(t)}</span>`).join('');
      renderSimilar(data.similar);
      renderCast(data.credits);
      renderServerPicker();
      const defaultServer = SERVERS.find(s => s.recommended) || SERVERS[0];
      if (defaultServer) selectServer(defaultServer.id);
      loadingOverlay.style.display = 'none';
    } catch (err) {
      console.error(err);
      $('#modalTitle').textContent = 'Gagal memuat detail';
      $('#modalDescription').textContent = `Error: ${err.message}. Pastikan Go backend berjalan di :8080.`;
      loadingOverlay.style.display = 'none';
    }
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    modal.setAttribute('aria-hidden', 'true');
    iframe.src = 'about:blank';
    currentVideoInModal = null;
    currentServerId = null;
  }

  function renderServerPicker() {
    if (!currentVideoInModal) return;
    serverPicker.innerHTML = SERVERS.map(s => {
      const rec = s.recommended ? '<span class="ml-1 text-[10px] opacity-80">• rekomendasi</span>' : '';
      return `<button data-server-id="${esc(s.id)}" class="server-btn inline-flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm text-gray-200"><span class="flex items-center gap-2 font-semibold">${esc(s.name)}${rec}</span><span class="text-[11px] text-gray-400">${esc(s.quality)} • load ${intAttr(s.load)}%</span></button>`;
    }).join('');
    $$('#serverPicker .server-btn').forEach(btn => {
      btn.addEventListener('click', () => selectServer(btn.dataset.serverId));
    });
  }

  function selectServer(serverId) {
    if (!currentVideoInModal) return;
    const server = SERVERS.find(s => s.id === serverId);
    if (!server) return;
    currentServerId = serverId;
    $$('#serverPicker .server-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.serverId === serverId); });
    currentServerLabel.textContent = `Memutar dari ${server.name} (${server.quality})`;
    loadingOverlay.style.display = 'flex';
    const videoId = currentVideoInModal.id;
    const newUrl = buildServerUrl(server, videoId);
    setTimeout(() => {
      iframe.src = newUrl;
      iframe.onload = () => { loadingOverlay.style.display = 'none'; };
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 6000);
      showToast(`Beralih ke ${server.name}`);
    }, 200);
  }

  function bindCardClicks() {
    document.body.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (!card) return;
      const id = parseInt(card.dataset.videoId, 10);
      if (Number.isFinite(id)) openModal(id);
    });
    document.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.video-card');
      if (!card) return;
      e.preventDefault();
      const id = parseInt(card.dataset.videoId, 10);
      if (Number.isFinite(id)) openModal(id);
    });
    document.body.addEventListener('click', (e) => {
      if (e.target?.id === 'retryBtn') loadCategory(true);
    });
  }

  function bindHeader() {
    let raf = null;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { header.classList.toggle('scrolled', window.scrollY > 24); raf = null; });
    });
    menuBtn?.addEventListener('click', () => { document.getElementById('kategori').scrollIntoView({ behavior: 'smooth' }); });
  }

  function bindModal() {
    modalClose.addEventListener('click', closeModal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  }

  const SEARCH_DEBOUNCE_MS = 350;
  const SEARCH_MIN_CHARS = 2;
  let debounceTimer = null;

  const searchInput = $('#searchInput');
  const searchClear = $('#searchClear');
  const searchIndicator = $('#searchIndicator');
  const searchQueryLabel = $('#searchQueryLabel');
  const exitSearchBtn = $('#exitSearchBtn');

  function showSearchIndicator(query) {
    if (!searchIndicator) return;
    searchQueryLabel.textContent = `"${query}"`;
    searchIndicator.classList.remove('hidden');
    searchIndicator.classList.add('flex');
    if (filterChips) filterChips.classList.add('opacity-40', 'pointer-events-none');
  }

  function hideSearchIndicator() {
    if (!searchIndicator) return;
    searchIndicator.classList.add('hidden');
    searchIndicator.classList.remove('flex');
    if (filterChips) filterChips.classList.remove('opacity-40', 'pointer-events-none');
  }

  function enterSearch(query) {
    state.isSearching = true; state.searchQuery = query;
    state.page = 1; state.movies = [];
    showSearchIndicator(query);
    if (searchClear) searchClear.classList.remove('hidden');
    renderGrid(); loadCategory(true);
  }

  function exitSearch() {
    if (!state.isSearching && !state.searchQuery) return;
    state.isSearching = false; state.searchQuery = '';
    state.page = 1; state.movies = [];
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.classList.add('hidden');
    hideSearchIndicator();
    renderGrid(); loadCategory(true);
  }

  function handleSearchInput(value) {
    const trimmed = (value || '').trim();
    if (searchClear) searchClear.classList.toggle('hidden', trimmed.length === 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (trimmed.length === 0) exitSearch();
      else if (trimmed.length >= SEARCH_MIN_CHARS) enterSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  function bindSearch() {
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); clearTimeout(debounceTimer);
        const trimmed = (searchInput.value || '').trim();
        if (trimmed.length === 0) exitSearch();
        else if (trimmed.length >= SEARCH_MIN_CHARS) enterSearch(trimmed);
        searchInput.blur();
      } else if (e.key === 'Escape' && state.isSearching) exitSearch();
    });
    if (searchClear) searchClear.addEventListener('click', () => { searchInput.value = ''; searchClear.classList.add('hidden'); exitSearch(); searchInput.focus(); });
    if (exitSearchBtn) exitSearchBtn.addEventListener('click', exitSearch);
  }

  async function init() {
    renderFilters();
    renderGrid();
    renderLoadMore();
    bindCardClicks();
    bindHeader();
    bindModal();
    bindSearch();
    updateStats(); // populate categories count immediately (no fetch needed)
    try {
      await fetchConfig();
      renderCreators();
      updateStats(); // refresh with creators count
    } catch (e) {
      console.warn('Backend config failed, using defaults', e);
    }
    loadCategory(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

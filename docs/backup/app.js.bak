// Nobar — app.js (Vanilla JS, TMDB API)

(function () {
  'use strict';

  // KONFIGURASI
  //
  // ⚠ KEAMANAN: API_KEY di bawah adalah PLACEHOLDER. Ganti dengan TMDB API
  // key Anda sendiri secara lokal (jangan commit ke public repo).
  // Dapatkan di: https://www.themoviedb.org/settings/api
  //
  // ⚠ URL `https://example.org` di SERVERS.pattern juga placeholder. Ganti
  // dengan endpoint streaming Anda sendiri.
  // ---------------------------------------------------------------------------

  const API_KEY    = 'a3ce3ae3ddb29e9417ffcc2889becf9b';
  const TMDB_BASE  = 'https://api.themoviedb.org/3';
  const TMDB_IMG   = 'https://image.tmdb.org/t/p/w500';
  const TMDB_IMG_LG = 'https://image.tmdb.org/t/p/w780';
  const TMDB_IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

  const { SERVERS, CREATORS } = window.NOBAR_DATA;

  // Kategori = TMDB genre. 'trending' adalah special — pakai endpoint /trending.
  const CATEGORIES = [
    { id: 'trending', name: 'Trending',     tmdbGenreId: null },
    { id: 28,         name: 'Action',      tmdbGenreId: 28 },
    { id: 16,         name: 'Animation',   tmdbGenreId: 16 },
    { id: 35,         name: 'Comedy',      tmdbGenreId: 35 },
    { id: 18,         name: 'Drama',       tmdbGenreId: 18 },
    { id: 99,         name: 'Documentary', tmdbGenreId: 99 },
    { id: 27,         name: 'Horror',      tmdbGenreId: 27 },
    { id: 10749,      name: 'Romance',     tmdbGenreId: 10749 },
  ];

  // STATE
  const state = {
    activeCategory: 'trending',
    page: 1,
    totalPages: 1,
    movies: [],          // list of {id, title, poster_path, ...}
    featured: [],        // subset untuk row Trending (top 6)
    loading: false,
    loadingMore: false,
    error: null,
    // Search mode
    isSearching: false,
    searchQuery: '',
  };

  let currentVideoInModal = null;
  let currentServerId = null;
  let toastTimer = null;

  // ELEMENT REFERENCES
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const header      = document.getElementById('header');
  const menuBtn     = document.getElementById('menuBtn');
  const featuredRow = document.getElementById('featuredRow');
  const filterChips = document.getElementById('filterChips');
  const videoGrid   = document.getElementById('videoGrid');
  const creatorRow  = document.getElementById('creatorRow');
  const modal       = document.getElementById('videoModal');
  const modalClose  = document.getElementById('modalClose');
  const iframe      = document.getElementById('videoIframe');
  const loadingOverlay = document.getElementById('modalLoading');
  const toast      = document.getElementById('toast');
  const serverPicker = document.getElementById('serverPicker');
  const currentServerLabel = document.getElementById('currentServerLabel');
  // Similar + Cast elements
  const modalSimilar = document.getElementById('modalSimilar');
  const modalSimilarRow = document.getElementById('modalSimilarRow');
  const modalCast = document.getElementById('modalCast');
  const modalCastList = document.getElementById('modalCastList');

  // Container untuk tombol "Load More" + status pagination
  let loadMoreWrap = null;

  // UTIL
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
    if (!path) {
      // fallback placeholder
      return 'https://placehold.co/500x750/1c1c20/3a3a40?text=Nobar';
    }
    const base = size === 'lg' ? TMDB_IMG_LG : (size === 'original' ? TMDB_IMG_ORIGINAL : TMDB_IMG);
    return base + path;
  }

  function formatRuntime(minutes) {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
  }

  function formatYear(dateStr) {
    if (!dateStr) return '—';
    return String(dateStr).slice(0, 4);
  }

  function formatViews(count) {
    if (!count) return '—';
    if (count >= 1e9) return (count / 1e9).toFixed(1) + 'B';
    if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M';
    if (count >= 1e3) return (count / 1e3).toFixed(1) + 'k';
    return String(count);
  }

  // API: fetch helpers
  async function tmdbGet(path, params = {}) {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('language', 'id-ID');
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`TMDB ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  /** Fetch trending movies for the week. */
  async function fetchTrending(page = 1) {
    return tmdbGet('/trending/movie/week', { page });
  }

  /** Fetch movies by TMDB genre via /discover. */
  async function fetchByGenre(genreId, page = 1) {
    return tmdbGet('/discover/movie', {
      with_genres: genreId,
      page,
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    });
  }

  /**
   * Fetch movies by title query via /search.
   * Endpoint: /search/movie?query=QUERY&page=N&include_adult=false
   * Returns same shape as /discover: { page, results, total_pages, total_results }
   */
  async function searchMovies(query, page = 1) {
    return tmdbGet('/search/movie', {
      query,
      page,
      include_adult: false,
    });
  }

  /** Fetch movie detail (untuk modal). */
  async function fetchDetails(movieId) {
    return tmdbGet(`/movie/${movieId}`, {
      append_to_response: 'videos,credits,similar',
    });
  }

  /** Wrapper: ambil list sesuai kategori aktif. */
  async function fetchCategory(categoryId, page) {
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat) throw new Error('Kategori tidak dikenal');
    if (cat.tmdbGenreId === null) {
      return fetchTrending(page);
    }
    return fetchByGenre(cat.tmdbGenreId, page);
  }

  // RENDER: filter chips
  function renderFilters() {
    filterChips.innerHTML = CATEGORIES.map(cat => {
      const active = cat.id === state.activeCategory;
      return `
        <button data-category="${cat.id}"
          class="px-4 py-1.5 rounded-full text-sm font-medium border transition ${
            active
              ? 'bg-brand-500 border-brand-500 text-white'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
          }">
          ${cat.name}
        </button>`;
    }).join('');

    $$('#filterChips button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.loading) return;
        state.activeCategory = btn.dataset.category;
        state.page = 1;
        state.movies = [];
        renderFilters();
        renderGrid();
        loadCategory(true);
      });
    });
  }

  // RENDER: card
  function cardMarkup(movie, extraClass) {
    const id = movie.id;
    const title = movie.title || movie.name || 'Untitled';
    const poster = posterUrl(movie.poster_path);
    const year = formatYear(movie.release_date);
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
    const views = formatViews(movie.vote_count);
    const catName = (CATEGORIES.find(c => c.id === state.activeCategory) || {}).name || 'Film';

    return `
      <article class="video-card ${extraClass || ''} group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in"
               data-video-id="${id}"
               tabindex="0"
               role="button"
               aria-label="Buka ${title}">
        <div class="card-thumb relative aspect-video overflow-hidden bg-ink-800">
          <img src="${poster}" alt="${title}" loading="lazy"
               onerror="this.src='https://placehold.co/500x750/1c1c20/3a3a40?text=Nobar'"
               class="w-full h-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold">
            ${year} • ⭐ ${rating}
          </span>
          <span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-brand-500/90 text-[10px] font-bold uppercase tracking-wide">
            TMDB
          </span>
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

  // RENDER: featured row + grid + creators
  function renderFeatured() {
    if (!state.featured.length) {
      featuredRow.innerHTML = '';
      return;
    }
    featuredRow.innerHTML = state.featured.map(m => cardMarkup(m, 'featured-card')).join('');
  }

  function renderGrid() {
    if (state.loading && !state.movies.length) {
      videoGrid.innerHTML = renderSkeletonGrid(10);
      return;
    }
    if (state.error) {
      videoGrid.innerHTML = renderError(state.error);
      return;
    }
    if (!state.movies.length) {
      videoGrid.innerHTML = `<p class="col-span-full text-center text-gray-400 py-12">Tidak ada film untuk kategori ini.</p>`;
      return;
    }
    videoGrid.innerHTML = state.movies.map(m => cardMarkup(m)).join('');
  }

  function renderSkeletonGrid(n) {
    const items = Array.from({ length: n }, () => `
      <div class="rounded-lg overflow-hidden border border-white/5">
        <div class="skeleton aspect-video"></div>
        <div class="p-3 space-y-2">
          <div class="skeleton h-3 rounded w-3/4"></div>
          <div class="skeleton h-2 rounded w-1/2"></div>
        </div>
      </div>`).join('');
    return items;
  }

  function renderError(message) {
    return `
      <div class="col-span-full text-center py-12 px-4">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-500/15 text-brand-400 mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h3 class="font-semibold text-white">Gagal memuat film</h3>
        <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">${message}</p>
        <p class="text-xs text-gray-500 mt-3">
          Pastikan <code class="px-1 py-0.5 rounded bg-white/10">API_KEY</code> di <code class="px-1 py-0.5 rounded bg-white/10">js/app.js</code> sudah diganti dengan TMDB API key Anda.
        </p>
        <button id="retryBtn" class="mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded text-sm font-semibold">
          Coba lagi
        </button>
      </div>`;
  }

  function renderCreators() {
    creatorRow.innerHTML = CREATORS.map(c => `
      <div class="bg-ink-900 rounded-lg p-4 text-center border border-white/5 hover:border-white/20 transition">
        <img src="${c.avatar}" alt="${c.name}" loading="lazy"
             class="w-16 h-16 mx-auto rounded-full object-cover border-2 border-white/10" />
        <h4 class="mt-3 font-semibold text-sm">${c.name}</h4>
        <p class="text-xs text-gray-400">${c.role}</p>
      </div>
    `).join('');
  }

  // RENDER: load more button
  function ensureLoadMoreWrap() {
    if (loadMoreWrap) return loadMoreWrap;
    loadMoreWrap = document.createElement('div');
    loadMoreWrap.className = 'flex flex-col items-center gap-3 mt-8';
    videoGrid.parentNode.insertBefore(loadMoreWrap, videoGrid.nextSibling);
    return loadMoreWrap;
  }

  function renderLoadMore() {
    const wrap = ensureLoadMoreWrap();
    if (state.error || state.loading) {
      wrap.innerHTML = '';
      return;
    }
    if (state.page >= state.totalPages) {
      wrap.innerHTML = `<p class="text-xs text-gray-500">Sudah mencapai akhir daftar.</p>`;
      return;
    }
    wrap.innerHTML = `
      <button id="loadMoreBtn"
        class="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm font-semibold transition ${state.loadingMore ? 'opacity-60 cursor-wait' : ''}"
        ${state.loadingMore ? 'disabled' : ''}>
        ${state.loadingMore
          ? `<span class="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white mr-2 align-middle animate-spin"></span>Memuat…`
          : 'Muat Lebih Banyak'}
      </button>
      <p class="text-xs text-gray-500">Halaman ${state.page} dari ${state.totalPages}</p>`;
    const btn = $('#loadMoreBtn', wrap);
    if (btn) btn.addEventListener('click', () => loadCategory(false, true));
  }

  // LOAD: kategori aktif (initial atau load more)
  async function loadCategory(reset = false, append = false) {
    if (reset) {
      state.page = 1;
      state.movies = [];
    }
    const targetPage = append ? state.page + 1 : state.page;

    state.loading = !append;
    state.loadingMore = append;
    state.error = null;

    if (!append) renderGrid();
    renderLoadMore();

    try {
      // Mode-aware fetch: search vs kategori
      let data;
      if (state.isSearching) {
        data = await searchMovies(state.searchQuery, targetPage);
      } else {
        data = await fetchCategory(state.activeCategory, targetPage);
      }

      if (append) {
        // hindari duplikat
        const existingIds = new Set(state.movies.map(m => m.id));
        const fresh = (data.results || []).filter(m => !existingIds.has(m.id));
        state.movies = state.movies.concat(fresh);
        state.page = targetPage;
      } else {
        state.movies = data.results || [];
        state.page = data.page || 1;
        // Update featured row HANYA saat bukan search mode
        // (saat search, featured row biarkan tetap trending sebelumnya)
        if (!state.isSearching && state.activeCategory === 'trending') {
          state.featured = state.movies.slice(0, 6);
          renderFeatured();
        }
      }
      state.totalPages = data.total_pages || 1;
    } catch (err) {
      console.error(err);
      state.error = err.message || 'Gagal memuat data dari TMDB API.';
    } finally {
      state.loading = false;
      state.loadingMore = false;
      renderGrid();
      renderLoadMore();
    }
  }

  // MODAL: open / close
  // RENDER: Similar Movies + Cast List

  /** Render "Karya Terkait" — barisan kartu horizontal dari data.similar.results */
  function renderSimilar(similarData) {
    const results = (similarData && similarData.results) || [];
    if (!results.length) {
      modalSimilar.classList.add('hidden');
      modalSimilarRow.innerHTML = '';
      return;
    }

    // Ambil max 10 kartu
    const items = results.slice(0, 10);
    modalSimilarRow.innerHTML = items.map(m => {
      const poster = posterUrl(m.poster_path);
      const title = m.title || m.name || 'Untitled';
      const year = formatYear(m.release_date);
      const rating = m.vote_average ? m.vote_average.toFixed(1) : '—';
      return `
        <button class="similar-card group shrink-0 w-28 sm:w-32 text-left"
                data-movie-id="${m.id}"
                role="button"
                aria-label="Buka ${title}">
          <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-ink-800 border border-white/5 group-hover:border-brand-500/50 transition">
            <img src="${poster}" alt="${title}" loading="lazy"
                 onerror="this.src='https://placehold.co/200x300/1c1c20/3a3a40?text=No+Poster'"
                 class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
            <span class="absolute bottom-1.5 left-1.5 text-[10px] font-semibold text-white">⭐ ${rating}</span>
          </div>
          <h4 class="mt-1.5 text-xs font-medium text-gray-300 group-hover:text-white transition line-clamp-2 leading-tight">${title}</h4>
          <p class="text-[10px] text-gray-500">${year}</p>
        </button>`;
    }).join('');

    modalSimilar.classList.remove('hidden');

    // Bind click: re-open modal dengan movie baru (tanpa tutup modal utama)
    $$('#modalSimilarRow .similar-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const newId = parseInt(btn.dataset.movieId, 10);
        if (Number.isFinite(newId)) {
          // Refresh modal dengan video baru — modal tetap terbuka
          openModal(newId);
          // Scroll ke atas modal untuk lihat player baru
          modal.querySelector('.modal-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  /** Render "Daftar Tim & Kreator" — badge list dari data.credits.cast (top 8) */
  function renderCast(creditsData) {
    const cast = (creditsData && creditsData.cast) || [];
    if (!cast.length) {
      modalCast.classList.add('hidden');
      modalCastList.innerHTML = '';
      return;
    }

    // Ambil top 8 aktor
    const topCast = cast.slice(0, 8);
    modalCastList.innerHTML = topCast.map(p => {
      const name = p.name || 'Unknown';
      const character = p.character || '';
      const avatar = p.profile_path ? posterUrl(p.profile_path) : null;

      const avatarHtml = avatar
        ? `<img src="${avatar}" alt="${name}" loading="lazy"
               onerror="this.src='https://placehold.co/100x100/1c1c20/3a3a40?text=${encodeURIComponent(name.charAt(0))}'"
               class="w-8 h-8 rounded-full object-cover border border-white/10" />`
        : `<div class="w-8 h-8 rounded-full bg-ink-700 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400">${name.charAt(0)}</div>`;

      return `
        <div class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/20 transition">
          ${avatarHtml}
          <div class="flex flex-col">
            <span class="text-xs font-medium text-white leading-tight">${name}</span>
            ${character ? `<span class="text-[10px] text-gray-400 leading-tight">sebagai ${character}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    modalCast.classList.remove('hidden');
  }

  // MODAL: open / close
  async function openModal(movieId) {
    if (!movieId) return;

    // Buka modal dulu dengan state loading (UX lebih responsif)
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');
    loadingOverlay.style.display = 'flex';

    // Reset konten modal
    $('#modalTitle').textContent = 'Memuat…';
    $('#modalCreator').textContent = '';
    $('#modalCategory').textContent = '';
    $('#modalDuration').textContent = '';
    $('#modalYear').textContent = '';
    $('#modalViews').textContent = '';
    $('#modalDescription').textContent = 'Mengambil detail dari TMDB…';
    $('#modalTags').innerHTML = '';
    modalSimilar.classList.add('hidden');
    modalSimilarRow.innerHTML = '';
    modalCast.classList.add('hidden');
    modalCastList.innerHTML = '';
    serverPicker.innerHTML = '';

    iframe.src = 'about:blank';

    try {
      const data = await fetchDetails(movieId);
      currentVideoInModal = data;

      // Isi konten
      $('#modalTitle').textContent = data.title || data.name || 'Untitled';
      $('#modalCreator').textContent = data.credits?.crew?.find(p => p.job === 'Director')?.name || '—';
      $('#modalCategory').textContent = (data.genres?.[0]?.name) || 'Film';
      $('#modalDuration').textContent = formatRuntime(data.runtime);
      $('#modalYear').textContent = formatYear(data.release_date);
      $('#modalViews').textContent = `${formatViews(data.vote_count)} suara`;
      $('#modalDescription').textContent = data.overview || 'Tidak ada deskripsi untuk film ini.';

      // Tags
      const tags = (data.genres || []).map(g => g.name);
      $('#modalTags').innerHTML = tags.map(t => `
        <span class="px-2.5 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/5">#${t}</span>
      `).join('');

      // Render Karya Terkait (Similar Movies)
      renderSimilar(data.similar);

      // Render Daftar Tim & Kreator (Cast List)
      renderCast(data.credits);

      renderServerPicker();

      // Pilih server default (recommended, fallback ke pertama)
      const defaultServer = SERVERS.find(s => s.recommended) || SERVERS[0];
      selectServer(defaultServer.id);

      loadingOverlay.style.display = 'none';
    } catch (err) {
      console.error(err);
      $('#modalTitle').textContent = 'Gagal memuat detail';
      $('#modalDescription').textContent = `Error: ${err.message}. Pastikan API_KEY sudah benar.`;
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

  // SERVER PICKER
  function renderServerPicker() {
    if (!currentVideoInModal) return;
    serverPicker.innerHTML = SERVERS.map(s => {
      const isRecommended = s.recommended ? '<span class="ml-1 text-[10px] opacity-80">• rekomendasi</span>' : '';
      return `
        <button data-server-id="${s.id}"
                class="server-btn inline-flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm text-gray-200">
          <span class="flex items-center gap-2 font-semibold">
            ${s.name}${isRecommended}
          </span>
          <span class="text-[11px] text-gray-400">
            ${s.quality} • load ${s.load}%
          </span>
        </button>`;
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
    $$('#serverPicker .server-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.serverId === serverId);
    });

    currentServerLabel.textContent = `Memutar dari ${server.name} (${server.quality})`;

    loadingOverlay.style.display = 'flex';

    // video_id = TMDB movie ID (integer, mis. 550)
    const videoId = currentVideoInModal.id;
    const newUrl = buildServerUrl(server, videoId);

    setTimeout(() => {
      iframe.src = newUrl;
      iframe.onload = () => { loadingOverlay.style.display = 'none'; };
      // Safety: iframe onLoad tidak selalu dipanggil untuk cross-origin
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 6000);
      showToast(`Beralih ke ${server.name}`);
    }, 200);
  }

  // EVENT BINDINGS
  function bindCardClicks() {
    document.body.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (!card) return;
      const id = parseInt(card.dataset.videoId, 10);
      if (!Number.isFinite(id)) return;
      openModal(id);
    });

    document.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.video-card');
      if (!card) return;
      e.preventDefault();
      const id = parseInt(card.dataset.videoId, 10);
      if (Number.isFinite(id)) openModal(id);
    });

    // retry button (event delegation — element dirender ulang tiap error)
    document.body.addEventListener('click', (e) => {
      if (e.target?.id === 'retryBtn') {
        loadCategory(true);
      }
    });
  }

  function bindHeader() {
    let raf = null;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        header.classList.toggle('scrolled', window.scrollY > 24);
        raf = null;
      });
    });

    menuBtn?.addEventListener('click', () => {
      document.getElementById('kategori').scrollIntoView({ behavior: 'smooth' });
    });
  }

  function bindModal() {
    modalClose.addEventListener('click', closeModal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  // SEARCH
  // Debounce config
  const SEARCH_DEBOUNCE_MS = 350;
  const SEARCH_MIN_CHARS = 2;
  let debounceTimer = null;

  // Element references untuk search
  const searchInput      = document.getElementById('searchInput');
  const searchClear      = document.getElementById('searchClear');
  const searchIndicator  = document.getElementById('searchIndicator');
  const searchQueryLabel = document.getElementById('searchQueryLabel');
  const exitSearchBtn    = document.getElementById('exitSearchBtn');

  function showSearchIndicator(query) {
    if (!searchIndicator) return;
    searchQueryLabel.textContent = `"${query}"`;
    searchIndicator.classList.remove('hidden');
    searchIndicator.classList.add('flex');
    // Dim filter chips supaya user tahu search override kategori
    if (filterChips) filterChips.classList.add('opacity-40', 'pointer-events-none');
  }

  function hideSearchIndicator() {
    if (!searchIndicator) return;
    searchIndicator.classList.add('hidden');
    searchIndicator.classList.remove('flex');
    if (filterChips) filterChips.classList.remove('opacity-40', 'pointer-events-none');
  }

  function enterSearch(query) {
    state.isSearching = true;
    state.searchQuery = query;
    state.page = 1;
    state.movies = [];
    showSearchIndicator(query);
    if (searchClear) searchClear.classList.remove('hidden');
    renderGrid();
    loadCategory(true);
  }

  function exitSearch() {
    if (!state.isSearching && !state.searchQuery) return;
    state.isSearching = false;
    state.searchQuery = '';
    state.page = 1;
    state.movies = [];
    if (searchInput) searchInput.value = '';
    if (searchClear) searchClear.classList.add('hidden');
    hideSearchIndicator();
    renderGrid();
    loadCategory(true);
  }

  function handleSearchInput(value) {
    const trimmed = (value || '').trim();
    // Toggle tombol clear
    if (searchClear) searchClear.classList.toggle('hidden', trimmed.length === 0);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (trimmed.length === 0) {
        exitSearch();
      } else if (trimmed.length >= SEARCH_MIN_CHARS) {
        enterSearch(trimmed);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function bindSearch() {
    if (!searchInput) return;
    // Input event (debounced)
    searchInput.addEventListener('input', (e) => {
      handleSearchInput(e.target.value);
    });
    // Enter = immediate search (skip debounce)
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(debounceTimer);
        const trimmed = (searchInput.value || '').trim();
        if (trimmed.length === 0) {
          exitSearch();
        } else if (trimmed.length >= SEARCH_MIN_CHARS) {
          enterSearch(trimmed);
        }
        searchInput.blur();
      } else if (e.key === 'Escape' && state.isSearching) {
        exitSearch();
      }
    });
    // Tombol X di kanan input
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        exitSearch();
        searchInput.focus();
      });
    }
    // Tombol 'Hapus' di banner indicator
    if (exitSearchBtn) {
      exitSearchBtn.addEventListener('click', exitSearch);
    }
  }

  // INIT
  function init() {
    renderFilters();
    renderCreators();
    renderGrid();
    renderLoadMore();
    bindCardClicks();
    bindHeader();
    bindModal();
    bindSearch();
    // Load initial trending
    loadCategory(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

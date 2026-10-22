/* ==========================================================================
   Nobar — Application logic (Vanilla JavaScript)
   Fitur utama:
   1. Render grid kartu video per kategori + filter chip
   2. Open/close modal detail video
   3. Multi-server source picker — swap src <iframe> berdasarkan video_id
   ========================================================================== */

(function () {
  'use strict';

  const { SERVERS, VIDEOS, CREATORS, CATEGORIES } = window.NOBAR_DATA;

  // ---- Element references ----
  const featuredRow = document.getElementById('featuredRow');
  const filterChips = document.getElementById('filterChips');
  const videoGrid   = document.getElementById('videoGrid');
  const creatorRow  = document.getElementById('creatorRow');
  const header      = document.getElementById('header');
  const menuBtn     = document.getElementById('menuBtn');
  const modal       = document.getElementById('videoModal');
  const modalClose  = document.getElementById('modalClose');
  const iframe      = document.getElementById('videoIframe');
  const loadingOverlay = document.getElementById('modalLoading');
  const toast      = document.getElementById('toast');
  const serverPicker = document.getElementById('serverPicker');
  const currentServerLabel = document.getElementById('currentServerLabel');

  let activeFilter = 'Semua';
  let currentVideo = null;
  let currentServerId = null;
  let toastTimer = null;

  // =========================================================================
  // UTIL
  // =========================================================================
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast-show'), 2200);
  }

  function buildServerUrl(server, video) {
    return server.pattern.replace('{video_id}', encodeURIComponent(video.video_id));
  }

  // =========================================================================
  // RENDER: Filter chips
  // =========================================================================
  function renderFilters() {
    filterChips.innerHTML = CATEGORIES.map(cat => {
      const active = cat === activeFilter;
      return `
        <button data-filter="${cat}"
          class="px-4 py-1.5 rounded-full text-sm font-medium border transition ${
            active
              ? 'bg-brand-500 border-brand-500 text-white'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
          }">
          ${cat}
        </button>`;
    }).join('');

    $$('#filterChips button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        renderFilters();
        renderGrid();
      });
    });
  }

  // =========================================================================
  // RENDER: Card helpers
  // =========================================================================
  function cardMarkup(video, extraClass) {
    return `
      <article class="video-card ${extraClass || ''} group bg-ink-900 rounded-lg overflow-hidden border border-white/5 hover:border-white/20 fade-in"
               data-video-id="${video.video_id}"
               tabindex="0"
               role="button"
               aria-label="Buka ${video.title}">
        <div class="card-thumb relative aspect-video overflow-hidden bg-ink-800">
          <img src="${video.cover}" alt="${video.title}" loading="lazy"
               class="w-full h-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-semibold uppercase tracking-wide">
            ${video.duration}
          </span>
          <div class="card-play absolute inset-0 flex items-center justify-center">
            <div class="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-xl">
              <svg viewBox="0 0 24 24" fill="white" class="w-6 h-6 ml-0.5"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
          ${video.featured ? `<span class="absolute top-2 left-2 px-2 py-0.5 rounded bg-brand-500 text-[10px] font-bold uppercase tracking-wide">Featured</span>` : ''}
        </div>
        <div class="p-3">
          <h3 class="font-display text-sm font-bold leading-snug line-clamp-2">${video.title}</h3>
          <p class="mt-1 text-xs text-gray-400 line-clamp-1">${video.creator}</p>
          <div class="mt-2 flex items-center justify-between text-[11px] text-gray-500">
            <span>${video.category}</span>
            <span>${video.views} ditonton</span>
          </div>
        </div>
      </article>`;
  }

  // =========================================================================
  // RENDER: Featured row + Grid + Creators
  // =========================================================================
  function renderFeatured() {
    const items = VIDEOS.filter(v => v.featured);
    featuredRow.innerHTML = items.map(v => cardMarkup(v, 'featured-card')).join('');
  }

  function renderGrid() {
    const list = activeFilter === 'Semua'
      ? VIDEOS
      : VIDEOS.filter(v => v.category === activeFilter);
    videoGrid.innerHTML = list.map(v => cardMarkup(v)).join('');
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

  // =========================================================================
  // MODAL: Open / Close
  // =========================================================================
  function openModal(videoId) {
    const video = VIDEOS.find(v => v.video_id === videoId);
    if (!video) return;
    currentVideo = video;

    // Isi konten modal
    $('#modalTitle').textContent = video.title;
    $('#modalCreator').textContent = video.creator;
    $('#modalCategory').textContent = video.category;
    $('#modalDuration').textContent = video.duration;
    $('#modalYear').textContent = video.year;
    $('#modalViews').textContent = `${video.views} ditonton`;
    $('#modalDescription').textContent = video.description;

    // Tags
    $('#modalTags').innerHTML = video.tags.map(t => `
      <span class="px-2.5 py-1 rounded bg-white/5 text-xs text-gray-300 border border-white/5">#${t}</span>
    `).join('');

    // Render server picker
    renderServerPicker();

    // Pilih server default = yang recommended, fallback ke pertama
    const defaultServer = SERVERS.find(s => s.recommended) || SERVERS[0];
    selectServer(defaultServer.id);

    // Buka modal
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    modal.setAttribute('aria-hidden', 'false');

    // Focus trap awal
    setTimeout(() => modalClose.focus(), 50);
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
    modal.setAttribute('aria-hidden', 'true');

    // Hentikan pemutaran dengan reset src
    iframe.src = 'about:blank';
    currentVideo = null;
    currentServerId = null;
  }

  // =========================================================================
  // SERVER PICKER
  // =========================================================================
  function renderServerPicker() {
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
    if (!currentVideo) return;
    const server = SERVERS.find(s => s.id === serverId);
    if (!server) return;

    currentServerId = serverId;

    // Update tombol aktif
    $$('#serverPicker .server-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.serverId === serverId);
    });

    // Update label
    currentServerLabel.textContent = `Memutar dari ${server.name} (${server.quality})`;

    // Tampilkan loading overlay
    loadingOverlay.style.display = 'flex';

    // Bangun URL baru dan swap src iframe
    const newUrl = buildServerUrl(server, currentVideo);
    // Beri sedikit jeda agar loading terlihat natural
    setTimeout(() => {
      iframe.src = newUrl;
      iframe.onload = () => {
        loadingOverlay.style.display = 'none';
      };
      // Safety: sembunyikan loading setelah max 6 detik (iframe onLoad tidak selalu dipanggil untuk cross-origin)
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, 6000);
      showToast(`Beralih ke ${server.name}`);
    }, 200);
  }

  // =========================================================================
  // EVENTS: Card click delegation
  // =========================================================================
  function bindCardClicks() {
    document.body.addEventListener('click', (e) => {
      const card = e.target.closest('.video-card');
      if (!card) return;
      openModal(card.dataset.videoId);
    });

    // Keyboard a11y
    document.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.video-card');
      if (!card) return;
      e.preventDefault();
      openModal(card.dataset.videoId);
    });
  }

  // =========================================================================
  // EVENTS: Header scroll, menu, modal close
  // =========================================================================
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
      // Untuk demo: toggle filter section scroll
      document.getElementById('kategori').scrollIntoView({ behavior: 'smooth' });
    });
  }

  function bindModal() {
    modalClose.addEventListener('click', closeModal);
    // Click di backdrop (di luar panel) → tutup
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  // =========================================================================
  // INIT
  // =========================================================================
  function init() {
    renderFilters();
    renderFeatured();
    renderGrid();
    renderCreators();
    bindCardClicks();
    bindHeader();
    bindModal();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

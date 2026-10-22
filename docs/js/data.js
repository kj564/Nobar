/* ==========================================================================
   Nobar — Konfigurasi statis (SERVERS untuk source picker + sample kreator)
   Data katalog film TIDAK lagi hardcoded di sini — di-fetch dari TMDB API
   oleh js/app.js saat halaman dimuat.
   ========================================================================== */

window.NOBAR_DATA = (function () {
  /**
   * Konfigurasi server untuk source picker di modal.
   *
   * Pattern menggunakan placeholder `{video_id}` yang akan di-replace dengan
   * TMDB movie ID (integer, misalnya 550 untuk Fight Club) saat user klik
   * tombol server.
   *
   * ⚠ URL `https://example.org` adalah placeholder. Ganti dengan endpoint
   * streaming Anda sendiri secara lokal (jangan commit URL asli ke repo publik).
   *
   * Contoh real-world (jangan commit ke repo public):
   *   { name: 'Server Utama',    pattern: 'https://cdn.nobar.id/watch/{video_id}' }
   *   { name: 'Server Cadangan', pattern: 'https://backup.nobar.id/embed/{video_id}' }
   */
  const SERVERS = [
    {
      id: 'utama',
      name: 'Server Utama',
      pattern: 'https://example.org/{video_id}',
      quality: '1080p',
      load: 70,
      recommended: true,
    },
    {
      id: 'cadangan',
      name: 'Server Cadangan',
      pattern: 'https://example.org/{video_id}',
      quality: '720p',
      load: 35,
      recommended: false,
    },
    {
      id: 'mirror',
      name: 'Mirror 3',
      pattern: 'https://example.org/{video_id}',
      quality: '480p',
      load: 20,
      recommended: false,
    },
  ];

  // Sample kreator untuk section "Kreator Pilihan" (static, decorative).
  // Di dunia nyata, ini juga bisa di-fetch dari /person/popular TMDB.
  const CREATORS = [
    { name: 'Aisyah Putri',    role: 'Dokumenter',       avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80' },
    { name: 'Bayu Mahendra',   role: 'Musisi',           avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc664aec0?auto=format&fit=crop&w=200&q=80' },
    { name: 'Koli Animation', role: 'Studio Animasi',   avatar: 'https://images.unsplash.com/photo-1611162616475-46b9b41f9f9b?auto=format&fit=crop&w=200&q=80' },
    { name: 'Reza Pamungkas',  role: 'Sineas',           avatar: 'https://images.unsplash.com/photo-1507003181164-6e864c1e1f77?auto=format&fit=crop&w=200&q=80' },
    { name: 'Lintas Pantura',  role: 'Kolektif',         avatar: 'https://images.unsplash.com/photo-1502685104226-ee32379f9f7f?auto=format&fit=crop&w=200&q=80' },
    { name: 'Devi Anjani',     role: 'Sineas',           avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d35?auto=format&fit=crop&w=200&q=80' },
  ];

  return { SERVERS, CREATORS };
})();

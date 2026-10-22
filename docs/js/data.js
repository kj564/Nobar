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
   */
  const SERVERS = [
    {
      id: 'utama',
      name: 'Server 1 (HD)',
      pattern: 'https://vidsrc.to{video_id}', // ← PERBAIKAN: Sub-path ditambahkan dengan benar
      quality: '1080p',
      load: 32,
      recommended: true
    },
    {
      id: 'cadangan',
      name: 'Server 2 (Fast)',
      pattern: 'https://vidsrc.sh{video_id}', // ← PERBAIKAN: Sub-path ditambahkan dengan benar
      quality: '720p',
      load: 15,
      recommended: false
    }
  ];

  // Sample kreator untuk section "Kreator Pilihan" (static, decorative).
  const CREATORS = [
    { name: 'Aisyah Putri',    role: 'Dokumenter',       avatar: 'https://unsplash.com' },
    { name: 'Bayu Mahendra',   role: 'Musisi',           avatar: 'https://unsplash.com' },
    { name: 'Koli Animation', role: 'Studio Animasi',   avatar: 'https://unsplash.com' },
    { name: 'Reza Pamungkas',  role: 'Sineas',           avatar: 'https://unsplash.com' },
    { name: 'Lintas Pantura',  role: 'Kolektif',         avatar: 'https://unsplash.com' },
    { name: 'Devi Anjani',     role: 'Sineas',           avatar: 'https://unsplash.com' },
  ];

  return { SERVERS, CREATORS };
})();

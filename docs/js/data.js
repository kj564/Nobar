/* ==========================================================================
   Nobar — Sample data untuk Indie Cinema & Video Portfolio Platform
   Semua thumbnail diambil dari Unsplash (royalty-free).
   URL video adalah placeholder — ganti dengan storage Anda sendiri.
   ========================================================================== */

window.NOBAR_DATA = (function () {
  /**
   * Konfigurasi server.
   * Setiap video punya `video_id` yang akan digabungkan dengan `pattern` di sini.
   * Pattern menggunakan placeholder `{video_id}` yang akan di-replace oleh app.js.
   *
   * CONTOH real-world (ganti dengan storage Anda):
   *   { name: 'Server Utama',   pattern: 'https://cdn.nobar.id/watch/{video_id}' }
   *   { name: 'Server Cadangan', pattern: 'https://backup.nobar.id/embed/{video_id}' }
   *   { name: 'Mirror 3',        pattern: 'https://drive.google.com/file/d/{video_id}/preview' }
   */
  const SERVERS = [
    {
      id: 'utama',
      name: 'Server Utama',
      pattern: 'https://example.com/{video_id}',
      quality: '1080p',
      load: 70,
      recommended: true,
    },
    {
      id: 'cadangan',
      name: 'Server Cadangan',
      pattern: 'https://example.com/{video_id}',
      quality: '720p',
      load: 35,
      recommended: false,
    },
    {
      id: 'mirror',
      name: 'Mirror 3',
      pattern: 'https://example.com/{video_id}',
      quality: '480p',
      load: 20,
      recommended: false,
    },
  ];

  // Sample karya video indie (10 item, 4 kategori)
  const VIDEOS = [
    {
      video_id: 'dok-jakarta-night-bus',
      title: 'Bus Malam Jakarta',
      creator: 'Sineas — Aisyah Putri',
      category: 'Dokumenter',
      year: 2025,
      duration: '12 mnt',
      views: '4.2k',
      tags: ['urban', 'malam hari', 'jakarta', 'observational'],
      cover: 'https://images.unsplash.com/photo-1574649895832-b4372e3c4a4c?auto=format&fit=crop&w=800&q=80',
      description:
        'Sebuah perjalanan diam bersama sopir Bus Malam Jakarta. Kamera diam, lampu jalan berkedip, ' +
        'dan percakapan singkat dengan penumpang yang tidak pulang. Sebuah esai visual tentang kota yang ' +
        'tidak pernah benar-benar tertidur, dan manusia-manusia yang berusaha tetap terjaga di dalamnya.',
      featured: true,
    },
    {
      video_id: 'musik-hujan-tanpa-nada',
      title: 'Hujan Tanpa Nada',
      creator: 'Kreator — Bayu Mahendra',
      category: 'Video Musik',
      year: 2025,
      duration: '4 mnt',
      views: '9.8k',
      tags: ['ambient', 'eksperimental', 'musik indie', 'bandung'],
      cover: 'https://images.unsplash.com/photo-1511670154032-9e3d5664c4e3?auto=format&fit=crop&w=800&q=80',
      description:
        'Lagu pembuka dari EP debut Bayu Mahendra. Difilmkan dalam satu take tanpa edit di sebuah atap ' +
        'kosong saat hujan turun. Suara air dan gitar akustik berpadu menjadi tekstur utama, sementara ' +
        'kamera bergerak lambat mengikuti gerakan awan di langit Bandung.',
      featured: true,
    },
    {
      video_id: 'anim-mekanik-kertas',
      title: 'Mekanik Kertas',
      creator: 'Studio — Koli Animation',
      category: 'Animasi',
      year: 2024,
      duration: '6 mnt',
      views: '15.3k',
      tags: ['stop motion', 'kertas', 'craft', 'yogyakarta'],
      cover: 'https://images.unsplash.com/photo-1503028136809-3adb25b3a13b?auto=format&fit=crop&w=800&q=80',
      description:
        'Stop-motion pendek tentang seorang mekanik kertas yang harus memperbaiki mesin roda gigi ' +
        'yang terbuat dari lipatan. Dibuat selama 9 bulan oleh tiga animator di Yogyakarta, menggunakan ' +
        'lebih dari 4.000 potong kertas yang dipotong dan difoto manual.',
      featured: true,
    },
    {
      video_id: 'cerpem-warung-pojok',
      title: 'Warung Pojok',
      creator: 'Sineas — Reza Pamungkas',
      category: 'Cerita Pendek',
      year: 2025,
      duration: '18 mnt',
      views: '6.1k',
      tags: ['slice of life', 'drama', 'surabaya'],
      cover: 'https://images.unsplash.com/photo-1559329007-408d3d49c917?auto=format&fit=crop&w=800&q=80',
      description:
        'Setiap sore, Pak Suhardi membuka warungnya. Pelanggan datang, pergi, dan kadang tidak ' +
        'membeli apa pun. Sebuah cerita pendek yang sabar — menangkap ritme kecil sebuah warung ' +
        'sudut di Surabaya, dan percakapan-percakapan yang terjadi di dalamnya.',
      featured: false,
    },
    {
      video_id: 'dok-petani-garam',
      title: 'Petani Garam Madura',
      creator: 'Kolektif — Lintas Pantura',
      category: 'Dokumenter',
      year: 2024,
      duration: '22 mnt',
      views: '3.5k',
      tags: ['madura', 'petani', 'lingkungan', 'pantura'],
      cover: 'https://images.unsplash.com/photo-1606167668628-787fc2e7d3ab?auto=format&fit=crop&w=800&q=80',
      description:
        'Dokumenter pendek yang mengikuti tiga petani garam di pesisir Madura selama musim kemarau. ' +
        'Mereka berbagi tentang perubahan iklim, harga garam yang tak menentu, dan kenapa generasi ' +
        'muda enggan melanjutkan profesi ini.',
      featured: false,
    },
    {
      video_id: 'musik-angin-pantai',
      title: 'Angin dari Selatan',
      creator: 'Band — Sisir Daun',
      category: 'Video Musik',
      year: 2025,
      duration: '3 mnt',
      views: '11.7k',
      tags: ['indie pop', 'pantai', ' vidéoklip', 'bali'],
      cover: 'https://images.unsplash.com/photo-1507525229340-065b8d8ee586?auto=format&fit=crop&w=800&q=80',
      description:
        'Videoklip kedua dari Sisir Daun. Difilmkan di sebuah pantai tersembunyi di Bali dengan ' +
        'kamera 16mm. Tidak ada efek digital, hanya sinar matahari, air, dan tarian yang mengikuti ' +
        'tempo lagu.',
      featured: false,
    },
    {
      video_id: 'anim-pohon-berbicara',
      title: 'Pohon yang Berbicara',
      creator: 'Studio — Muara Animasi',
      category: 'Animasi',
      year: 2025,
      duration: '8 mnt',
      views: '7.9k',
      tags: ['2d animation', 'cerita rakyat', 'anak', 'kalimantan'],
      cover: 'https://images.unsplash.com/photo-1518156677183-6fea403c4e9e?auto=format&fit=crop&w=800&q=80',
      description:
        'Animasi 2D yang diadaptasi dari cerita rakyat Kalimantan tentang pohon tua yang bisa ' +
        'berbicara pada anak-anak yang tersesat. Dirancang untuk penonton muda, dengan musik ' +
        'gamelan elektronik yang dibuat khusus untuk film ini.',
      featured: false,
    },
    {
      video_id: 'cerpem-surat-terakhir',
      title: 'Surat Terakhir',
      creator: 'Sineas — Devi Anjani',
      category: 'Cerita Pendek',
      year: 2024,
      duration: '14 mnt',
      views: '5.4k',
      tags: ['drama', 'surat', 'keluarga', 'fiktif'],
      cover: 'https://images.unsplash.com/photo-1494256994602-777c8c5bda7c?auto=format&fit=crop&w=800&q=80',
      description:
        'Seorang perempuan muda menemukan surat dari ayahnya yang sudah meninggal lima tahun lalu. ' +
        'Film pendek yang diceritakan dalam tiga lapis waktu, dengan suara voice-over yang menjadi ' +
        'tulang punggung naratifnya.',
      featured: false,
    },
    {
      video_id: 'dok-sma-senja',
      title: 'Senja di SMA',
      creator: 'Sineas — Galih Pratama',
      category: 'Dokumenter',
      year: 2025,
      duration: '9 mnt',
      views: '2.8k',
      tags: ['remaja', 'sekolah', 'observational', 'solo'],
      cover: 'https://images.unsplash.com/photo-1523240795612-9a0549339c2e?auto=format&fit=crop&w=800&q=80',
      description:
        'Sebuah dokumenter pendek yang direkam solo selama satu minggu di sebuah SMA di Solo. ' +
        'Tanpa wawancara — kamera hanya mengikuti siswa-siswi yang menunggu jemputan, bermain bola ' +
        'di lapangan, dan berbisik di pojok koridor menjelang senja.',
      featured: false,
    },
    {
      video_id: 'anim-senandung-malam',
      title: 'Senandung Malam',
      creator: 'Studio — Cahaya Frame',
      category: 'Animasi',
      year: 2024,
      duration: '5 mnt',
      views: '8.2k',
      tags: ['2d', 'musik', 'malam', 'eksperimental'],
      cover: 'https://images.unsplash.com/photo-1518709268805-4e6d4e8b2c4f?auto=format&fit=crop&w=800&q=80',
      description:
        'Sebuah animasi musikal tanpa dialog — gambar bergerak mengikuti melodi piano yang dibuat ' +
        'khusus oleh komposer indie. Setiap frame dilukis dengan tangan, memberi tekstur yang tidak ' +
        'mungkin didapat dari animasi digital murni.',
      featured: false,
    },
  ];

  // Sample kreator
  const CREATORS = [
    { name: 'Aisyah Putri',   role: 'Dokumenter',   avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80' },
    { name: 'Bayu Mahendra',  role: 'Musisi',       avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc664aec0?auto=format&fit=crop&w=200&q=80' },
    { name: 'Koli Animation', role: 'Studio Animasi', avatar: 'https://images.unsplash.com/photo-1611162616475-46b9b41f9f9b?auto=format&fit=crop&w=200&q=80' },
    { name: 'Reza Pamungkas', role: 'Sineas',       avatar: 'https://images.unsplash.com/photo-1507003181164-6e864c1e1f77?auto=format&fit=crop&w=200&q=80' },
    { name: 'Lintas Pantura', role: 'Kolektif',     avatar: 'https://images.unsplash.com/photo-1502685104226-ee32379f0491?auto=format&fit=crop&w=200&q=80' },
    { name: 'Devi Anjani',    role: 'Sineas',       avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d35?auto=format&fit=crop&w=200&q=80' },
  ];

  return {
    SERVERS,
    VIDEOS,
    CREATORS,
    CATEGORIES: ['Semua', 'Dokumenter', 'Cerita Pendek', 'Video Musik', 'Animasi'],
  };
})();

# Nobar — Indie Cinema & Video Portfolio Platform

Proyek pembelajaran web development: halaman portofolio video pendek dari kreator lokal Indonesia, dengan desain dark mode (gaya Netflix) dan sistem multi-server source picker untuk load balancing.

## Tech Stack

- **HTML5** — struktur semantik
- **Tailwind CSS** (via CDN) — utility-first styling
- **Vanilla JavaScript** (ES6) — tanpa framework
- **Google Fonts** — Inter + Plus Jakarta Sans

## Fitur Utama

### 1. Halaman Utama + Modal Detail
- Grid kartu video per kategori, dengan filter chip (`Semua / Dokumenter / Cerita Pendek / Video Musik / Animasi`)
- Klik kartu → buka modal dengan:
  - `<iframe>` video player
  - Detail (judul, kreator, kategori, durasi, tahun, views, deskripsi, tags)
  - Tombol aksi (Favorit, Bagikan)

### 2. Multi-Server Source Picker (Load Balancing)
Setiap video punya `video_id` unik. Tombol server di bawah player akan menukar `src` dari `<iframe>` otomatis mengikuti pattern URL:

```js
// js/data.js
const SERVERS = [
  { id: 'utama',    name: 'Server Utama',    pattern: 'https://example.com/{video_id}', ... },
  { id: 'cadangan', name: 'Server Cadangan', pattern: 'https://example.com/{video_id}', ... },
  { id: 'mirror',   name: 'Mirror 3',        pattern: 'https://example.com/{video_id}', ... },
];
```

Pattern memakai placeholder `{video_id}` yang akan di-replace dengan `video.video_id` saat tombol server diklik.

**Cara ganti ke storage asli Anda:**
1. Buka `js/data.js`
2. Ganti `pattern` di array `SERVERS` dengan URL storage Anda (Google Drive, Backblaze, Wasabi, dll.)
3. Untuk Google Drive embed, gunakan: `https://drive.google.com/file/d/{video_id}/preview`
4. Untuk Mux/Cloudflare Stream, ganti ke endpoint mereka

## Struktur Folder

```
Nobar/
├── index.html          # Struktur halaman utama + modal
├── css/
│   └── styles.css      # Custom styles (scrollbar, animasi modal, server btn)
├── js/
│   ├── data.js         # Sample video data + konfigurasi server
│   └── app.js          # Logika render, modal, source picker
└── README.md
```

## Cara Menjalankan

Karena ini proyek statis, cukup buka `index.html` di browser. Untuk pengembangan yang lebih nyaman:

```bash
# Opsi 1: Python built-in
python3 -m http.server 8000

# Opsi 2: Node.js (live-server)
npx live-server
```

Lalu buka `http://localhost:8000` (atau port yang ditampilkan).

## Customization

### Tambah Video Baru
Edit `js/data.js` → array `VIDEOS`:
```js
{
  video_id: 'unik-untuk-setiap-video',  // ← wajib unik
  title: 'Judul Video',
  creator: 'Kreator — Nama',
  category: 'Dokumenter',  // atau 'Cerita Pendek' / 'Video Musik' / 'Animasi'
  year: 2025,
  duration: '12 mnt',
  views: '4.2k',
  tags: ['urban', 'jakarta'],
  cover: 'https://url-ke-thumbnail.jpg',
  description: 'Deskripsi lengkap...',
  featured: false,  // true = muncul di row "Trending"
}
```

### Tambah Server Baru
Edit `js/data.js` → array `SERVERS`:
```js
{
  id: 'cdn-04',
  name: 'CDN Asia Tenggara',
  pattern: 'https://cdn04.nobar.id/embed/{video_id}',
  quality: '1080p',
  load: 45,
  recommended: false,
}
```

### Ganti Warna Tema
Edit `tailwind.config` di `<head>` `index.html`:
```js
colors: {
  brand: {
    500: '#e50914',  // ← ganti dengan hex brand Anda
    400: '#ff1c27',
    600: '#c4080f',
  },
}
```

## Referensi UI/UX

Desain mengikuti prinsip-prinsip:
- **Netflix dark mode** — latar gelap, aksen merah, horizontal scroll row
- **Accessibility** — keyboard navigation (Enter/Space buka kartu, ESC tutup modal), `aria-*` labels, `prefers-reduced-motion`
- **Responsive** — grid adaptif dari 2 kolom (mobile) sampai 5 kolom (desktop)
- **Performance** — `loading="lazy"` pada gambar, `requestAnimationFrame` untuk header scroll

## Keamanan & Lisensi

- Semua thumbnail memakai Unsplash (royalty-free)
- URL video adalah placeholder `example.com` — ganti dengan storage Anda
- Kode di bawah lisensi MIT — bebas pakai untuk tujuan belajar

---

Dibuat untuk pembelajaran web development. Selamat ngoding!

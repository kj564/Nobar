import Link from "next/link";
import { Play, Home, Search } from "lucide-react";

// Custom 404 page — shown when user visits a movie/series URL that
// wasn't pre-rendered (e.g., directly typing a URL or clicking a link
// to a movie outside the pre-render set).
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-ink-950 text-white">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-ink-950/80 border-b border-white/5">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-md bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition">
              <Play className="w-5 h-5 fill-white" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tighter uppercase">
              No<span className="text-brand-500">bar</span>
            </span>
          </Link>
        </nav>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pt-16 text-center">
        <div className="max-w-md">
          {/* Big 404 */}
          <h1 className="font-display text-[8rem] sm:text-[10rem] font-black text-brand-500 leading-none">
            404
          </h1>

          {/* Message */}
          <h2 className="font-display text-2xl font-bold mt-4 mb-3">
            Halaman Tidak Ditemukan
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-8">
            Film atau series yang Anda cari belum tersedia untuk ditonton.
            Mungkin judul tersebut belum di-pre-render, atau URL yang Anda
            masukkan salah. Coba cari melalui beranda atau halaman Movies.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 rounded-lg font-semibold text-sm transition shadow-lg shadow-brand-500/30"
            >
              <Home className="w-4 h-4" />
              Kembali ke Beranda
            </Link>
            <Link
              href="/movie/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur rounded-lg font-semibold text-sm transition border border-white/10"
            >
              <Search className="w-4 h-4" />
              Jelajahi Movies
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-gray-500">© 2025 Nobar Project.</p>
        </div>
      </footer>
    </div>
  );
}

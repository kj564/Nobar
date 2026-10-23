"use client";

import { useState, useEffect, useRef } from "react";
import { Users, X } from "lucide-react";

// VideoTogether integration — uses public server (vt.panghair.com)
// Auto-detects <video> elements + injects watch party UI
// No extension needed — works on website directly

export function WatchPartyButton() {
  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // Load VideoTogether website version
    if (document.getElementById("vt-script")) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "vt-script";
    script.src = "https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/vt.en-us.website.js";
    script.async = true;
    script.onload = () => {
      console.log("[VideoTogether] Loaded");
      setLoaded(true);
    };
    document.head.appendChild(script);
    scriptRef.current = script;

    return () => {
      // Don't remove — VideoTogether UI persists across page navigations
    };
  }, []);

  const handleClick = () => {
    if (!loaded) return;

    // VideoTogether auto-injects a floating UI panel.
    // Show help modal explaining how to use it.
    setShowHelp(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!loaded}
        className="bg-white/10 backdrop-blur hover:bg-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center gap-2 transition border border-white/10 disabled:opacity-50"
      >
        <Users className="w-4 h-4" />
        <span className="hidden sm:inline">Start Watch Party</span>
        <span className="sm:hidden">Party</span>
      </button>

      {/* Help modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative bg-ink-900 border border-white/10 rounded-xl p-6 max-w-md w-full">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-500" />
              Nobar Bareng (Watch Party)
            </h3>
            <div className="space-y-3 text-sm text-gray-300">
              <p className="leading-relaxed">
                <span className="text-white font-semibold">VideoTogether</span> panel sudah
                aktif di pojok kanan bawah layar kamu.
              </p>
              <div className="space-y-2 pl-3 border-l-2 border-brand-500/30">
                <p><span className="text-brand-500 font-semibold">1.</span> Klik panel VideoTogether di pojok kanan bawah</p>
                <p><span className="text-brand-500 font-semibold">2.</span> Buat room (create room) atau masuk room ID teman</p>
                <p><span className="text-brand-500 font-semibold">3.</span> Share room ID ke teman</p>
                <p><span className="text-brand-500 font-semibold">4.</span> Teman buka movie yang sama → join room → sync otomatis!</p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed pt-2">
                Video sync (play/pause/seek) otomatis antar user.
                Tersedia juga voice chat dan text chat.
              </p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-5 w-full bg-brand-500 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}

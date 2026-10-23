"use client";

import { useState, useEffect, useRef } from "react";
import { Users, X, Play, Copy, Check, ExternalLink } from "lucide-react";

// VideoTogether integration — uses public server (2gether.video)
// Auto-detects <video> elements + injects a floating watch-party panel.
// No extension needed — works on the website directly.
//
// UI harmony: the trigger button uses a "glass-sage" treatment
// (brand-500/15 + brand border) so it sits between the solid primary
// "Watch Now" and the neutral secondary actions (Trailer / Watchlist),
// signalling it is a featured social action while staying on-palette.

export function WatchPartyButton() {
  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (document.getElementById("vt-script")) {
      setLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "vt-script";
    script.src =
      "https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/vt.en-us.website.js";
    script.async = true;
    script.onload = () => {
      console.log("[VideoTogether] Loaded");
      setLoaded(true);
      injectVtTheme();
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove — VideoTogether UI persists across page navigations.
    };
  }, []);

  // ── Inject harmonized theme into VideoTogether's shadow DOM ──
  // The VT website version renders its floating panel inside a closed-ish
  // shadow root on #VideoTogetherWrapper. External CSS can't reach it,
  // so we inject a <style> tag directly into the shadowRoot once the
  // wrapper + its shadow exist. We poll briefly because VT creates the
  // shadow asynchronously after the script loads.
  const injectVtTheme = () => {
    const STYLE_ID = "nobar-vt-theme";
    const css = `
      :host, #VideoTogetherWrapper { font-family: "Inter", system-ui, sans-serif !important; }

      /* Main floating panel — dark glass, sage border, Nobar rounding */
      #videoTogetherFlyPannel {
        background: rgba(37, 39, 42, 0.94) !important;
        backdrop-filter: blur(14px) !important;
        border: 1px solid rgba(134, 167, 137, 0.25) !important;
        border-radius: 14px !important;
        box-shadow: 0 12px 44px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) !important;
        color: #F8F9FA !important;
        overflow: hidden !important;
      }

      /* Header band — subtle sage tint */
      .vt-modal-header, #videoTogetherHeader {
        background: linear-gradient(135deg, rgba(134,167,137,0.16), rgba(37,39,42,0)) !important;
        border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        padding: 12px 14px !important;
      }
      .vt-modal-title {
        color: #F8F9FA !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
      }

      /* Body + content */
      .vt-modal-content, .vt-modal-body, #mainPannel {
        background: transparent !important;
        color: #F8F9FA !important;
      }
      #mainPannel, .content { color: #d4d6d9 !important; }

      /* Labels & status text */
      #videoTogetherStatusText, #memberCount, .vt-modal-easyshare span {
        color: rgba(248,249,250,0.65) !important;
      }

      /* Inputs — dark field, sage focus ring */
      #videoTogetherRoomNameInput, #videoTogetherRoomPdIpt, #textMessageInput {
        background: rgba(30,32,34,0.7) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        border-radius: 8px !important;
        color: #F8F9FA !important;
        padding: 7px 10px !important;
        outline: none !important;
        transition: border-color .2s ease, box-shadow .2s ease !important;
      }
      #videoTogetherRoomNameInput:focus, #videoTogetherRoomPdIpt:focus, #textMessageInput:focus {
        border-color: rgba(134,167,137,0.6) !important;
        box-shadow: 0 0 0 3px rgba(134,167,137,0.14) !important;
      }
      #videoTogetherRoomNameInput::placeholder, #textMessageInput::placeholder {
        color: rgba(248,249,250,0.32) !important;
      }

      /* Buttons — primary = sage, secondary = neutral glass */
      .vt-btn, button.vt-btn {
        border-radius: 8px !important;
        font-weight: 600 !important;
        transition: background-color .2s ease, transform .15s ease, border-color .2s ease !important;
        border: 1px solid transparent !important;
      }
      .vt-btn:hover { transform: translateY(-1px) !important; }

      .vt-btn-primary {
        background: #86A789 !important;
        border-color: #86A789 !important;
        color: #1E2022 !important;
      }
      .vt-btn-primary:hover {
        background: #9BBC9E !important;
        border-color: #9BBC9E !important;
      }

      .vt-btn-secondary {
        background: rgba(255,255,255,0.06) !important;
        border-color: rgba(255,255,255,0.1) !important;
        color: #F8F9FA !important;
      }
      .vt-btn-secondary:hover {
        background: rgba(255,255,255,0.12) !important;
        border-color: rgba(255,255,255,0.2) !important;
      }

      .vt-btn-dangerous {
        background: rgba(194,94,94,0.16) !important;
        border-color: rgba(194,94,94,0.4) !important;
        color: #D67474 !important;
      }
      .vt-btn-dangerous:hover {
        background: rgba(194,94,94,0.28) !important;
      }

      /* Close / icon buttons — neutral, no border */
      .vt-modal-close, .vt-modal-close-x, .vt-modal-close-icon,
      .vt-modal-setting, .vt-modal-donate {
        background: transparent !important;
        border-color: transparent !important;
        color: rgba(248,249,250,0.5) !important;
      }
      .vt-modal-close:hover, .vt-modal-close-x:hover,
      .vt-modal-setting:hover, .vt-modal-donate:hover {
        background: rgba(255,255,255,0.08) !important;
        color: #F8F9FA !important;
      }

      /* Links / easyshare copy */
      a, .vt-modal-easyshare a { color: #9BBC9E !important; text-decoration: none !important; }
      a:hover { color: #9BBC9E !important; text-decoration: underline !important; }

      /* Chat area */
      #textMessageChat {
        background: rgba(30,32,34,0.5) !important;
        border-radius: 10px !important;
        border: 1px solid rgba(255,255,255,0.05) !important;
      }

      /* Range sliders — sage track */
      input[type="range"].slider, .range-slider input {
        accent-color: #86A789 !important;
      }

      /* Footer */
      .vt-modal-footer {
        border-top: 1px solid rgba(255,255,255,0.05) !important;
        padding: 10px 14px !important;
      }

      /* Scrollbars */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: rgba(134,167,137,0.3); border-radius: 999px; }
      ::-webkit-scrollbar-track { background: transparent; }
    `;

    let attempts = 0;
    const tryInject = () => {
      attempts++;
      const wrapper = document.getElementById("VideoTogetherWrapper");
      const sr = (wrapper as any)?.shadowRoot as ShadowRoot | null;
      if (sr) {
        if (!sr.getElementById(STYLE_ID)) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = css;
          sr.appendChild(style);
          console.log("[VideoTogether] Nobar theme injected into shadow root");
        }
        return;
      }
      if (attempts < 40) {
        setTimeout(tryInject, 250);
      }
    };
    tryInject();
  };

  const handleClick = () => {
    if (!loaded) return;
    setShowHelp(true);
  };

  const copyInvite = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!loaded}
        aria-label="Start Watch Party"
        className="group relative inline-flex items-center gap-2 bg-brand-500/15 hover:bg-brand-500/25 backdrop-blur text-brand-400 hover:text-brand-300 font-semibold py-2.5 px-4 rounded-lg transition-all border border-brand-500/30 hover:border-brand-500/50 disabled:opacity-50 disabled:cursor-wait overflow-hidden"
      >
        {/* subtle sheen on hover */}
        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <Users className="w-4 h-4 relative z-10" />
        <span className="relative z-10 hidden sm:inline">Nobar Bareng</span>
        <span className="relative z-10 sm:hidden">Party</span>
        {!loaded && (
          <span className="relative z-10 inline-flex items-center gap-1 text-[10px] text-brand-400/70">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          </span>
        )}
      </button>

      {/* Help / guide modal — harmonized with Nobar dark + sage theme */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Watch Party guide"
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative bg-ink-900 border border-white/10 rounded-2xl p-0 max-w-md w-full overflow-hidden shadow-2xl shadow-brand-500/10">
            {/* Header band — sage tinted */}
            <div className="relative bg-gradient-to-br from-brand-500/20 via-ink-900 to-ink-900 px-6 pt-6 pb-5 border-b border-white/5">
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand-500/20 border border-brand-500/30 grid place-items-center">
                  <Users className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold text-white leading-tight">
                    Nobar Bareng
                  </h3>
                  <p className="text-xs text-gray-400">Watch party — sync film bareng teman</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 text-sm text-gray-300">
              <p className="leading-relaxed">
                Panel{" "}
                <span className="text-brand-400 font-semibold">VideoTogether</span> sudah aktif di
                pojok kanan bawah layar. Ikuti langkah berikut:
              </p>

              <ol className="space-y-2.5">
                {[
                  "Klik panel VideoTogether di pojok kanan bawah.",
                  "Pilih Create room (buat room baru) atau masukkan room ID teman.",
                  "Share link halaman ini ke teman agar mereka join di film yang sama.",
                  "Play / pause / seek akan tersinkron otomatis antar penonton.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-none mt-0.5 w-5 h-5 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 text-[11px] font-bold grid place-items-center">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed text-gray-300">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="rounded-lg bg-white/5 border border-white/10 p-3 flex items-start gap-2.5">
                <Play className="w-4 h-4 text-brand-400 flex-none mt-0.5" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  Video sinkron (play / pause / seek) otomatis. Tersedia juga voice chat &amp; text
                  chat bawaan VideoTogether.
                </p>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-6 pb-6 flex flex-col sm:flex-row items-stretch gap-2.5">
              <button
                onClick={copyInvite}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg transition shadow-lg shadow-brand-500/20"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" /> Link tersalin
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Salin link film
                  </>
                )}
              </button>
              <a
                href="https://videotogether.github.io/en-us/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-semibold py-2.5 px-4 rounded-lg transition"
              >
                <ExternalLink className="w-4 h-4" /> Pelajari
              </a>
              <button
                onClick={() => setShowHelp(false)}
                className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-semibold py-2.5 px-4 rounded-lg transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

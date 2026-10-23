"use client";

import { useState, useEffect, useRef } from "react";
import { Users, X, Play, Copy, Check, ExternalLink, AlertCircle, Film } from "lucide-react";

// VideoTogether integration — uses public server (2gether.video)
// Auto-detects <video> elements + injects a floating watch-party panel.
// No extension needed — works on the website directly.
//
// IMPORTANT: VideoTogether's website version can ONLY sync <video> elements
// that live in the top-level document. When the NativePlayer falls back to
// an embed <iframe> (videm.xyz / vidlink.pro), the actual video is inside a
// cross-origin iframe that VideoTogether cannot reach — it then shows
// "No video in this page". We detect this case and adapt the UI so the user
// understands why Watch Party isn't available for that title.

type VideoState = "checking" | "native" | "embed";

export function WatchPartyButton() {
  const [loaded, setLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoState, setVideoState] = useState<VideoState>("checking");
  const videoStateRef = useRef<VideoState>("checking");

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

  // ── Detect whether the page has a real <video> element (native player) ──
  // NativePlayer only renders a <video> when mzfi.me returns a direct MP4.
  // In all other states (loading, embed fallback, no stream) there is no
  // <video> in the top-level document — only an <iframe>. We observe the
  // DOM so the button updates as soon as the player resolves its source.
  useEffect(() => {
    const hasNativeVideo = () => {
      const videos = document.querySelectorAll("video");
      for (const v of videos) {
        // A video counts as "native/syncable" if it has a real src
        if (v.src && !v.src.startsWith("about:")) return true;
        const source = v.querySelector("source[src]");
        if (source) return true;
      }
      return false;
    };

    const hasEmbedIframe = () => {
      // The NativePlayer's embed iframe — title contains "— Player"
      const iframes = document.querySelectorAll(
        'iframe[title*="Player"], iframe[src*="videm"], iframe[src*="vidlink"], iframe[src*="2embed"]'
      );
      return iframes.length > 0;
    };

    const evaluate = () => {
      let next: VideoState = "checking";
      if (hasNativeVideo()) {
        next = "native";
      } else if (hasEmbedIframe()) {
        // Embed present and no native video → definitively embed-only.
        next = "embed";
      } else {
        // Neither — could still be loading. Stay in "checking" so the
        // observer can flip it once the player renders.
        next = "checking";
      }
      if (next !== videoStateRef.current) {
        videoStateRef.current = next;
        setVideoState(next);
      }
    };

    evaluate();

    // Watch for the player resolving its source (adds <video> or <iframe>).
    const observer = new MutationObserver(() => {
      evaluate();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    // Safety: after 12s, if still "checking", settle on "embed" so the UI
    // doesn't stay in a perpetual loading state for the user.
    const settleTimer = window.setTimeout(() => {
      if (videoStateRef.current === "checking") {
        videoStateRef.current = "embed";
        setVideoState("embed");
      }
    }, 12000);

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
    };
  }, []);

  // ── Inject harmonized theme into VideoTogether's shadow DOM ──
  const injectVtTheme = () => {
    const STYLE_ID = "nobar-vt-theme";
    const css = `
      :host, #VideoTogetherWrapper { font-family: "Inter", system-ui, sans-serif !important; }

      #videoTogetherFlyPannel {
        background: rgba(37, 39, 42, 0.94) !important;
        backdrop-filter: blur(14px) !important;
        border: 1px solid rgba(134, 167, 137, 0.25) !important;
        border-radius: 14px !important;
        box-shadow: 0 12px 44px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) !important;
        color: #F8F9FA !important;
        overflow: hidden !important;
      }

      .vt-modal-header, #videoTogetherHeader {
        background: linear-gradient(135deg, rgba(134,167,137,0.16), rgba(37,39,42,0)) !important;
        border-bottom: 1px solid rgba(255,255,255,0.06) !important;
        padding: 12px 14px !important;
      }
      .vt-modal-title { color: #F8F9FA !important; font-weight: 700 !important; letter-spacing: 0 !important; }

      .vt-modal-content, .vt-modal-body, #mainPannel { background: transparent !important; color: #F8F9FA !important; }
      #mainPannel, .content { color: #d4d6d9 !important; }

      #videoTogetherStatusText, #memberCount, .vt-modal-easyshare span { color: rgba(248,249,250,0.65) !important; }

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
      #videoTogetherRoomNameInput::placeholder, #textMessageInput::placeholder { color: rgba(248,249,250,0.32) !important; }

      .vt-btn, button.vt-btn {
        border-radius: 8px !important;
        font-weight: 600 !important;
        transition: background-color .2s ease, transform .15s ease, border-color .2s ease !important;
        border: 1px solid transparent !important;
      }
      .vt-btn:hover { transform: translateY(-1px) !important; }

      .vt-btn-primary { background: #86A789 !important; border-color: #86A789 !important; color: #1E2022 !important; }
      .vt-btn-primary:hover { background: #9BBC9E !important; border-color: #9BBC9E !important; }

      .vt-btn-secondary { background: rgba(255,255,255,0.06) !important; border-color: rgba(255,255,255,0.1) !important; color: #F8F9FA !important; }
      .vt-btn-secondary:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.2) !important; }

      .vt-btn-dangerous { background: rgba(194,94,94,0.16) !important; border-color: rgba(194,94,94,0.4) !important; color: #D67474 !important; }
      .vt-btn-dangerous:hover { background: rgba(194,94,94,0.28) !important; }

      .vt-modal-close, .vt-modal-close-x, .vt-modal-close-icon, .vt-modal-setting, .vt-modal-donate {
        background: transparent !important; border-color: transparent !important; color: rgba(248,249,250,0.5) !important;
      }
      .vt-modal-close:hover, .vt-modal-close-x:hover, .vt-modal-setting:hover, .vt-modal-donate:hover {
        background: rgba(255,255,255,0.08) !important; color: #F8F9FA !important;
      }

      a, .vt-modal-easyshare a { color: #9BBC9E !important; text-decoration: none !important; }
      a:hover { color: #9BBC9E !important; text-decoration: underline !important; }

      #textMessageChat { background: rgba(30,32,34,0.5) !important; border-radius: 10px !important; border: 1px solid rgba(255,255,255,0.05) !important; }
      input[type="range"].slider, .range-slider input { accent-color: #86A789 !important; }
      .vt-modal-footer { border-top: 1px solid rgba(255,255,255,0.05) !important; padding: 10px 14px !important; }
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
      if (attempts < 40) setTimeout(tryInject, 250);
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

  // Derive button appearance from video state.
  // - "native": full sage glass — Watch Party is live and syncable (no extension needed).
  // - "embed": muted terracotta-tinted — signals "install the VideoTogether extension
  //   to sync this embed". VideoTogether CAN sync embeds, but only via the browser
  //   extension (all_frames:true). The website version can't cross the iframe origin.
  // - "checking": neutral while the player is still resolving its source.
  const buttonClass =
    videoState === "native"
      ? "group relative inline-flex items-center gap-2 bg-brand-500/15 hover:bg-brand-500/25 backdrop-blur text-brand-400 hover:text-brand-300 font-semibold py-2.5 px-4 rounded-lg transition-all border border-brand-500/30 hover:border-brand-500/50 disabled:opacity-50 disabled:cursor-wait overflow-hidden"
      : videoState === "embed"
        ? "group relative inline-flex items-center gap-2 bg-accent-500/10 hover:bg-accent-500/15 backdrop-blur text-accent-400/80 hover:text-accent-400 font-semibold py-2.5 px-4 rounded-lg transition-all border border-accent-500/25 hover:border-accent-500/40 disabled:opacity-50 disabled:cursor-wait overflow-hidden"
        : "group relative inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 backdrop-blur text-gray-400 hover:text-gray-300 font-semibold py-2.5 px-4 rounded-lg transition-all border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-wait overflow-hidden";

  const buttonLabel =
    videoState === "native"
      ? "Nobar Bareng"
      : videoState === "embed"
        ? "Nobar Bareng"
        : "Nobar Bareng";

  const statusDot =
    videoState === "native" ? (
      <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
    ) : videoState === "embed" ? (
      <span className="w-1.5 h-1.5 rounded-full bg-accent-400" title="Embed player — butuh ekstensi VideoTogether" />
    ) : (
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
    );

  return (
    <>
      <button
        onClick={handleClick}
        disabled={!loaded}
        aria-label={
          videoState === "embed"
            ? "Watch Party — butuh ekstensi VideoTogether untuk embed"
            : "Start Watch Party"
        }
        title={
          videoState === "embed"
            ? "Watch Party butuh ekstensi VideoTogether — film ini pakai embed player"
            : videoState === "native"
              ? "Watch Party siap — player native terdeteksi"
              : "Mendeteksi player…"
        }
        className={buttonClass}
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <Users className="w-4 h-4 relative z-10" />
        <span className="relative z-10 hidden sm:inline">{buttonLabel}</span>
        <span className="relative z-10 sm:hidden">Party</span>
        <span className="relative z-10 flex items-center gap-1">
          {statusDot}
          {!loaded && (
            <span className="text-[10px] text-brand-400/70">…</span>
          )}
        </span>
      </button>

      {/* ── Help modal — two variants based on video state ── */}
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
            {/* Header band — color depends on readiness */}
            <div
              className={`relative px-6 pt-6 pb-5 border-b border-white/5 ${
                videoState === "embed"
                  ? "bg-gradient-to-br from-accent-500/20 via-ink-900 to-ink-900"
                  : "bg-gradient-to-br from-brand-500/20 via-ink-900 to-ink-900"
              }`}
            >
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl border grid place-items-center ${
                    videoState === "embed"
                      ? "bg-accent-500/15 border-accent-500/30"
                      : "bg-brand-500/20 border-brand-500/30"
                  }`}
                >
                  {videoState === "embed" ? (
                    <AlertCircle className="w-5 h-5 text-accent-400" />
                  ) : (
                    <Users className="w-5 h-5 text-brand-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-display text-lg font-extrabold text-white leading-tight">
                    Nobar Bareng
                  </h3>
                  <p className="text-xs text-gray-400">
                    {videoState === "embed"
                      ? "Watch party — butuh ekstensi untuk embed player"
                      : "Watch party — sync film bareng teman"}
                  </p>
                </div>
              </div>
            </div>

            {/* Body — NATIVE variant (Watch Party ready) */}
            {videoState === "native" && (
              <div className="px-6 py-5 space-y-4 text-sm text-gray-300">
                <p className="leading-relaxed">
                  Panel{" "}
                  <span className="text-brand-400 font-semibold">VideoTogether</span> sudah
                  aktif di pojok kanan bawah layar. Ikuti langkah berikut:
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
                    Video sinkron (play / pause / seek) otomatis. Tersedia juga voice chat
                    &amp; text chat bawaan VideoTogether.
                  </p>
                </div>
              </div>
            )}

            {/* Body — EMBED variant (needs VideoTogether extension) */}
            {videoState === "embed" && (
              <div className="px-6 py-5 space-y-4 text-sm text-gray-300">
                <div className="rounded-lg bg-accent-500/10 border border-accent-500/25 p-3.5 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-accent-400 flex-none mt-0.5" />
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Film ini diputar lewat <strong className="text-white">embed player</strong>{" "}
                    (videm.xyz / vidlink.pro) — video-nya ada di dalam <em>iframe</em> lintas-domain.
                    Versi <em>website</em> VideoTogether tidak bisa menembus iframe itu, jadi muncul
                    pesan <span className="font-mono text-accent-400">“No video in this page”</span>.
                  </p>
                </div>

                <p className="leading-relaxed">
                  Tapi <strong className="text-white">Watch Party tetap bisa</strong> —
                  gunakan <strong className="text-brand-400">ekstensi VideoTogether</strong>.
                  Ekstensi di-inject ke semua frame (termasuk iframe lintas-domain) lewat
                  <span className="font-mono text-gray-400"> all_frames:true</span>,
                  jadi embed player ikut tersinkron.
                </p>

                {/* Primary CTA — extension install */}
                <div className="rounded-lg bg-brand-500/8 border border-brand-500/25 p-3.5 space-y-3">
                  <p className="text-xs font-semibold text-brand-300 flex items-center gap-2 uppercase tracking-wider">
                    <Film className="w-3.5 h-3.5" /> Solusi utama
                  </p>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Pasang ekstensi VideoTogether di browser. Setelah terpasang, buka halaman ini
                    lagi — panel VT otomatis sync video di dalam embed.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href="https://chrome.google.com/webstore/detail/videotogether/imkinoccecmkmhckhbdkjckmcieglidi"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition shadow-lg shadow-brand-500/20"
                    >
                      <ExternalLink className="w-3 h-3" /> Chrome
                    </a>
                    <a
                      href="https://addons.mozilla.org/firefox/addon/videotogether/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white text-xs font-semibold transition"
                    >
                      Firefox
                    </a>
                    <a
                      href="https://microsoftedge.microsoft.com/addons/detail/videotogether/emmmijheaoeoocnekhbbnhhdnmflphco"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white text-xs font-semibold transition"
                    >
                      Edge
                    </a>
                  </div>
                </div>

                {/* Alternatives */}
                <div className="rounded-lg bg-white/5 border border-white/10 p-3.5 space-y-2.5">
                  <p className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-brand-400" /> Atau tanpa ekstensi:
                  </p>
                  <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-brand-400 font-bold">›</span>
                      <span>
                        Pilih film dari baris <strong className="text-gray-200">Trending Now</strong>{" "}
                        di beranda — film-film itu pakai <em>native player</em> (direct MP4) yang
                        langsung ke-sync tanpa ekstensi.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-brand-400 font-bold">›</span>
                      <span>
                        Atau ajak teman <strong className="text-gray-200">nonton di perangkat
                        masing-masing</strong> dan tekan play bareng manual — kurang otomatis tapi
                        tetap fun.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Body — CHECKING variant */}
            {videoState === "checking" && (
              <div className="px-6 py-5 space-y-3 text-sm text-gray-300">
                <p className="leading-relaxed">
                  Mendeteksi player… Panel VideoTogether akan aktif otomatis begitu video
                  native terdeteksi.
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                  Memeriksa sumber stream…
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="px-6 pb-6 flex flex-col sm:flex-row items-stretch gap-2.5">
              {videoState === "native" ? (
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
              ) : (
                <button
                  onClick={copyInvite}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-semibold py-2.5 rounded-lg transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> Link tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Salin link film ini
                    </>
                  )}
                </button>
              )}
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

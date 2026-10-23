"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles, Loader2 } from "lucide-react";

type StreamSource = {
  quality: string;
  url: string;
  provider: string;
  type: string;
};

type Subtitle = {
  language: string;
  url: string;
};

type EmbedProvider = {
  id: string;
  name: string;
  url: string;
};

type NativePlayerProps = {
  tmdbId: number;
  title: string;
  kind?: "movie" | "tv";
  season?: number;
  episode?: number;
};

export function NativePlayer({ tmdbId, title, kind = "movie", season, episode }: NativePlayerProps) {
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [embedProviders, setEmbedProviders] = useState<EmbedProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("");
  const [useEmbed, setUseEmbed] = useState(false);
  const [showSettings, setShowSettings] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const streamUrl = kind === "tv" && season && episode
    ? `/api/stream/${tmdbId}?kind=tv&season=${season}&episode=${episode}`
    : `/api/stream/${tmdbId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSources([]);
    setActiveSource(null);
    setEmbedUrl(null);

    fetch(streamUrl)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
        // Lazy subtitle fetch: main /api/stream returns a single "Available"
        // placeholder URL. When user opens the subtitle menu, we fetch the
        // actual subtitle list from /api/stream/[id]/subtitles (separate
        // endpoint, avoids Vercel function timeout on the main stream call).
        const placeholderSubs = data.subtitles || [];
        if (placeholderSubs.length === 1 && placeholderSubs[0].language === "Available") {
          // Fetch actual subtitles on-demand
          fetch(placeholderSubs[0].url)
            .then((r) => r.json())
            .then((subData) => {
              if (cancelled) return;
              const subs = (subData.subtitles || []).map((s: Subtitle) => ({
                language: s.language,
                url: `/api/subtitle?url=${encodeURIComponent(s.url)}`,
              }));
              setSubtitles(subs);
            })
            .catch(() => {}); // subtitles optional
        } else {
          // Direct subtitle URLs (legacy/inline format)
          const subs = placeholderSubs.map((s: Subtitle) => ({
            language: s.language,
            url: `/api/subtitle?url=${encodeURIComponent(s.url)}`,
          }));
          setSubtitles(subs);
        }
        if (data.sources?.length > 0) {
          const best = data.sources.reduce((b: StreamSource, s: StreamSource) =>
            parseInt(s.quality) > parseInt(b.quality) ? s : b
          );
          setActiveSource(best);
        } else if (data.embedUrl) {
          setEmbedUrl(data.embedUrl);
          setEmbedProviders(data.embedProviders || []);
          setActiveProvider(data.embedProviders?.[0]?.id || "");
          setUseEmbed(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setEmbedUrl(kind === "tv" && season && episode
          ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${tmdbId}`
        );
        setUseEmbed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [streamUrl]);

  // Video events
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Force muted on load — browser blocks autoplay of unmuted videos.
    // React's `muted` prop doesn't reliably set the property, so do it here.
    v.muted = true;
    setMuted(true);

    // ── VideoTogether iOS Safari fix ──
    // On iOS Safari, VT's WebKitMutationObserver may not catch our dynamically
    // rendered <video> element (React adds it 2-4s after page load, after API
    // response). VT needs to hook into the video to sync play/pause/seek.
    // Manually notify VT about our video element after it mounts.
    const notifyVideoTogether = () => {
      const ext = (window as any).videoTogetherExtension;
      if (ext && typeof ext.AddVideoListener === "function") {
        try {
          ext.AddVideoListener(v);
          console.log("[NOBAR] VT AddVideoListener called for video element");
        } catch (e) {
          console.error("[NOBAR] VT AddVideoListener failed:", e);
        }
      }
    };
    // Try immediately + retry after 1s (VT might not be loaded yet)
    notifyVideoTogether();
    const vtRetry = setTimeout(notifyVideoTogether, 1000);
    const vtRetry2 = setTimeout(notifyVideoTogether, 3000);

    const handlers = {
      timeupdate: () => setCurrentTime(v.currentTime),
      durationchange: () => setDuration(v.duration || 0),
      play: () => { setPlaying(true); setBuffering(false); },
      pause: () => setPlaying(false),
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      canplay: () => setBuffering(false),
      volumechange: () => { setMuted(v.muted); setVolume(v.volume); },
    };
    Object.entries(handlers).forEach(([e, fn]) => v.addEventListener(e, fn));

    // Also set webkit-playsinline for older iOS Safari (pre-10)
    v.setAttribute("webkit-playsinline", "true");

    return () => {
      clearTimeout(vtRetry);
      clearTimeout(vtRetry2);
      Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn));
    };
  }, [activeSource]);

  // ── iOS Safari autoplay fix ──
  // On iOS Safari, autoplay (even muted) can be blocked in Low Power Mode
  // or strict privacy settings. When play() rejects, show a tap-to-play
  // overlay. The user tap provides the required user gesture for playback.
  // This also triggers VT's VideoClicked handler → VT activates the video
  // → sync works.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const tryAutoplay = async () => {
      try {
        await v.play();
        // Play succeeded — dispatch play event to trigger VT VideoClicked
        v.dispatchEvent(new Event("play", { bubbles: true }));
      } catch (e) {
        // Autoplay blocked — set state to show tap-to-play overlay
        console.log("[NOBAR] Autoplay blocked, showing tap-to-play overlay");
        setPlaying(false);
      }
    };

    // Try autoplay after a short delay (let video metadata load first)
    const autoplayTimer = setTimeout(tryAutoplay, 500);

    return () => clearTimeout(autoplayTimer);
  }, [activeSource]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); break;
        case "ArrowRight": e.preventDefault(); v.currentTime = Math.min(v.duration, v.currentTime + 10); break;
        case "ArrowUp": e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); break;
        case "ArrowDown": e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); break;
        case "m": v.muted = !v.muted; break;
        case "f": toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
    // Broadcast to watch party
    (window as any).__watchPartySync?.(!v.paused, v.currentTime);
  }, []);

  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted; };
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen();
  };
  const seek = (t: number) => { const v = videoRef.current; if (v) { v.currentTime = t; (window as any).__watchPartySync?.(!v.paused, t); } };
  const setVol = (vol: number) => { const v = videoRef.current; if (v) { v.volume = vol; v.muted = vol === 0; } };

  const changeQuality = (s: StreamSource) => {
    const v = videoRef.current;
    const t = v?.currentTime || 0;
    const wasPlaying = !v?.paused;
    setActiveSource(s); setShowSettings("");
    setTimeout(() => { if (v) { v.currentTime = t; if (wasPlaying) v.play(); } }, 200);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Loading
  if (loading) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading stream...</span>
      </div>
    );
  }

  // Embed fallback (only when no direct stream available)
  if (useEmbed && embedUrl) {
    const switchProvider = (provider: EmbedProvider) => {
      setEmbedUrl(provider.url);
      setActiveProvider(provider.id);
    };

    return (
      <div className="space-y-2">
        <div className="relative bg-black aspect-video overflow-hidden rounded-lg">
          <iframe
            title={`${title} — Player`}
            className="absolute inset-0 w-full h-full"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">Embed player (same-origin proxy — NOBAR sync aktif).</p>
          {embedProviders.length > 1 && (
            <div className="flex items-center gap-1">
              {embedProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => switchProvider(p)}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold transition ${
                    activeProvider === p.id
                      ? "bg-brand-500/20 text-brand-400 border border-brand-500/30"
                      : "bg-white/5 text-gray-400 hover:text-white border border-white/10"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // No stream at all
  if (!activeSource) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <p className="text-sm text-gray-400">Stream not available.</p>
      </div>
    );
  }

  // Native player — NO ADS, direct MP4
  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative bg-black aspect-video overflow-hidden rounded-lg group" tabIndex={0}>
        <video
          ref={videoRef}
          src={activeSource.url}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          playsInline
          autoPlay
          muted
          preload="auto"
        >
          {subtitles.map((sub, i) => (
            <track
              key={i}
              kind="subtitles"
              src={sub.url}
              srcLang={sub.language.toLowerCase().slice(0, 2)}
              label={sub.language}
              default={activeSubtitle === sub.url}
            />
          ))}
        </video>

        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
          </div>
        )}

        {!playing && !buffering && (
          <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center" aria-label="Play">
            <div className="w-16 h-16 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
              <Play className="w-8 h-8 fill-white text-white ml-1" />
            </div>
          </button>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pt-12 pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Seek bar */}
          <div
            className="relative w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer group/seek"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - rect.left) / rect.width) * duration);
            }}
          >
            <div className="absolute top-0 left-0 h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity" style={{ left: `calc(${progress}% - 6px)` }} />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-brand-500 transition">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>
            <div className="flex items-center gap-2 group/vol">
              <button onClick={toggleMute} className="text-white hover:text-brand-500 transition">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(e) => setVol(Number(e.target.value))} className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-brand-500 cursor-pointer" />
            </div>
            <div className="text-xs text-white/80 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</div>
            <div className="flex-1" />
            {sources.length > 1 && (
              <div className="relative">
                <button onClick={() => setShowSettings(showSettings === "q" ? "" : "q")} className="text-white hover:text-brand-500 transition flex items-center gap-1">
                  <Settings className="w-5 h-5" />
                  <span className="text-xs">{activeSource.quality}</span>
                </button>
                {showSettings === "q" && (
                  <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[120px]">
                    {sources.map((s, i) => (
                      <button key={i} onClick={() => changeQuality(s)} className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${activeSource.url === s.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}>
                        {s.quality}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Subtitles toggle */}
            {subtitles.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSettings(showSettings === "s" ? "" : "s")}
                  className={`text-white hover:text-brand-500 transition flex items-center gap-1 ${activeSubtitle ? "text-brand-400" : ""}`}
                  aria-label="Subtitles"
                >
                  <Subtitles className="w-5 h-5" />
                </button>
                {showSettings === "s" && (
                  <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[150px] max-h-60 overflow-y-auto scroll-row">
                    <button
                      onClick={() => {
                        setActiveSubtitle(null);
                        const v = videoRef.current;
                        if (v) {
                          for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
                        }
                        setShowSettings("");
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${!activeSubtitle ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                    >
                      Off
                    </button>
                    {subtitles.map((sub, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveSubtitle(sub.url);
                          const v = videoRef.current;
                          if (v) {
                            for (let j = 0; j < v.textTracks.length; j++) {
                              v.textTracks[j].mode = j === i ? "showing" : "disabled";
                            }
                          }
                          setShowSettings("");
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${activeSubtitle === sub.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {sub.language}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={toggleFullscreen} className="text-white hover:text-brand-500 transition">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>✓ Ad-free · <span className="text-gray-300">{activeSource.provider}</span> · {activeSource.quality}</span>
      </div>
    </div>
  );
}

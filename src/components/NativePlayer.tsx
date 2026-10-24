"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles, Loader2, Gauge, Wifi, Users, Zap } from "lucide-react";
import { useP2PStreaming } from "@/hooks/useP2PStreaming";
import { getP2PEngine, destroyP2PEngine, resetStats } from "@/lib/p2p-engine";

// ─────────────────────────────────────────────────────────────────────
// NativePlayer — buttery smooth playback via Shaka Player (DASH adaptive)
// + native <video> MP4 fallback + optional Hybrid P2P-CDN layer.
//
// Why Shaka?
//  - Industry-standard DASH player (used by Google/YouTube/Major streaming).
//  - Adaptive Bit Rate (ABR): auto-switches 1080→720→480 based on bandwidth
//    → no buffering on slow connections, no manual quality picker needed.
//  - 5-second chunked MPD → instant seek, no full-file re-fetch.
//  - Built-in bandwidth estimator + rebuffer recovery.
//
// Smoothness features:
//  - Preconnect to hakunaymatata CDN on mount (instant first byte)
//  - DASH preferred → adaptive bitrate kicks in immediately
//  - MP4 fallback (Progressive) when DASH unavailable or HEVC unsupported
//  - Larger initial buffer target (15s) before play → less stall risk
//  - Auto-retry on network blips (Shaka handles this natively)
//  - Visible ABR indicator (current bitrate) for transparency
//
// P2P-CDN Hybrid layer (toggleable, OFF by default):
//  - When ON: ShakaP2PEngine hooks Shaka's networking engine
//  - Critical zone (next 15s): always HTTP/CDN (zero stall risk)
//  - Swarm zone (15-21s ahead): P2P via WebRTC DataChannel
//  - Auto-fallback to CDN on P2P failure (no visible disruption)
//  - Stats tracked: peers connected, bytes P2P vs HTTP, ratio
// ─────────────────────────────────────────────────────────────────────


type StreamSource = {
  quality: string;
  url: string;
  provider: string;
  type: string;
};

type DashSource = {
  url: string;            // proxied MPD URL (/api/proxy?url=...&mbtoken=...)
  provider: string;
  maxBitrate: string;     // "1080p" / "720p" — display only
  codec: string;          // "hevc" / "h264"
};

type Subtitle = {
  language: string;
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
  const [dashSource, setDashSource] = useState<DashSource | null>(null);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [usingDash, setUsingDash] = useState(false);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [useEmbed, setUseEmbed] = useState(false);
  const [showSettings, setShowSettings] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);  // start muted for autoplay
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // ── P2P streaming toggle + stats ──
  // Toggle is persisted in localStorage (nobar:p2p-enabled).
  // When ON, ShakaP2PEngine is created during Shaka load and binds to the
  // player's networking engine — intercepting segment requests to route
  // through WebRTC peers when available (with CDN fallback).
  const { enabled: p2pEnabled, stats: p2pStats, toggle: toggleP2P } = useP2PStreaming();
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentBitrate, setCurrentBitrate] = useState<number>(0);  // for ABR indicator

  // P2P reload nonce — bumped when the user toggles P2P on/off mid-playback,
  // triggering the stream-fetch effect to re-initialize Shaka with the new
  // P2P engine state. Declared here (above the consuming effect) so the
  // dependency array is valid.
  const [p2pReloadNonce, setP2pReloadNonce] = useState(0);
  const prevP2pEnabled = useRef(p2pEnabled);
  useEffect(() => {
    if (prevP2pEnabled.current !== p2pEnabled) {
      prevP2pEnabled.current = p2pEnabled;
      console.log(`[NOBAR-P2P] Toggle changed → ${p2pEnabled ? "ON" : "OFF"}, reloading player`);
      // Trigger reload of the stream effect (re-fetch + re-init Shaka)
      setP2pReloadNonce((n) => n + 1);
      if (!p2pEnabled) {
        // If toggled OFF, also explicitly destroy any lingering engine
        destroyP2PEngine();
      }
    }
  }, [p2pEnabled]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shakaRef = useRef<any>(null);  // shaka.Player instance
  const shakaLoadedRef = useRef(false);

  const streamUrl = kind === "tv" && season && episode
    ? `/api/stream/${tmdbId}?kind=tv&season=${season}&episode=${episode}`
    : `/api/stream/${tmdbId}`;

  // ── Preconnect to CDN domains on mount → instant first byte ──
  // Browser opens TCP+TLS to hakunaymatata.com before we even need it.
  useEffect(() => {
    const preconnects = [
      "https://bcdnxw.hakunaymatata.com",
      "https://sbcdnw.hakunaymatata.com",
      "https://image.tmdb.org",
    ];
    const links: HTMLLinkElement[] = [];
    for (const href of preconnects) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
      links.push(link);
    }
    return () => { links.forEach(l => l.remove()); };
  }, []);

  // ── Dynamic import shaka-player (code-splits; only loaded when needed) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const shaka = await import("shaka-player");
        if (cancelled) return;
        // Polyfills must run before Player construction.
        shaka.polyfill.installAll();
        shakaLoadedRef.current = true;
      } catch (e) {
        console.warn("[NOBAR] shaka-player failed to load:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load Shaka player when dashSource + video element are ready ──
  const loadShaka = useCallback(async (mpdProxiedUrl: string): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;

    // Wait for shaka to be loaded
    let attempts = 0;
    while (!shakaLoadedRef.current && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (!shakaLoadedRef.current) {
      console.warn("[NOBAR] shaka-player not loaded — falling back to MP4");
      return false;
    }

    // ── Extract raw CDN MPD URL + mbtoken from proxied URL ──
    const mpdParams = new URL(mpdProxiedUrl, window.location.origin).searchParams;
    const rawMpdUrl = mpdParams.get("url") || mpdProxiedUrl;
    const mbToken = mpdParams.get("mbtoken") || "";

    // ── Codec compatibility check (BEFORE Shaka load) ──
    // The DASH manifest from mzfi/movieboxhd is HEVC (hev1.1.6.L150.90).
    // HEVC playback requires:
    //   - Safari (macOS/iOS): native ✓
    //   - Chrome/Edge with HEVC extension or hardware decoder on Windows ✓
    //   - Chrome on Linux/macOS, Firefox: ✗ (no native HEVC)
    // If we attempt Shaka load on an unsupported browser, Shaka throws
    // error 4032 (CODEC_NOT_SUPPORTED) after ~2s of trying — wasting UX time.
    // Pre-check via MediaSource.isTypeSupported to fail fast and fall back.
    const HEVC_MIME = 'video/mp4; codecs="hev1.1.6.L150.90"';
    const hevcSupported =
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported(HEVC_MIME);
    if (!hevcSupported) {
      console.warn("[NOBAR] HEVC not supported by this browser — falling back to MP4");
      return false;
    }

    const shaka = await import("shaka-player");

    // Destroy existing shaka instance if any
    if (shakaRef.current) {
      try { await shakaRef.current.destroy(); } catch {}
      shakaRef.current = null;
    }

    const player = new shaka.Player();
    shakaRef.current = player;
    // Use the modern attach() API (constructor-with-mediaElement is deprecated)
    await player.attach(video);

    // ── Hybrid P2P-CDN integration ──
    // If the user has toggled P2P ON (persisted in localStorage), instantiate
    // the ShakaP2PEngine. This hooks Shaka's networking engine to intercept
    // segment requests:
    //   - Critical zone (next 15s): always HTTP/CDN — zero stall risk
    //   - Swarm zone (15-21s ahead): try P2P via WebRTC, fallback to CDN
    // The engine connects to our self-hosted tracker (port 3003) AND public
    // WebTorrent trackers as fallback. Stats events flow back via the
    // useP2PStreaming hook (peers, p2pBytes, httpBytes, p2pRatio).
    let p2pEngine: any = null;
    if (p2pEnabled) {
      // Reset stats for fresh session
      resetStats();
      p2pEngine = await getP2PEngine(shaka);
      if (p2pEngine) {
        // bindShakaPlayer hooks the networking engine + registers event handlers.
        // Must be called BEFORE player.configure() so P2P overrides take effect.
        p2pEngine.bindShakaPlayer(player);
        console.log("[NOBAR-P2P] Engine bound to Shaka player — peers will be discovered via tracker");
      } else {
        console.warn("[NOBAR-P2P] Engine creation failed — falling back to CDN-only");
      }
    }

    // ── Player config: tune for smoothness ──
    player.configure({
      // ABR: start with safe bandwidth estimate, switch fast on dips
      abr: {
        enabled: true,
        switchInterval: 8,                   // don't switch more often than every 8s (avoid flapping)
        bandwidthUpgradeTarget: 0.85,       // only upgrade when 85% of next level
        bandwidthDowngradeTarget: 0.95,     // downgrade quickly when bandwidth tight
        defaultBandwidthEstimate: 1_000_000, // start assumption: 1 Mbps
        advanced: {
          minBytes: 32_768,
          fastHalfLife: 2,
          slowHalfLife: 5,
        },
      },
      streaming: {
        // Larger buffers = smoother playback on network blips
        bufferingGoal: 30,           // try to buffer 30s ahead
        rebufferingGoal: 4,           // need 4s buffered to resume from rebuffer
        bufferBehind: 30,            // drop buffer > 30s behind playhead
        // Retry on network errors (auto-recovery)
        retryParameters: {
          maxAttempts: 5,
          baseDelay: 1000,
          backoffFactor: 1.5,
          fuzzFactor: 0.5,
          timeout: 30000,
        },
      },
      manifest: {
        // Retry on manifest load failures
        retryParameters: {
          maxAttempts: 4,
          baseDelay: 1000,
          backoffFactor: 1.5,
          fuzzFactor: 0.5,
          timeout: 30000,
        },
      },
    });

    // ── Request filter: rewrite ALL hakunaymatata URLs through /api/proxy ──
    // This handles both the manifest fetch AND every chunk fetch.
    // Without this, relative chunk URLs in the MPD resolve against our proxy
    // path (/api/proxy) instead of the CDN — breaking chunk loading.
    player.getNetworkingEngine().registerRequestFilter(
      (type: any, request: any) => {
        if (typeof request.uris === "undefined") return;
        for (let i = 0; i < request.uris.length; i++) {
          const uri = request.uris[i];
          // Only rewrite URLs pointing at the CDN — leave /api/proxy URLs alone
          if (uri.includes("hakunaymatata.com")) {
            request.uris[i] =
              `/api/proxy?url=${encodeURIComponent(uri)}` +
              (mbToken ? `&mbtoken=${encodeURIComponent(mbToken)}` : "");
          }
        }
      }
    );

    // ── ABR tracking: expose current bitrate to UI ──
    player.addEventListener("abrchanged", (e: any) => {
      const bitrate = e?.newLevel?.bitrate || 0;
      setCurrentBitrate(bitrate);
    });

    try {
      await player.load(rawMpdUrl);
      console.log("[NOBAR] Shaka DASH loaded successfully");
      setUsingDash(true);
      return true;
    } catch (err: any) {
      console.warn("[NOBAR] Shaka load failed:", err?.code || err);
      // Cleanup failed shaka instance
      try { await player.destroy(); } catch {}
      shakaRef.current = null;
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSources([]);
    setDashSource(null);
    setActiveSource(null);
    setEmbedUrl(null);
    setUsingDash(false);

    fetch(streamUrl)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
        setDashSource(data.dashSource || null);
        // Lazy subtitle fetch: main /api/stream returns a single "Available"
        // placeholder URL. When user opens the subtitle menu, we fetch the
        // actual subtitle list from /api/stream/[id]/subtitles (separate
        // endpoint, avoids Vercel function timeout on the main stream call).
        const placeholderSubs = data.subtitles || [];
        if (placeholderSubs.length === 1 && placeholderSubs[0].language === "Available") {
          fetch(placeholderSubs[0].url)
            .then((r) => r.json())
            .then((subData) => {
              if (cancelled) return;
              const subs = (subData.subtitles || []).map((s: Subtitle) => ({
                language: s.language,
                url: s.url.startsWith("/api/") ? s.url : `/api/subtitle?url=${encodeURIComponent(s.url)}`,
              }));
              setSubtitles(subs);
            })
            .catch(() => {});
        } else {
          const subs = placeholderSubs.map((s: Subtitle) => ({
            language: s.language,
            url: s.url.startsWith("/api/") ? s.url : `/api/subtitle?url=${encodeURIComponent(s.url)}`,
          }));
          setSubtitles(subs);
        }

        // ── Source selection strategy ──
        // 1) Pre-select best MP4 source as fallback (Shaka may fail on HEVC)
        // 2) If DASH source available, attempt Shaka load (effect below)
        // 3) If Shaka succeeds → use DASH; if it fails → fall back to MP4
        //
        // We ALWAYS pick best MP4 up front because Shaka's HEVC check is
        // async — having MP4 pre-selected means zero-latency fallback if
        // Shaka bails (HEVC not supported by browser).
        if (data.sources?.length > 0) {
          const best = data.sources.reduce((b: StreamSource, s: StreamSource) =>
            parseInt(s.quality) > parseInt(b.quality) ? s : b
          );
          setActiveSource(best);
        }
        if (!data.dashSource?.url && data.sources?.length === 0 && data.embedUrl) {
          setEmbedUrl(data.embedUrl);
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
  }, [streamUrl, p2pReloadNonce]);

  // ── Initialize Shaka when dashSource arrives + video element is mounted ──
  useEffect(() => {
    if (!dashSource?.url) return;
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    (async () => {
      const ok = await loadShaka(dashSource.url);
      if (destroyed || !ok) return;
      // Mute + autoplay (browser policy: muted autoplay always allowed)
      video.muted = true;
      setMuted(true);
      try {
        await video.play();
        setPlaying(true);
      } catch {
        // Autoplay blocked — user must click play
        setPlaying(false);
      }
    })();

    return () => {
      destroyed = true;
      if (shakaRef.current) {
        try { shakaRef.current.destroy(); } catch {}
        shakaRef.current = null;
      }
      // Tear down P2P engine when video unmounts or stream changes
      destroyP2PEngine();
    };
  }, [dashSource, loadShaka]);

  // (P2P toggle handler is declared near the top of the component —
  //  see `p2pReloadNonce` state, which triggers the stream-fetch effect
  //  to re-initialize Shaka with the new P2P engine state when toggled.)


  // ── Video events (only for MP4 mode — Shaka handles its own) ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v || usingDash) return;
    if (!activeSource) return;

    // Force muted on load — browser blocks autoplay of unmuted videos.
    v.muted = true;
    setMuted(true);

    const notifyVideoTogether = () => {
      const ext = (window as any).videoTogetherExtension;
      if (ext && typeof ext.AddVideoListener === "function") {
        try { ext.AddVideoListener(v); } catch (e) { console.error("[NOBAR] VT failed:", e); }
      }
    };
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
    v.setAttribute("webkit-playsinline", "true");

    // Try autoplay after metadata loads
    const tryAutoplay = async () => {
      try {
        await v.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    };
    const autoplayTimer = setTimeout(tryAutoplay, 500);

    return () => {
      clearTimeout(vtRetry);
      clearTimeout(vtRetry2);
      clearTimeout(autoplayTimer);
      Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn));
    };
  }, [activeSource, usingDash]);

  // ── Video events for DASH mode (Shaka owns playback, we track state) ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !usingDash) return;

    const notifyVideoTogether = () => {
      const ext = (window as any).videoTogetherExtension;
      if (ext && typeof ext.AddVideoListener === "function") {
        try { ext.AddVideoListener(v); } catch (e) { console.error("[NOBAR] VT failed:", e); }
      }
    };
    notifyVideoTogether();
    const vtRetry = setTimeout(notifyVideoTogether, 1000);

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
    v.setAttribute("webkit-playsinline", "true");

    return () => {
      clearTimeout(vtRetry);
      Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn));
    };
  }, [usingDash]);

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
    (window as any).__watchPartySync?.(!v.paused, v.currentTime);
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (v) { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; }
  };
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen();
  };
  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) { v.currentTime = t; (window as any).__watchPartySync?.(!v.paused, t); }
  };
  const setVol = (vol: number) => {
    const v = videoRef.current;
    if (v) { v.volume = vol; v.muted = vol === 0; }
  };

  const changeQuality = (s: StreamSource) => {
    // Switch from DASH → MP4 (or between MP4 qualities)
    // Tear down Shaka if active
    if (shakaRef.current) {
      shakaRef.current.destroy().then(() => {
        shakaRef.current = null;
        setUsingDash(false);
        const v = videoRef.current;
        const t = v?.currentTime || 0;
        const wasPlaying = !v?.paused;
        setActiveSource(s);
        setShowSettings("");
        setTimeout(() => { if (v) { v.currentTime = t; if (wasPlaying) v.play(); } }, 200);
      });
    } else {
      const v = videoRef.current;
      const t = v?.currentTime || 0;
      const wasPlaying = !v?.paused;
      setActiveSource(s);
      setShowSettings("");
      setTimeout(() => { if (v) { v.currentTime = t; if (wasPlaying) v.play(); } }, 200);
    }
  };

  const switchToDash = () => {
    if (!dashSource) return;
    setActiveSource(null);
    setShowSettings("");
    // The effect [dashSource, loadShaka] won't re-fire because dashSource
    // didn't change. Manually trigger Shaka load.
    loadShaka(dashSource.url).then(ok => {
      if (ok) {
        const v = videoRef.current;
        if (v) {
          v.muted = true;
          v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        }
      }
    });
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  };

  const formatBitrate = (bps: number) => {
    if (!bps) return "";
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
    return `${Math.round(bps / 1000)} kbps`;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes < 1) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Loading
  if (loading) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading stream…</span>
      </div>
    );
  }

  // Embed fallback (only when no direct stream available)
  if (useEmbed && embedUrl) {
    return (
      <div className="space-y-2">
        <div className="relative bg-black aspect-video overflow-hidden rounded-lg">
          <iframe
            title={`${title} — Player`}
            className="absolute inset-0 w-full h-full"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        </div>
        <p className="text-xs text-gray-500">Embed player — direct stream not available for this title.</p>
      </div>
    );
  }

  // No stream at all
  if (!activeSource && !dashSource) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <p className="text-sm text-gray-400">Stream not available.</p>
      </div>
    );
  }

  // Native player — NO ADS, DASH adaptive OR direct MP4
  return (
    <div className="space-y-2">
      <div ref={containerRef} className="relative bg-black aspect-video overflow-hidden rounded-lg group" tabIndex={0}>
        <video
          ref={videoRef}
          src={usingDash ? undefined : activeSource?.url}
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

            {/* ABR indicator (DASH only) — shows current adaptive bitrate */}
            {usingDash && currentBitrate > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                <Wifi className="w-3 h-3" />
                {formatBitrate(currentBitrate)}
              </span>
            )}

            {/* P2P-CDN status pill (only when enabled) — shows live peer count + offload ratio */}
            {p2pEnabled && (
              <span
                className={`hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                  p2pStats.peers > 0
                    ? "text-fuchsia-300/90 bg-fuchsia-500/10 border-fuchsia-500/30"
                    : "text-amber-300/80 bg-amber-500/10 border-amber-500/30"
                }`}
                title={
                  p2pStats.peers > 0
                    ? `${p2pStats.peers} peer(s) connected · ${(p2pStats.p2pRatio * 100).toFixed(0)}% bandwidth offloaded from CDN`
                    : "P2P engine active — searching for peers via tracker"
                }
              >
                <Users className="w-3 h-3" />
                {p2pStats.peers > 0 ? `${p2pStats.peers}p · ${(p2pStats.p2pRatio * 100).toFixed(0)}%` : "searching"}
              </span>
            )}

            <div className="flex-1" />

            {/* P2P toggle button — opens settings panel with P2P controls */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(showSettings === "p2p" ? "" : "p2p")}
                className={`transition flex items-center gap-1 ${
                  p2pEnabled
                    ? "text-fuchsia-400 hover:text-fuchsia-300"
                    : "text-white hover:text-brand-500"
                }`}
                aria-label="P2P Settings"
                title="Hybrid P2P-CDN streaming"
              >
                <Zap className={`w-5 h-5 ${p2pEnabled ? "fill-fuchsia-400/30" : ""}`} />
              </button>
              {showSettings === "p2p" && (
                <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-3 min-w-[240px] z-20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
                      P2P-CDN Streaming
                    </span>
                    <button
                      onClick={toggleP2P}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        p2pEnabled ? "bg-fuchsia-500" : "bg-white/15"
                      }`}
                      role="switch"
                      aria-checked={p2pEnabled}
                      aria-label="Toggle P2P streaming"
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          p2pEnabled ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-snug mb-2">
                    Hybrid peer-to-peer delivery: critical segments from CDN,
                    future segments from peers via WebRTC. Saves bandwidth on
                    high-traffic titles.
                  </p>
                  <div className="space-y-1 text-[11px] font-mono border-t border-white/5 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3" /> Peers
                      </span>
                      <span className={p2pStats.peers > 0 ? "text-fuchsia-300" : "text-gray-500"}>
                        {p2pStats.peers}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">P2P downloaded</span>
                      <span className="text-fuchsia-300">{formatBytes(p2pStats.p2pBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">CDN downloaded</span>
                      <span className="text-gray-300">{formatBytes(p2pStats.httpBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-1 mt-1">
                      <span className="text-gray-300">Offload ratio</span>
                      <span className={p2pStats.p2pRatio > 0 ? "text-emerald-400" : "text-gray-500"}>
                        {(p2pStats.p2pRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    {p2pStats.lastError && (
                      <div className="text-amber-400 text-[10px] mt-1 leading-tight">
                        ⚠ {p2pStats.lastError.slice(0, 80)}
                      </div>
                    )}
                    {!p2pEnabled && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        Toggle ON to activate P2P engine.
                      </div>
                    )}
                    {p2pEnabled && p2pStats.peers === 0 && !p2pStats.lastError && (
                      <div className="text-[10px] text-amber-300/80 mt-1">
                        Connecting to tracker… no peers yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quality / source picker */}
            {(sources.length > 1 || (dashSource && !usingDash)) && (
              <div className="relative">
                <button onClick={() => setShowSettings(showSettings === "q" ? "" : "q")} className="text-white hover:text-brand-500 transition flex items-center gap-1">
                  <Settings className="w-5 h-5" />
                  <span className="text-xs">
                    {usingDash ? `Auto (${dashSource?.maxBitrate})` : activeSource?.quality}
                  </span>
                </button>
                {showSettings === "q" && (
                  <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[150px]">
                    {dashSource && (
                      <button
                        onClick={switchToDash}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition flex items-center gap-2 ${usingDash ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        Auto (DASH)
                        <span className="ml-auto text-[10px] text-gray-500">{dashSource.maxBitrate}</span>
                      </button>
                    )}
                    {sources.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => changeQuality(s)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${!usingDash && activeSource?.url === s.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {s.quality} <span className="text-[10px] text-gray-500">MP4</span>
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
      <div className="flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <span>
          ✓ Ad-free ·{" "}
          <span className="text-gray-300">{usingDash ? dashSource?.provider : activeSource?.provider}</span>
          {usingDash && dashSource ? ` · ${dashSource.maxBitrate} adaptive` : ` · ${activeSource?.quality}`}
        </span>
        {usingDash && (
          <span className="text-emerald-500/80">⚡ Adaptive streaming — auto-adjusts quality to your connection</span>
        )}
      </div>
    </div>
  );
}

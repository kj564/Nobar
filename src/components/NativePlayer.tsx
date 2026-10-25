"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles, Loader2, Gauge, Wifi } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// NativePlayer — buttery smooth playback via Shaka Player (DASH adaptive)
// + native <video> MP4 fallback.
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
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentBitrate, setCurrentBitrate] = useState<number>(0);  // for ABR indicator
  const [currentDashHeight, setCurrentDashHeight] = useState<number>(0); // current DASH resolution (e.g. 1080)
  const [dashQualities, setDashQualities] = useState<Array<{id: number, height: number, bandwidth: number}>>([]); // available DASH tracks
  const [abrEnabled, setAbrEnabled] = useState(true); // ABR auto-switch toggle

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shakaRef = useRef<any>(null);  // shaka.Player instance
  const hlsRef = useRef<any>(null);    // hls.js instance
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
  // DASH is currently disabled — skip loading shaka entirely to save bundle.
  // When DASH is re-enabled, uncomment the body below.
  useEffect(() => {
    // DASH disabled — don't load shaka-player
    return;
    /* eslint-disable no-unreachable */
    let cancelled = false;
    (async () => {
      try {
        // Cast to any — shaka-player's clutz-generated types are broken
        // and cause "Property 'polyfill' does not exist" build errors.
        // The runtime API is correct; only the .d.ts is wrong.
        const shaka: any = await import("shaka-player");
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

    const shaka: any = await import("shaka-player");

    // Destroy existing shaka instance if any
    if (shakaRef.current) {
      try { await shakaRef.current.destroy(); } catch {}
      shakaRef.current = null;
    }

    // ── Clear the MP4 src before Shaka takes over ──
    // The MP4 effect sets video.src = activeSource.url. Shaka's attach()
    // doesn't clear this — we must do it manually to prevent a conflict
    // between the MP4 progressive download and Shaka's MSE (MediaSource
    // Extensions) setup. Without this, the video can get stuck loading.
    video.pause();
    video.removeAttribute("src");
    video.load(); // reset to empty state

    const player = new shaka.Player();
    shakaRef.current = player;
    // Use the modern attach() API (constructor-with-mediaElement is deprecated)
    await player.attach(video);

    // ── Player config: tune for smoothness ──
    player.configure({
      // ABR: start with high bandwidth estimate so we START at 1080p
      // (was 1Mbps = starts at 480p, never upgrades fast enough through proxy)
      abr: {
        enabled: true,
        switchInterval: 4,                    // switch every 4s if needed (was 8s = too slow)
        bandwidthUpgradeTarget: 0.9,         // upgrade when 90% of next level
        bandwidthDowngradeTarget: 0.95,      // downgrade quickly when bandwidth tight
        defaultBandwidthEstimate: 5_000_000, // start assumption: 5 Mbps (enough for 1080p)
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

    // ── ABR tracking: expose current bitrate + resolution to UI ──
    // Shaka fires 'abrchanged' when ABR switches quality.
    // Event payload: { newLevel: Variant } where Variant has:
    //   - bandwidth (bits/sec) — NOT 'bitrate' (was the bug!)
    //   - height (pixels, e.g. 1080, 720, 480)
    //   - id (track ID for manual selection)
    const updateCurrentTrack = () => {
      try {
        const tracks = player.getVariantTracks();
        const active = tracks.find((t: any) => t.active);
        if (active) {
          setCurrentBitrate(active.bandwidth || 0);
          setCurrentDashHeight(active.height || 0);
        }
        // Expose all available DASH qualities for manual selection
        const qualities = tracks
          .map((t: any) => ({ id: t.id, height: t.height, bandwidth: t.bandwidth }))
          .sort((a: any, b: any) => b.height - a.height);
        setDashQualities(qualities);
      } catch {}
    };

    player.addEventListener("abrchanged", updateCurrentTrack);
    // Also poll on timeupdate — covers initial load + manual switches
    video.addEventListener("timeupdate", updateCurrentTrack);
    // Initial fetch after manifest loads
    setTimeout(updateCurrentTrack, 500);

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
        // DASH adaptive streaming is currently DISABLED — it has transition
        // bugs (DASH→MP4 fallback) and ABR tuning issues. Until fixed,
        // always use MP4 progressive. DASH source is still returned by the
        // API for future use, but we don't activate it here.
        //
        // To re-enable: uncomment the HEVC check + DASH branch below.
        /*
        const HEVC_MIME = 'video/mp4; codecs="hev1.1.6.L150.90"';
        const hevcSupported =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported(HEVC_MIME);
        if (hevcSupported && data.dashSource?.url) {
          // DASH will be loaded by the dedicated effect below (after videoRef mounts)
          // No need to set activeSource — Shaka owns the video element.
        } else if (data.sources?.length > 0) {
        */
        if (data.sources?.length > 0) {
          // Prefer HLS source (adaptive bitrate, best quality auto-switching)
          const hlsSource = data.sources.find((s: StreamSource) => s.type === "hls");
          if (hlsSource) {
            setActiveSource(hlsSource);
            console.log("[NOBAR] Using HLS source:", hlsSource.provider);
          } else {
            // Pick best MP4 quality (highest resolution number)
            const best = data.sources.reduce((b: StreamSource, s: StreamSource) =>
              parseInt(s.quality) > parseInt(b.quality) ? s : b
            );
            setActiveSource(best);
          }
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
  }, [streamUrl]);

  // ── Initialize Shaka when dashSource arrives + video element is mounted ──
  // DASH is currently DISABLED (see source selection strategy above).
  // This effect is a no-op until DASH is re-enabled.
  useEffect(() => {
    if (!dashSource?.url) return;
    // DASH disabled — skip Shaka load entirely
    // (kept for future re-enable; just uncomment the code below)
    return;
    /* eslint-disable no-unreachable */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ds = dashSource; // captured for future re-enable
    const video = videoRef.current;
    if (!video) return;

    let destroyed = false;
    // Show buffering spinner while Shaka loads — avoids black screen gap
    // between MP4 src being cleared and Shaka's MSE blob URL being set.
    setBuffering(true);

    (async () => {
      const ok = await loadShaka(ds!.url);
      if (destroyed || !ok || !video) {
        // Shaka failed — MP4 effect will re-fire and restore playback
        setBuffering(false);
        return;
      }
      // Mute + autoplay (browser policy: muted autoplay always allowed)
      video.muted = true;
      setMuted(true);
      try {
        await video.play();
        setPlaying(true);
        setBuffering(false);
      } catch {
        // Autoplay blocked — user must click play
        setPlaying(false);
        setBuffering(false);
      }
    })();

    return () => {
      destroyed = true;
      if (shakaRef.current) {
        try { shakaRef.current.destroy(); } catch {}
        shakaRef.current = null;
      }
    };
  }, [dashSource, loadShaka]);

  // ── Video events (MP4 + HLS mode — Shaka handles its own) ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v || usingDash) return;
    if (!activeSource) return;

    // ── Attach video event listeners FIRST (works for both MP4 and HLS) ──
    // HLS.js / native HLS set video.src which fires the same events as MP4.
    // Without these, time display = 0:00, duration = 0, play/pause broken.
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

    // ── HLS source: use hls.js for adaptive bitrate ──
    if (activeSource.type === "hls") {
      // Cleanup previous hls.js instance
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }

      // Native HLS support (Safari) — just set src
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = activeSource.url;
        v.load();
        console.log("[NOBAR] HLS native playback (Safari)");
        // Autoplay after metadata
        const t = setTimeout(async () => {
          try { await v.play(); setPlaying(true); } catch { setPlaying(false); }
        }, 500);
        return () => {
          clearTimeout(t);
          clearTimeout(vtRetry);
          clearTimeout(vtRetry2);
          Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn));
        };
      }

      // Use hls.js for Chrome/Firefox
      import("hls.js").then((Hls) => {
        const HlsClass = Hls.default || Hls;
        if (HlsClass.isSupported()) {
          const hls = new HlsClass({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            enableWorker: true,
            lowLatencyMode: false,
          });
          hls.loadSource(activeSource.url);
          hls.attachMedia(v);
          hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
            console.log("[NOBAR] HLS manifest loaded — starting playback");
            v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });
          hls.on(HlsClass.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              console.error("[NOBAR] HLS fatal error:", data.type, data.details);
              if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else {
                hls.destroy();
              }
            }
          });
          hlsRef.current = hls;
        }
      }).catch((err) => {
        console.error("[NOBAR] hls.js failed to load:", err);
        v.src = activeSource.url;
        v.load();
      });

      return () => {
        clearTimeout(vtRetry);
        clearTimeout(vtRetry2);
        Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn));
        if (hlsRef.current) {
          try { hlsRef.current.destroy(); } catch {}
          hlsRef.current = null;
        }
      };
    }

    // ── MP4 source: set src directly ──
    if (v.src !== activeSource.url) {
      v.src = activeSource.url;
      v.load(); // force reload with new src
    }

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
    setAbrEnabled(true); // re-enable ABR when switching to Auto mode
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

  // ── Manual DASH quality selection ──
  // When user picks a specific resolution in DASH mode:
  // 1. Disable ABR (so Shaka doesn't override the manual choice)
  // 2. Select the specific variant track
  // 3. Clear buffer to force immediate switch
  const selectDashQuality = (trackId: number) => {
    const player = shakaRef.current;
    if (!player) return;
    try {
      player.configure("abr.enabled", false);
      setAbrEnabled(false);
      const tracks = player.getVariantTracks();
      const track = tracks.find((t: any) => t.id === trackId);
      if (track) {
        player.selectVariantTrack(track, true); // clearBuffer=true
        setCurrentDashHeight(track.height || 0);
        setCurrentBitrate(track.bandwidth || 0);
        console.log(`[NOBAR] Manual DASH quality: ${track.height}p (${track.bandwidth}bps)`);
      }
    } catch (err) {
      console.warn("[NOBAR] Failed to select DASH quality:", err);
    }
    setShowSettings("");
  };

  // ── Re-enable ABR (switch back to Auto) ──
  const enableAutoDash = () => {
    const player = shakaRef.current;
    if (!player) return;
    try {
      player.configure("abr.enabled", true);
      setAbrEnabled(true);
      console.log("[NOBAR] ABR re-enabled — auto resolution switching");
    } catch {}
    setShowSettings("");
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

            {/* ABR indicator (DASH only) — shows current resolution + bitrate */}
            {usingDash && currentDashHeight > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                <Wifi className="w-3 h-3" />
                {currentDashHeight}p{abrEnabled ? " · auto" : " · locked"}
                {currentBitrate > 0 && ` · ${formatBitrate(currentBitrate)}`}
              </span>
            )}

            <div className="flex-1" />

            {/* Quality / source picker — always show when there are choices */}
            {(sources.length > 1 || dashSource) && (
              <div className="relative">
                <button onClick={() => setShowSettings(showSettings === "q" ? "" : "q")} className="text-white hover:text-brand-500 transition flex items-center gap-1">
                  <Settings className="w-5 h-5" />
                  <span className="text-xs">
                    {usingDash
                      ? (abrEnabled ? "Auto" : `${currentDashHeight}p`)
                      : activeSource?.quality}
                  </span>
                </button>
                {showSettings === "q" && (
                  <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[160px] max-h-72 overflow-y-auto scroll-row">
                    {/* DASH Auto option — ABR enabled */}
                    {dashSource && (
                      <button
                        onClick={usingDash && abrEnabled ? enableAutoDash : switchToDash}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition flex items-center gap-2 ${
                          usingDash && abrEnabled ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"
                        }`}
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        Auto
                        <span className="ml-auto text-[10px] text-gray-500">DASH</span>
                      </button>
                    )}
                    {/* DASH manual quality options (only when DASH is active) */}
                    {usingDash && dashQualities.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => selectDashQuality(q.id)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition flex items-center gap-2 ${
                          !abrEnabled && currentDashHeight === q.height
                            ? "bg-brand-500/20 text-brand-500"
                            : "text-gray-300 hover:bg-white/5"
                        }`}
                      >
                        <span className="w-3.5 h-3.5 flex items-center justify-center">
                          {!abrEnabled && currentDashHeight === q.height ? "●" : ""}
                        </span>
                        {q.height}p
                        <span className="ml-auto text-[10px] text-gray-500">{formatBitrate(q.bandwidth)}</span>
                      </button>
                    ))}
                    {/* Divider between DASH and MP4 options */}
                    {usingDash && sources.length > 0 && (
                      <div className="border-t border-white/10 my-1" />
                    )}
                    {/* MP4 qualities */}
                    {sources.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => changeQuality(s)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${
                          !usingDash && activeSource?.url === s.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"
                        }`}
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
          {usingDash && dashSource
            ? ` · ${currentDashHeight > 0 ? currentDashHeight + 'p' : dashSource.maxBitrate}${abrEnabled ? ' (auto)' : ' (locked)'}`
            : ` · ${activeSource?.quality}`}
        </span>
        {usingDash && abrEnabled && (
          <span className="text-emerald-500/80">⚡ Adaptive — auto-adjusts quality to your connection</span>
        )}
        {usingDash && !abrEnabled && (
          <span className="text-amber-500/80">🔒 Quality locked — click Auto to re-enable adaptive</span>
        )}
      </div>
    </div>
  );
}

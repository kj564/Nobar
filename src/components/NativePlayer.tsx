"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles, Loader2, Gauge, Wifi } from "lucide-react";
import { resolveStream, resolveIdlix, buildIdlixSlug, isStaticMode } from "@/lib/cdn-proxy";

// Build a subtitle proxy URL that routes through the cdn-proxy Worker's
// /subtitle endpoint. This converts SRT → WebVTT on the fly (browsers
// reject .srt for <track> elements).
const CDN_PROXY_URL = process.env.NEXT_PUBLIC_CDN_PROXY_URL || "";
const CDN_PROXY_PORT = "3003";
function proxySubtitleUrl(subtitleUrl: string): string {
  const proxyPath = `/subtitle?url=${encodeURIComponent(subtitleUrl)}`;
  if (isStaticMode && CDN_PROXY_URL) {
    return `${CDN_PROXY_URL}${proxyPath}`;
  }
  // Dev mode: use Next.js rewrite via XTransformPort
  const sep = proxyPath.includes("?") ? "&" : "?";
  return `${proxyPath}${sep}XTransformPort=${CDN_PROXY_PORT}`;
}

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

type CloudFrontAuth = {
  policy: string;
  signature: string;
  keyPairId: string;
};

type StreamSource = {
  quality: string;
  url: string;
  provider: string;
  type: string;
  // For hls-direct sources: CloudFront auth values to inject into .ts
  // segment URLs via hls.js custom fLoader. Lets browser fetch segments
  // DIRECTLY from sacdn.hakunaymatata.com (CORS-open) — zero Vercel egress.
  auth?: CloudFrontAuth;
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
  year?: string;
};

export function NativePlayer({ tmdbId, title, kind = "movie", season, episode, year }: NativePlayerProps) {
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

  // Mobile UX state: controls visibility + auto-hide
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls after 3s of inactivity (mobile pattern).
  // Only auto-hide when playing + not in settings menu.
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing && !showSettings) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        setShowSettings("");
      }, 3000);
    }
  }, [playing, showSettings]);
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
  // NOTE: streamUrl is used as fallback for dev mode. In CDN proxy mode,
  // resolveStream() from cdn-proxy.ts is used instead (see below).

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
        const shaka: any = null; // shaka-player removed (DASH disabled)
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

    const shaka: any = null; // shaka-player removed (DASH disabled)

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

    // Use CDN proxy resolver (works in both dev + GitHub Pages static mode).
    // Pass title + year so the resolver can try lk21 as a fallback source
    // when vidlink.pro has no HLS stream for this title.
    resolveStream(tmdbId, kind, season, episode, title, year)
      .then(async (data) => {
        if (cancelled) return;
        
        // If CDN proxy returned an embedUrl (Idlix fallback for MP4-only movies)
        if (data.embedUrl) {
          setEmbedUrl(data.embedUrl);
          setUseEmbed(true);
          setLoading(false);
          return;
        }
        
        setSources(data.sources || []);
        setDashSource(null); // DASH not supported in static mode (needs /api/proxy)
        // Subtitle URL handling:
        // vidlink.pro returns .srt files on cacdn.hakunaymatata.com. Browsers
        // reject .srt for <track> elements (require WebVTT). We route ALL
        // subtitle URLs through the cdn-proxy /subtitle endpoint which:
        //   1. Fetches the .srt from cacdn (CORS-open)
        //   2. Converts SRT → WebVTT (adds WEBVTT header, converts ,→. in timestamps)
        //   3. Returns with Content-Type: text/vtt + CORS headers
        // This makes subtitles render correctly in the native <video> player.
        const normalizeSub = (s: Subtitle): Subtitle => {
          if (s.url.includes("cacdn.hakunaymatata.com") || s.url.endsWith(".srt") || s.url.includes(".srt?")) {
            // Route through /subtitle proxy for SRT→VTT conversion.
            return { ...s, url: proxySubtitleUrl(s.url) };
          }
          if (s.url.startsWith("http") || s.url.startsWith("//")) return s; // already VTT
          return s;
        };
        const subs = (data.subtitles || []).map(normalizeSub);
        setSubtitles(subs);

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
          // Source priority: hls-direct (zero-egress, vidlink.pro) > hls (proxied) > mp4
          // hls-direct fetches .ts segments directly from sacdn.hakunaymatata.com
          // via CloudFront signed URL query auth (no /api/proxy needed).
          const hlsDirectSource = data.sources.find((s: StreamSource) => s.type === "hls-direct");
          const hlsSource = data.sources.find((s: StreamSource) => s.type === "hls");
          const pickedHls = hlsDirectSource || hlsSource;
          if (pickedHls) {
            setActiveSource(pickedHls);
            console.log("[NOBAR] Using HLS source:", pickedHls.provider, "(", pickedHls.type, ")");
          } else {
            // Pick best MP4 quality (highest resolution number)
            const best = data.sources.reduce((b: StreamSource, s: StreamSource) =>
              parseInt(s.quality) > parseInt(b.quality) ? s : b
            );
            setActiveSource(best);
          }
        }
        if (!data.sources?.length) {
          // No direct sources — try Idlix vidhide embed fallback (movies only)
          if (kind === "movie") {
            // Need title + year for slug — fetch from TMDB (CORS-open, direct browser call)
            try {
              const tmdbRes = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY || ""}`,
                { signal: AbortSignal.timeout(5000) }
              );
              if (tmdbRes.ok) {
                const tmdbData = await tmdbRes.json();
                const title = tmdbData.title || tmdbData.name || "";
                const year = (tmdbData.release_date || "").slice(0, 4);
                if (title && year) {
                  const slug = buildIdlixSlug(title, year);
                  const embedUrl = await resolveIdlix(slug);
                  if (embedUrl) {
                    setEmbedUrl(embedUrl);
                    setUseEmbed(true);
                    console.log("[NOBAR] Idlix vidhide embed:", slug);
                  }
                }
              }
            } catch (e) {
              console.warn("[NOBAR] Idlix fallback failed:", e);
            }
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Last resort: vidlink.pro embed iframe
        setEmbedUrl(kind === "tv" && season && episode
          ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${tmdbId}`
        );
        setUseEmbed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tmdbId, kind, season, episode]);

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
    //
    // AUTOPLAY POLICY: Browsers block unmuted autoplay without user gesture.
    // We start MUTED (guaranteed to autoplay), then the user clicks unmute.
    // This is the standard pattern (YouTube, Netflix, etc. all do this).
    v.muted = true;
    v.volume = 0.7;  // 70% volume (ready for when user unmutes)
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

    const handlers: Record<string, () => void> = {
      timeupdate: () => setCurrentTime(v.currentTime),
      durationchange: () => setDuration(v.duration || 0),
      play: () => { setPlaying(true); setBuffering(false); },
      pause: () => setPlaying(false),
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      canplay: () => setBuffering(false),
      volumechange: () => { setMuted(v.muted); setVolume(v.volume); },
      // ERROR RECOVERY: if MP4 source fails (bcdnxw 429, network error),
      // auto-fallback to vidlink embed (has ads, but at least plays).
      error: () => {
        const e = v.error;
        if (!e) return;
        console.warn("[NOBAR] Video error:", e.code, "src="+v.src.slice(0,60));
        // Code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (bcdnxw 429, format issue, etc.)
        // Code 2 = MEDIA_ERR_NETWORK
        // Only fallback once — don't infinite loop.
        if (!useEmbed && !embedUrl) {
          console.log("[NOBAR] Auto-fallback to vidlink embed");
          const fb = kind === "tv" && season && episode
            ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
            : `https://vidlink.pro/movie/${tmdbId}`;
          setEmbedUrl(fb);
          setUseEmbed(true);
          setLoading(false);
        }
      },
    };
    Object.entries(handlers).forEach(([e, fn]) => v.addEventListener(e, fn as EventListener));
    v.setAttribute("webkit-playsinline", "true");

    // ── HLS source: use hls.js for adaptive bitrate ──
    // hls-direct = vidlink.pro zero-egress path (CloudFront signed URL query auth)
    // hls        = proxied HLS (vidsrc.buzz etc. — goes through /api/proxy)
    const isHlsDirect = activeSource.type === "hls-direct";
    const hasAuth = !!(activeSource as any).auth;

    // On iOS Safari, use NATIVE HLS when possible (no blob URL = better battery +
    // smoother playback). Only use hls.js when we NEED custom fLoader (vidlink
    // CloudFront auth injection). lk21 HLS is CORS-open → native works!
    const canNativeHls = v.canPlayType("application/vnd.apple.mpegurl") === "probably";
    const useNativeHls = canNativeHls && (!isHlsDirect || !hasAuth);

    if (activeSource.type === "hls" || isHlsDirect) {
      // Cleanup previous hls.js instance
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }

      // Native HLS (Safari/iOS) — no blob URL, better battery, smoother.
      // Works for: lk21 HLS (CORS-open, no auth needed)
      // Does NOT work for: vidlink HLS (needs CloudFront auth in segment URLs)
      if (useNativeHls) {
        v.src = activeSource.url;
        v.load();
        console.log("[NOBAR] HLS native playback (Safari/iOS)");
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

      // Use hls.js for Chrome/Firefox (and hls-direct on all browsers).
      // For hls-direct, we register a custom fragment loader that appends
      // CloudFront auth (?Policy=...&Signature=...&Key-Pair-Id=...) to every
      // .ts segment URL before the XHR fires. The m3u8 itself already has
      // the auth in its URL (so manifest loads fine), but relative segment
      // URLs in the m3u8 resolve WITHOUT inheriting the query params (per
      // URL resolution rules) — so we must re-inject for each segment.
      import("hls.js").then((Hls) => {
        const HlsClass = Hls.default || Hls;
        if (HlsClass.isSupported()) {
          // ── Build hls.js config (tuned for fast start + smooth playback) ──
          const hlsConfig: any = {
            // Buffering: smaller initial buffer = faster playback start.
            maxBufferLength: 10,        // start playback after 10s buffered (was 30)
            maxMaxBufferLength: 30,     // allow up to 30s if bandwidth allows (was 60)
            enableWorker: true,
            lowLatencyMode: false,
            startLevel: -1,             // -1 = auto (hls.js picks based on bandwidth)
            abrEwmaDefaultEstimate: 2_000_000,  // assume 2 Mbps initial
            backBufferLength: 30,        // keep 30s behind playhead (default 90s)
            manifestLoadingTimeOut: 10000,
            manifestLoadingMaxRetry: 2,
            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 4,
            fragLoadingRetryDelay: 500,
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.withCredentials = false;
            },
            // iOS Safari compatibility: use ManagedMediaSource when available,
            // and don't use MSE for native HLS-capable browsers.
            // iOS Safari can play HLS natively — we should use native playback
            // instead of hls.js for better performance + battery life.
            // (Handled below: check v.canPlayType before hls.js)
          };

          if (isHlsDirect && activeSource.auth) {
            const auth = activeSource.auth;
            const authQuery =
              "?Policy=" + auth.policy +
              "&Signature=" + auth.signature +
              "&Key-Pair-Id=" + auth.keyPairId;

            // Custom fragment loader: subclass the default loader and
            // rewrite segment URLs BEFORE the XHR is opened.
            // hls.js's DefaultConfig.loader is the standard XHR loader.
            // We override .load() to mutate context.url for .ts segments.
            class AuthInjectLoader extends HlsClass.DefaultConfig.loader {
              load(context: any, config: any, callbacks: any) {
                if (
                  context.url &&
                  context.url.includes(".ts") &&
                  !context.url.includes("Policy=")
                ) {
                  const sep = context.url.includes("?") ? "&" : "?";
                  // Drop any existing query (shouldn't have one for relative .ts)
                  // and append our auth query.
                  context.url = context.url + sep + authQuery.slice(1);
                }
                super.load(context, config, callbacks);
              }
            }
            hlsConfig.fLoader = AuthInjectLoader;
            console.log("[NOBAR] HLS direct mode — custom fLoader will inject CloudFront auth into .ts URLs");
          }

          const hls = new HlsClass(hlsConfig);
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

  // ── Subtitle track registry: create empty tracks on load, fetch VTT lazily ──
  // OPTIMIZATION: Previously we fetched ALL 15 VTT files on page load
  // (each 50-200KB → 1-3MB total, 5-10s delay). Now we:
  //   1. Create empty TextTracks immediately (instant, no network)
  //   2. Fetch + parse VTT ONLY when user selects that language
  //   3. Cache parsed cues so re-selecting is instant
  //
  // This drops initial load from 15 fetches to 0. User only pays for the
  // subtitle they actually use (~1 fetch, ~200KB).
  const loadedSubsRef = useRef<Map<string, TextTrack>>(new Map());
  const loadingSubsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeSource || subtitles.length === 0) return;

    // Clear old tracks from previous source.
    const existingManualCount = (v as any)._manualSubCount || 0;
    for (let i = 0; i < existingManualCount; i++) {
      try { v.removeChild(v.textTracks[v.textTracks.length - 1] as any); } catch {}
    }
    (v as any)._manualSubCount = 0;
    loadedSubsRef.current.clear();
    loadingSubsRef.current.clear();

    // Create empty TextTracks — instant, no network fetch.
    // Cues will be added on-demand when user selects this language.
    for (const sub of subtitles) {
      const track = v.addTextTrack("subtitles", sub.language, sub.language.toLowerCase().slice(0, 2));
      track.mode = "disabled";
      loadedSubsRef.current.set(sub.url, track);
    }
    (v as any)._manualSubCount = subtitles.length;
    console.log(`[NOBAR] Created ${subtitles.length} subtitle tracks (lazy-load on select)`);
  }, [subtitles, activeSource]);

  // Load a single subtitle's VTT + add cues. Called when user clicks a language.
  // Cached: once loaded, re-selecting is instant (track already has cues).
  const loadSubtitleCues = useCallback(async (subUrl: string, language: string) => {
    const track = loadedSubsRef.current.get(subUrl);
    if (!track) return;
    // Already loaded (has cues)?
    if (track.cues && track.cues.length > 0) return;
    // Already loading? (avoid duplicate fetch)
    if (loadingSubsRef.current.has(subUrl)) return;
    loadingSubsRef.current.add(subUrl);

    try {
      const sub = subtitles.find(s => s.url === subUrl);
      if (!sub) return;
      const res = await fetch(sub.url);
      if (!res.ok) return;
      const vtt = await res.text();

      // Parse VTT cues (same logic as before, just deferred to here).
      const lines = vtt.split("\n");
      let i = 0;
      while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE") || /^\d+$/.test(line)) {
          i++;
          continue;
        }
        const tsMatch = line.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
        if (tsMatch) {
          const start = (+tsMatch[1]) * 3600 + (+tsMatch[2]) * 60 + (+tsMatch[3]) + (+tsMatch[4]) / 1000;
          const end = (+tsMatch[5]) * 3600 + (+tsMatch[6]) * 60 + (+tsMatch[7]) + (+tsMatch[8]) / 1000;
          const textLines: string[] = [];
          i++;
          while (i < lines.length && lines[i].trim() && !lines[i].includes("-->")) {
            textLines.push(lines[i].trim());
            i++;
          }
          const text = textLines.join("\n");
          if (text) {
            try { track.addCue(new VTTCue(start, end, text)); } catch {}
          }
        } else {
          i++;
        }
      }
      console.log(`[NOBAR] Loaded ${track.cues?.length || 0} cues for ${language} (lazy)`);
    } catch (e) {
      console.warn(`[NOBAR] Failed to load subtitle ${language}:`, e);
    } finally {
      loadingSubsRef.current.delete(subUrl);
    }
  }, [subtitles]);

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
    if (v) { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; setMuted(v.muted); }
  };
  const toggleFullscreen = () => {
    const el = containerRef.current; if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      // Unlock orientation on exit
      if (screen.orientation?.unlock) screen.orientation.unlock();
    } else {
      el.requestFullscreen?.() || (el as any).webkitRequestFullscreen?.();
      // Lock to landscape on mobile for better viewing
      if (isTouchDevice && screen.orientation?.lock) {
        screen.orientation.lock("landscape").catch(() => {});
      }
    }
  };
  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) { v.currentTime = t; (window as any).__watchPartySync?.(!v.paused, t); }
  };
  const setVol = (vol: number) => {
    const v = videoRef.current;
    if (v) { v.volume = vol; v.muted = vol === 0; setMuted(vol === 0); }
  };

  // Mobile: tap to toggle controls (not play/pause — play/pause is the center button).
  // On desktop: click still toggles play (existing behavior).
  const handleVideoTap = useCallback(() => {
    if (isTouchDevice) {
      // Mobile: tap = toggle controls visibility
      setControlsVisible((prev) => {
        const next = !prev;
        if (next) {
          // Showed controls → start auto-hide timer
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          if (playing) {
            controlsTimeoutRef.current = setTimeout(() => {
              setControlsVisible(false);
              setShowSettings("");
            }, 3000);
          }
        }
        return next;
      });
    } else {
      // Desktop: click = play/pause
      togglePlay();
    }
  }, [isTouchDevice, playing, togglePlay]);

  // Auto-show controls when playback state changes (pause → show, play → auto-hide).
  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      showControls();
    }
  }, [playing, showControls]);

  // Track fullscreen state changes (user can exit via ESC / system UI).
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

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

  // Buffered percentage — how much of the video is pre-loaded ahead of playhead.
  // Reads from video.buffered (TimeRanges), finds the range containing currentTime.
  const bufferedPercent = (() => {
    const v = videoRef.current;
    if (!v || !duration) return 0;
    try {
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= currentTime && v.buffered.end(i) >= currentTime) {
          return (v.buffered.end(i) / duration) * 100;
        }
      }
      // No range contains currentTime — use last buffered end.
      if (v.buffered.length > 0) {
        return (v.buffered.end(v.buffered.length - 1) / duration) * 100;
      }
    } catch {}
    return 0;
  })();

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

  // Native player — NO ADS, mobile-first UI
  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`relative bg-black overflow-hidden rounded-lg group select-none ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : "aspect-video"}`}
        tabIndex={0}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onClick={handleVideoTap}
          onDoubleClick={!isTouchDevice ? toggleFullscreen : undefined}
          onTouchStart={isTouchDevice ? (e) => { e.preventDefault(); showControls(); } : undefined}
          playsInline
          autoPlay
          muted
          preload="auto"
        />

        {/* Buffering spinner */}
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
          </div>
        )}

        {/* Play button — CENTERED, not full overlay (was 342x192px = entire video) */}
        {!playing && !buffering && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            onClick={togglePlay}
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-2xl transition-transform hover:scale-110 pointer-events-none">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white ml-1" />
            </div>
          </div>
        )}

        {/* Controls bar — mobile: tap to show/hide + auto-hide after 3s */}
        {/* Desktop: hover to show (group-hover) */}
        {/* Mobile: controlsVisible state controls visibility */}
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 sm:px-4 pt-16 sm:pt-12 pb-2 transition-opacity duration-200 ${
            isTouchDevice
              ? controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
              : "opacity-0 group-hover:opacity-100"
          }`}
          onPointerMove={() => showControls()}
        >
          {/* Seek bar — bigger touch target on mobile (h-2.5 vs h-1.5) */}
          <div
            className="relative w-full h-2.5 sm:h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer touch-none"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - rect.left) / rect.width) * duration);
              showControls();
            }}
          >
            {/* Buffered (light gray) */}
            <div
              className="absolute top-0 left-0 h-full bg-white/30 rounded-full"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progress (brand color) */}
            <div className="absolute top-0 left-0 h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
            {/* Thumb — bigger on mobile (w-4 h-4 vs w-3 h-3), always visible on touch */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-opacity ${
                isTouchDevice ? "w-4 h-4 opacity-100" : "w-3 h-3 opacity-0 group-hover:opacity-100"
              }`}
              style={{ left: `calc(${progress}% - ${isTouchDevice ? "8px" : "6px"})` }}
            />
          </div>

          {/* Control buttons row — bigger touch targets on mobile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause — 44px touch target */}
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); showControls(); }}
              className="text-white hover:text-brand-500 transition p-2 -m-2 touch-manipulation"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="w-6 h-6 sm:w-5 sm:h-5" /> : <Play className="w-6 h-6 sm:w-5 sm:h-5 fill-white" />}
            </button>

            {/* Volume — hidden on mobile (hardware volume), shown on desktop */}
            {!isTouchDevice && (
              <div className="flex items-center gap-2 group/vol">
                <button onClick={toggleMute} className="text-white hover:text-brand-500 transition" aria-label="Mute">
                  {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(Number(e.target.value))}
                  className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-brand-500 cursor-pointer"
                />
              </div>
            )}

            {/* Mute toggle for mobile (compact, no slider) */}
            {isTouchDevice && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleMute(); showControls(); }}
                className="text-white p-2 -m-2 touch-manipulation"
                aria-label="Mute"
              >
                {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
            )}

            {/* Time display */}
            <div className="text-xs sm:text-sm text-white/80 font-mono whitespace-nowrap">
              {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
            </div>

            {/* ABR indicator (DASH only) */}
            {usingDash && currentDashHeight > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                <Wifi className="w-3 h-3" />
                {currentDashHeight}p{abrEnabled ? " · auto" : " · locked"}
              </span>
            )}

            <div className="flex-1" />

            {/* Quality picker */}
            {(sources.length > 1 || dashSource) && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSettings(showSettings === "q" ? "" : "q"); showControls(); }}
                  className="text-white hover:text-brand-500 transition flex items-center gap-1 p-2 -m-2 touch-manipulation"
                  aria-label="Quality"
                >
                  <Settings className="w-6 h-6 sm:w-5 sm:h-5" />
                  <span className="text-xs hidden sm:inline">
                    {usingDash ? (abrEnabled ? "Auto" : `${currentDashHeight}p`) : activeSource?.quality}
                  </span>
                </button>
                {showSettings === "q" && (
                  <div className="absolute bottom-10 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[140px] max-h-72 overflow-y-auto scroll-row z-20">
                    {dashSource && (
                      <button
                        onClick={() => { usingDash && abrEnabled ? enableAutoDash() : switchToDash(); }}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition flex items-center gap-2 ${usingDash && abrEnabled ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        <Gauge className="w-3.5 h-3.5" /> Auto
                      </button>
                    )}
                    {usingDash && dashQualities.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => selectDashQuality(q.id)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition ${!abrEnabled && currentDashHeight === q.height ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {q.height}p <span className="ml-auto text-[10px] text-gray-500">{formatBitrate(q.bandwidth)}</span>
                      </button>
                    ))}
                    {sources.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => changeQuality(s)}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition ${!usingDash && activeSource?.url === s.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {s.quality} <span className="text-[10px] text-gray-500">MP4</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtitles */}
            {subtitles.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSettings(showSettings === "s" ? "" : "s"); showControls(); }}
                  className={`text-white transition flex items-center gap-1 p-2 -m-2 touch-manipulation ${activeSubtitle ? "text-brand-400" : ""}`}
                  aria-label="Subtitles"
                >
                  <Subtitles className="w-6 h-6 sm:w-5 sm:h-5" />
                  {activeSubtitle && <span className="text-[10px] text-brand-400 hidden sm:inline">ON</span>}
                </button>
                {showSettings === "s" && (
                  <div className="absolute bottom-10 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 min-w-[140px] max-h-60 overflow-y-auto scroll-row z-20">
                    <button
                      onClick={() => {
                        setActiveSubtitle(null);
                        const v = videoRef.current;
                        if (v) { for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled"; }
                        setShowSettings("");
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition ${!activeSubtitle ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                    >
                      Off
                    </button>
                    {subtitles.map((sub, i) => (
                      <button
                        key={i}
                        onClick={async () => {
                          setActiveSubtitle(sub.url);
                          const v = videoRef.current;
                          if (v) {
                            for (let j = 0; j < v.textTracks.length; j++) v.textTracks[j].mode = "disabled";
                            const track = loadedSubsRef.current.get(sub.url);
                            if (track) {
                              track.mode = "showing";
                              loadSubtitleCues(sub.url, sub.language);
                            }
                          }
                          setShowSettings("");
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition ${activeSubtitle === sub.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {sub.language}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white hover:text-brand-500 transition p-2 -m-2 touch-manipulation"
              aria-label="Fullscreen"
            >
              <Maximize className="w-6 h-6 sm:w-5 sm:h-5" />
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
            ? ` · ${currentDashHeight > 0 ? currentDashHeight + "p" : dashSource.maxBitrate}${abrEnabled ? " (auto)" : " (locked)"}`
            : ` · ${activeSource?.quality}`}
        </span>
      </div>
    </div>
  );
}

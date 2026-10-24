"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

// vidstack must be loaded client-side only — it accesses `screen.orientation`
// during module init, which fails on SSR. Parent (NativePlayer.tsx) wraps
// this component with next/dynamic ssr:false.
import {
  MediaPlayer,
  MediaProvider,
  Track,
} from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

// ─────────────────────────────────────────────────────────────────────
// VidstackPlayerClient — vidstack.js powered player.
//
// vidstack handles natively:
//   - DASH adaptive (HEVC, MPD with ABR auto-switching)
//   - MP4 progressive (Range/seek support)
//   - Subtitle menu (VTT/SRT)
//   - Quality menu (auto + manual)
//   - Keyboard shortcuts (space, arrows, m, f)
//   - Mobile gestures (tap, swipe)
//   - Buffering spinner + poster
//   - Fullscreen + PiP
//
// We keep:
//   - Stream source fetching (/api/stream/{id})
//   - HEVC codec detection (DASH only if supported, else MP4)
//   - Subtitle lazy fetch (separate endpoint to avoid stream API timeout)
//   - VideoTogether extension hook (watch party)
//   - Preconnect hints (instant first byte)
//   - Watch party sync broadcast
//   - Embed iframe fallback when no direct source available
// ─────────────────────────────────────────────────────────────────────

type StreamSource = {
  quality: string;
  url: string;
  provider: string;
  type: string;
};

type DashSource = {
  url: string;
  provider: string;
  maxBitrate: string;
  codec: string;
};

type Subtitle = {
  language: string;
  url: string;
};

type VidstackPlayerClientProps = {
  tmdbId: number;
  title: string;
  kind?: "movie" | "tv";
  season?: number;
  episode?: number;
};

export function VidstackPlayerClient({ tmdbId, title, kind = "movie", season, episode }: VidstackPlayerClientProps) {
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [dashSource, setDashSource] = useState<DashSource | null>(null);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [useEmbed, setUseEmbed] = useState(false);

  const playerRef = useRef<any>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const streamUrl = kind === "tv" && season && episode
    ? `/api/stream/${tmdbId}?kind=tv&season=${season}&episode=${episode}`
    : `/api/stream/${tmdbId}`;

  // ── Preconnect to CDN domains on mount → instant first byte ──
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

  // ── Fetch stream sources from API ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSources([]);
    setDashSource(null);
    setActiveSrc(null);
    setEmbedUrl(null);
    setSubtitles([]);

    fetch(streamUrl)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
        setDashSource(data.dashSource || null);

        // Lazy subtitle fetch: main /api/stream returns a single "Available"
        // placeholder URL. Fetch actual subtitle list on-demand (separate
        // endpoint, avoids Vercel function timeout on main stream call).
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
        // 1) Pre-check HEVC codec support (DASH adaptive, smoothest)
        // 2) If HEVC supported → use DASH source (vidstack handles ABR)
        // 3) If HEVC not supported → use best MP4 source (1080p)
        // 4) If neither → embed iframe fallback
        const HEVC_MIME = 'video/mp4; codecs="hev1.1.6.L150.90"';
        const hevcSupported =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported(HEVC_MIME);

        if (hevcSupported && data.dashSource?.url) {
          // Vidstack will auto-handle ABR via its DASH provider.
          // Source URL is already /api/proxy?url=...&mbtoken=... which injects
          // X-MB-Token header for sbcdnw.hakunaymatata.com.
          setActiveSrc(data.dashSource.url);
          console.log("[NOBAR] Using DASH adaptive source:", data.dashSource.maxBitrate);
        } else if (data.sources?.length > 0) {
          // Pick best MP4 quality (highest resolution number)
          const best = data.sources.reduce((b: StreamSource, s: StreamSource) =>
            parseInt(s.quality) > parseInt(b.quality) ? s : b
          );
          setActiveSrc(best.url);
          if (!hevcSupported && data.dashSource) {
            console.log("[NOBAR] HEVC not supported — using MP4 fallback:", best.quality);
          }
        } else if (data.embedUrl) {
          setEmbedUrl(data.embedUrl);
          setUseEmbed(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Last-resort embed fallback
        setEmbedUrl(kind === "tv" && season && episode
          ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${tmdbId}`
        );
        setUseEmbed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [streamUrl]);

  // ── VideoTogether extension hook (watch party) ──
  // VT needs to attach to the underlying <video> element. Vidstack creates
  // the <video> inside MediaProvider — we query it after can-play.
  const notifyVideoTogether = useCallback(() => {
    const ext = (window as any).videoTogetherExtension;
    const video = videoElRef.current || document.querySelector("video");
    if (ext && typeof ext.AddVideoListener === "function" && video) {
      try { ext.AddVideoListener(video); } catch (e) { console.error("[NOBAR] VT failed:", e); }
    }
  }, []);

  useEffect(() => {
    // Try immediately + retry after delays (VT extension may load late)
    notifyVideoTogether();
    const t1 = setTimeout(notifyVideoTogether, 1500);
    const t2 = setTimeout(notifyVideoTogether, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeSrc, notifyVideoTogether]);

  // ── Watch party sync broadcast ──
  // When user plays/pauses/seeks, broadcast to watch party via the
  // __watchPartySync global hook (consumed by WatchPartyButton).
  const broadcastSync = useCallback((playing: boolean, time: number) => {
    (window as any).__watchPartySync?.(playing, time);
  }, []);

  const handleCanPlay = useCallback(() => {
    // Capture video element for VT hook
    videoElRef.current = playerRef.current?.el?.querySelector("video") || null;
    notifyVideoTogether();
  }, [notifyVideoTogether]);

  const handlePlay = useCallback(() => {
    const v = videoElRef.current;
    if (v) broadcastSync(true, v.currentTime);
  }, [broadcastSync]);

  const handlePause = useCallback(() => {
    const v = videoElRef.current;
    if (v) broadcastSync(false, v.currentTime);
  }, [broadcastSync]);

  const handleSeeked = useCallback(() => {
    const v = videoElRef.current;
    if (v) broadcastSync(!v.paused, v.currentTime);
  }, [broadcastSync]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading stream…</span>
      </div>
    );
  }

  // ── Embed fallback (iframe) — when no direct stream available ──
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

  // ── No stream at all ──
  if (!activeSrc) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <p className="text-sm text-gray-400">Stream not available.</p>
      </div>
    );
  }

  // ── vidstack player ──
  // Vidstack handles all the heavy lifting: ABR for DASH, seek/Range for MP4,
  // subtitle menu, quality menu, keyboard shortcuts, mobile gestures,
  // buffering spinner, poster, fullscreen, PiP.
  const isDashSource = dashSource?.url === activeSrc;

  return (
    <div className="space-y-2">
      <MediaPlayer
        ref={playerRef}
        className="relative bg-black aspect-video overflow-hidden rounded-lg [&_[data-media-player]]:aspect-video"
        src={activeSrc}
        autoPlay
        muted
        playsInline
        load="visible"
        streamType="on-demand"
        preferNativeHLS={false}
        crossOrigin
        onCanPlay={handleCanPlay}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeked={handleSeeked}
        keyTarget="player"
      >
        <MediaProvider>
          {subtitles.map((sub, i) => (
            <Track
              key={i}
              src={sub.url}
              kind="subtitles"
              label={sub.language}
              language={sub.language.toLowerCase().slice(0, 2)}
              default={false}
            />
          ))}
        </MediaProvider>

        {/* Default layout — vidstack's polished UI with all controls */}
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>

      {/* Info bar */}
      <div className="flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <span>
          ✓ Ad-free ·{" "}
          <span className="text-gray-300">
            {isDashSource && dashSource ? dashSource.provider : "mzfi.me"}
          </span>
          {isDashSource && dashSource
            ? ` · ${dashSource.maxBitrate} adaptive`
            : ` · ${sources.find((s) => s.url === activeSrc)?.quality || "auto"}`}
        </span>
        {isDashSource && (
          <span className="text-emerald-500/80">⚡ Adaptive streaming — auto-adjusts quality to your connection</span>
        )}
      </div>
    </div>
  );
}

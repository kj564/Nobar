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

type NativePlayerProps = {
  tmdbId: number;
  title: string;
  kind?: "movie" | "tv";
  season?: number;
  episode?: number;
};

export function NativePlayer({ tmdbId, title, kind = "movie", season, episode }: NativePlayerProps) {
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false);
  const [volume, setVolume] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch stream data
  const streamUrl = kind === "tv" && season && episode
    ? `/api/stream/${tmdbId}?kind=tv&season=${season}&episode=${episode}`
    : `/api/stream/${tmdbId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSources([]);
    setSubtitles([]);
    setActiveSource(null);

    fetch(streamUrl)
      .then((res) => {
        if (!res.ok) throw new Error("No stream");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
        setSubtitles(data.subtitles || []);
        if (data.sources?.length > 0) {
          // Auto-select best quality
          const best = data.sources.reduce((best: StreamSource, s: StreamSource) =>
            parseInt(s.quality) > parseInt(best.quality) ? s : best
          );
          setActiveSource(best);
        } else {
          setUseEmbed(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setUseEmbed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [streamUrl]);

  // Video event listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onDurationChange = () => setDuration(v.duration || 0);
    const onPlay = () => { setPlaying(true); setBuffering(false); };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onVolumeChange = () => { setMuted(v.muted); setVolume(v.volume); };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("durationchange", onDurationChange);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("volumechange", onVolumeChange);

    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("durationchange", onDurationChange);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("volumechange", onVolumeChange);
    };
  }, [activeSource]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "f":
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); } else { v.pause(); }
  }, []);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  };

  const seek = (time: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = time;
  };

  const setVol = (vol: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = vol;
    v.muted = vol === 0;
  };

  const changeQuality = (source: StreamSource) => {
    const v = videoRef.current;
    const t = v?.currentTime || 0;
    const wasPlaying = !v?.paused;
    setActiveSource(source);
    setShowSettings("");
    setTimeout(() => {
      if (v) {
        v.currentTime = t;
        if (wasPlaying) v.play();
      }
    }, 200);
  };

  const changeSubtitle = (url: string | null) => {
    setActiveSubtitle(url);
    setShowSettings("");
    // Toggle tracks
    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = subtitles[i]?.url === url ? "showing" : "hidden";
      }
    }
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Loading state
  if (loading) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading stream...</span>
      </div>
    );
  }

  // Fallback to embed
  if (useEmbed || !activeSource) {
    const embedUrl = kind === "tv" && season && episode
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${tmdbId}`;
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
        {error && <p className="text-xs text-gray-500">{error}</p>}
      </div>
    );
  }

  // Native player
  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative bg-black aspect-video overflow-hidden rounded-lg group"
        tabIndex={0}
      >
        <video
          ref={videoRef}
          src={activeSource.url}
          className="w-full h-full object-contain"
          onClick={togglePlay}
          crossOrigin="anonymous"
          playsInline
          autoPlay
        >
          {subtitles.map((sub, i) => (
            <track
              key={i}
              kind="subtitles"
              src={sub.url}
              srcLang={sub.language.substring(0, 2).toLowerCase()}
              label={sub.language}
              default={activeSubtitle === sub.url}
            />
          ))}
        </video>

        {/* Buffering indicator */}
        {buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
          </div>
        )}

        {/* Center play button when paused */}
        {!playing && !buffering && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Play"
          >
            <div className="w-16 h-16 rounded-full bg-brand-500/90 hover:bg-brand-500 flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
              <Play className="w-8 h-8 fill-white text-white ml-1" />
            </div>
          </button>
        )}

        {/* Custom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pt-12 pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Seek bar */}
          <div
            className="relative w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer group/seek"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seek(pct * duration);
            }}
          >
            <div
              className="absolute top-0 left-0 h-full bg-brand-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white hover:text-brand-500 transition" aria-label="Play/Pause">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            {/* Volume */}
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

            {/* Time */}
            <div className="text-xs text-white/80 font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            <div className="flex-1" />

            {/* Subtitle selector */}
            {subtitles.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSettings(showSettings === "sub" ? "" : "sub")}
                  className={`text-white hover:text-brand-500 transition flex items-center gap-1 ${activeSubtitle ? "text-brand-500" : ""}`}
                  aria-label="Subtitles"
                >
                  <Subtitles className="w-5 h-5" />
                </button>
                {showSettings === "sub" && (
                  <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 space-y-1 min-w-[160px] max-h-[200px] overflow-y-auto scroll-row">
                    <button
                      onClick={() => changeSubtitle(null)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${!activeSubtitle ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                    >
                      Off
                    </button>
                    {subtitles.map((sub, i) => (
                      <button
                        key={i}
                        onClick={() => changeSubtitle(sub.url)}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${activeSubtitle === sub.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                      >
                        {sub.language}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality selector */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(showSettings === "quality" ? "" : "quality")}
                className="text-white hover:text-brand-500 transition flex items-center gap-1"
                aria-label="Quality"
              >
                <Settings className="w-5 h-5" />
                <span className="text-xs">{activeSource.quality}</span>
              </button>
              {showSettings === "quality" && (
                <div className="absolute bottom-8 right-0 bg-ink-900/95 backdrop-blur border border-white/10 rounded-lg p-2 space-y-1 min-w-[150px]">
                  <p className="text-xs text-gray-400 px-2 py-1 uppercase tracking-wider">Quality</p>
                  {sources.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => changeQuality(s)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition ${activeSource.url === s.url ? "bg-brand-500/20 text-brand-500" : "text-gray-300 hover:bg-white/5"}`}
                    >
                      {s.quality} <span className="text-xs text-gray-500">({s.provider})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white hover:text-brand-500 transition" aria-label="Fullscreen">
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Source info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Source: <span className="text-gray-300">{activeSource.provider}</span> · {activeSource.quality}
        </span>
        <span className="hidden sm:inline">
          {subtitles.length > 0 ? `${subtitles.length} subtitles` : "No subtitles"}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles, ChevronDown } from "lucide-react";

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
};

export function NativePlayer({ tmdbId, title }: NativePlayerProps) {
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [useEmbed, setUseEmbed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch stream data from API route
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/stream/${tmdbId}`)
      .then((res) => {
        if (!res.ok) throw new Error("No direct stream available");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources || []);
        setSubtitles(data.subtitles || []);
        if (data.sources && data.sources.length > 0) {
          // Auto-select best quality (highest p)
          const best = data.sources.reduce((best: StreamSource, s: StreamSource) => {
            const bestP = parseInt(best.quality);
            const sP = parseInt(s.quality);
            return sP > bestP ? s : best;
          });
          setActiveSource(best);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Stream fetch failed:", err);
        setError("Failed to load stream. Using embed fallback.");
        setUseEmbed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      v.requestFullscreen();
    }
  };

  const changeQuality = (source: StreamSource) => {
    const v = videoRef.current;
    const currentTime = v?.currentTime || 0;
    const wasPlaying = !v?.paused;
    setActiveSource(source);
    // Restore position after source change
    setTimeout(() => {
      if (v) {
        v.currentTime = currentTime;
        if (wasPlaying) v.play();
      }
    }, 100);
    setShowSettings("");
  };

  const changeSubtitle = (url: string | null) => {
    setActiveSubtitle(url);
    setShowSettings("");
  };

  // Loading state
  if (loading) {
    return (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading stream...</span>
      </div>
    );
  }

  // Fallback to embed iframe
  if (useEmbed || !activeSource) {
    return (
      <div className="space-y-4">
        <div className="relative bg-black aspect-video overflow-hidden rounded-lg">
          <iframe
            title={`${title} — Player`}
            className="absolute inset-0 w-full h-full"
            src={`https://vidlink.pro/movie/${tmdbId}`}
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
    <div className="space-y-3">
      {/* Video player */}
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg group">
        <video
          ref={videoRef}
          src={activeSource.url}
          className="w-full h-full"
          onClick={togglePlay}
          crossOrigin="anonymous"
          playsInline
          autoPlay
        >
          {/* Subtitle tracks */}
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

        {/* Custom controls overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} className="text-white hover:text-brand-500 transition">
              {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-white" />}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-brand-500 transition">
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="flex-1" />
            {subtitles.length > 0 && (
              <button
                onClick={() => setShowSettings(showSettings === "subtitle" ? "" : "subtitle")}
                className="text-white hover:text-brand-500 transition"
              >
                <Subtitles className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setShowSettings(showSettings === "quality" ? "" : "quality")}
              className="text-white hover:text-brand-500 transition flex items-center gap-1"
            >
              <Settings className="w-5 h-5" />
              <span className="text-xs">{activeSource.quality}</span>
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-brand-500 transition">
              <Maximize className="w-5 h-5" />
            </button>
          </div>

          {/* Quality selector dropdown */}
          {showSettings === "quality" && (
            <div className="absolute bottom-12 right-4 bg-ink-900 border border-white/10 rounded-lg p-2 space-y-1 min-w-[150px]">
              <p className="text-xs text-gray-400 px-2 py-1 uppercase tracking-wider">Quality</p>
              {sources.map((s, i) => (
                <button
                  key={i}
                  onClick={() => changeQuality(s)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    activeSource.url === s.url
                      ? "bg-brand-500/20 text-brand-500"
                      : "text-gray-300 hover:bg-white/5"
                  }`}
                >
                  {s.quality} <span className="text-xs text-gray-500">({s.provider})</span>
                </button>
              ))}
            </div>
          )}

          {/* Subtitle selector dropdown */}
          {showSettings === "subtitle" && (
            <div className="absolute bottom-12 right-4 bg-ink-900 border border-white/10 rounded-lg p-2 space-y-1 min-w-[180px]">
              <p className="text-xs text-gray-400 px-2 py-1 uppercase tracking-wider">Subtitles</p>
              <button
                onClick={() => changeSubtitle(null)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                  !activeSubtitle
                    ? "bg-brand-500/20 text-brand-500"
                    : "text-gray-300 hover:bg-white/5"
                }`}
              >
                Off
              </button>
              {subtitles.map((sub, i) => (
                <button
                  key={i}
                  onClick={() => changeSubtitle(sub.url)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    activeSubtitle === sub.url
                      ? "bg-brand-500/20 text-brand-500"
                      : "text-gray-300 hover:bg-white/5"
                  }`}
                >
                  {sub.language}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Source info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Source: <span className="text-gray-300">{activeSource.provider}</span> ·{" "}
          {activeSource.quality}
        </span>
        {subtitles.length > 0 && (
          <span>{subtitles.length} subtitles available</span>
        )}
      </div>
    </div>
  );
}

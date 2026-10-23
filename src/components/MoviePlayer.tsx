"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import {
  type Server,
  type TMDBSeasonSummary,
  type TMDBEpisode,
  buildServerUrl,
  fetchTVSeason,
} from "@/lib/tmdb";

type MoviePlayerProps = {
  videoId: number;
  title: string;
  servers: ReadonlyArray<Server>;
  kind: "movie" | "series";
  seasons?: TMDBSeasonSummary[];
};

export function MoviePlayer({
  videoId,
  title,
  servers,
  kind,
  seasons,
}: MoviePlayerProps) {
  const [activeServer, setActiveServer] = useState<Server | null>(
    servers.find((s) => s.recommended) || servers[0] || null
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Series episode selector state
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [activeEpisode, setActiveEpisode] = useState<number>(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Auto-select first valid season (skip season 0 which is "Specials")
  useEffect(() => {
    if (kind !== "series" || !seasons || seasons.length === 0) return;
    const firstRealSeason = seasons.find((s) => s.season_number > 0);
    if (firstRealSeason) {
      setActiveSeason(firstRealSeason.season_number);
    }
  }, [kind, seasons]);

  // Fetch episode list when active season changes
  useEffect(() => {
    if (kind !== "series") return;
    let cancelled = false;
    setLoadingEpisodes(true);
    fetchTVSeason(videoId, activeSeason)
      .then((data) => {
        if (!cancelled) {
          setEpisodes(data.episodes || []);
          // Reset to episode 1 when season changes (only if current episode
          // is not in new season)
          setActiveEpisode((prev) => {
            const exists = (data.episodes || []).some(
              (e) => e.episode_number === prev
            );
            return exists ? prev : 1;
          });
        }
      })
      .catch((e) => {
        console.warn("fetchTVSeason failed:", e);
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, videoId, activeSeason]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  };

  const selectServer = (serverId: string) => {
    const server = servers.find((s) => s.id === serverId);
    if (server) {
      setActiveServer(server);
      showToast(`Beralih ke ${server.name}`);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Build iframe src — for series include season + episode
  const iframeSrc = activeServer
    ? kind === "series"
      ? buildServerUrl(activeServer.pattern, videoId, activeSeason, activeEpisode)
      : buildServerUrl(activeServer.pattern, videoId)
    : "about:blank";

  return (
    <div className="space-y-4">
      {/* Player */}
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg">
        <iframe
          title={`${title} — Player`}
          className="absolute inset-0 w-full h-full"
          src={iframeSrc}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Server picker — dropdown select */}
        {servers.length > 0 && (
          <div className="flex items-center gap-3">
            <label htmlFor="server-select" className="text-sm font-semibold text-gray-300">
              Server:
            </label>
            <div className="relative">
              <select
                id="server-select"
                value={activeServer?.id || ""}
                onChange={(e) => selectServer(e.target.value)}
                className="appearance-none bg-ink-800 border border-white/10 text-white text-sm font-medium pl-4 pr-10 py-2.5 rounded-lg focus:outline-none focus:border-brand-500/50 hover:border-white/20 transition cursor-pointer"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-ink-800 text-white">
                    {s.name} — {s.quality} {s.recommended ? "(recommended)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        <span className="text-xs text-gray-500">
          {activeServer ? `Memutar: ${activeServer.quality}` : ""}
        </span>
      </div>

      {/* Season + Episode picker — only for series */}
      {kind === "series" && seasons && seasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
          {/* Season dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="season-select" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Season
            </label>
            <div className="relative">
              <select
                id="season-select"
                value={activeSeason}
                onChange={(e) => setActiveSeason(Number(e.target.value))}
                className="appearance-none bg-ink-800 border border-white/10 text-white text-sm font-medium pl-3 pr-9 py-2 rounded-lg focus:outline-none focus:border-brand-500/50 hover:border-white/20 transition cursor-pointer"
              >
                {seasons
                  .filter((s) => s.season_number > 0) // skip "Specials" (season 0)
                  .map((s) => (
                    <option key={s.id} value={s.season_number} className="bg-ink-800 text-white">
                      {s.name} ({s.episode_count} eps)
                    </option>
                  ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Episode dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="episode-select" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Episode
            </label>
            <div className="relative">
              <select
                id="episode-select"
                value={activeEpisode}
                onChange={(e) => setActiveEpisode(Number(e.target.value))}
                disabled={loadingEpisodes || episodes.length === 0}
                className="appearance-none bg-ink-800 border border-white/10 text-white text-sm font-medium pl-3 pr-9 py-2 rounded-lg focus:outline-none focus:border-brand-500/50 hover:border-white/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {episodes.length === 0 ? (
                  <option value={1}>—</option>
                ) : (
                  episodes.map((ep) => (
                    <option key={ep.id} value={ep.episode_number} className="bg-ink-800 text-white">
                      E{ep.episode_number}: {ep.name || `Episode ${ep.episode_number}`}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {loadingEpisodes && (
            <span className="text-xs text-gray-500">Memuat episode…</span>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg bg-ink-800 border border-white/10 text-sm text-white shadow-xl toast-show pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import {
  type TMDBSeasonSummary,
  type TMDBEpisode,
  fetchTVSeason,
} from "@/lib/tmdb";
import { NativePlayer } from "@/components/NativePlayer";

type SeriesNativePlayerProps = {
  tmdbId: number;
  title: string;
  seasons?: TMDBSeasonSummary[];
};

export function SeriesNativePlayer({ tmdbId, title, seasons }: SeriesNativePlayerProps) {
  const [activeSeason, setActiveSeason] = useState(1);
  const [activeEpisode, setActiveEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Auto-select first valid season
  useEffect(() => {
    if (!seasons || seasons.length === 0) return;
    const firstReal = seasons.find((s) => s.season_number > 0);
    if (firstReal) setActiveSeason(firstReal.season_number);
  }, [seasons]);

  // Fetch episodes when season changes
  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    setLoadingEpisodes(true);
    fetchTVSeason(tmdbId, activeSeason)
      .then((data) => {
        if (cancelled) return;
        setEpisodes(data.episodes || []);
        setActiveEpisode((prev) => {
          const exists = (data.episodes || []).some((e) => e.episode_number === prev);
          return exists ? prev : 1;
        });
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false);
      });
    return () => { cancelled = true; };
  }, [tmdbId, activeSeason]);

  const realSeasons = seasons?.filter((s) => s.season_number > 0) || [];

  return (
    <div className="space-y-4">
      <NativePlayer
        tmdbId={tmdbId}
        title={title}
        kind="tv"
        season={activeSeason}
        episode={activeEpisode}
      />

      {/* Season + Episode selector */}
      {realSeasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
          {/* Season dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Season
            </label>
            <div className="relative">
              <select
                value={activeSeason}
                onChange={(e) => setActiveSeason(Number(e.target.value))}
                className="appearance-none bg-ink-800 border border-white/10 text-white text-sm font-medium pl-3 pr-9 py-2 rounded-lg focus:outline-none focus:border-brand-500/50 hover:border-white/20 transition cursor-pointer"
              >
                {realSeasons.map((s) => (
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
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Episode
            </label>
            <div className="relative">
              <select
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
            <span className="text-xs text-gray-500">Loading episodes…</span>
          )}
        </div>
      )}
    </div>
  );
}

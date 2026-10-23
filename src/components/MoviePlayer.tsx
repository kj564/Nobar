"use client";

import { useState, useRef, useEffect } from "react";
import { Play, ChevronDown } from "lucide-react";
import { type Server, buildServerUrl } from "@/lib/tmdb";

type MoviePlayerProps = {
  videoId: number;
  title: string;
  servers: ReadonlyArray<Server>;
  kind: "movie" | "series";
};

export function MoviePlayer({ videoId, title, servers, kind }: MoviePlayerProps) {
  const [activeServer, setActiveServer] = useState<Server | null>(
    servers.find((s) => s.recommended) || servers[0] || null
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="space-y-4">
      {/* Player */}
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg">
        <iframe
          title={`${title} — Player`}
          className="absolute inset-0 w-full h-full"
          src={
            activeServer
              ? buildServerUrl(activeServer.pattern, videoId)
              : "about:blank"
          }
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Server picker — dropdown select (clean) */}
      {servers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <span className="text-xs text-gray-500">
            {activeServer ? `Memutar: ${activeServer.quality}` : ""}
          </span>
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


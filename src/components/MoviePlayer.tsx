"use client";

import { useState, useRef, useEffect } from "react";
import { Play, X } from "lucide-react";
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

  const selectServer = (server: Server) => {
    setActiveServer(server);
    showToast(`Beralih ke ${server.name}`);
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
          // sandbox: blocks popunders, popups, top-level navigation, alert
          // dialogs (fake virus warnings), window.open() — closest we can
          // get to uBlock for cross-origin embeds. Player still works
          // because allow-scripts + allow-same-origin are included.
          // NOT included: allow-popups, allow-top-navigation, allow-modals
          // (these enable ads/redirects/malicious alerts)
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Server picker */}
      {servers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Pilih Server</h3>
            <span className="text-xs text-gray-500">
              {activeServer ? `Memutar dari ${activeServer.name} (${activeServer.quality})` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => (
              <button
                key={s.id}
                onClick={() => selectServer(s)}
                className={`server-btn inline-flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-sm text-gray-200 ${
                  activeServer?.id === s.id ? "active" : ""
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  {s.name}
                  {s.recommended && (
                    <span className="ml-1 text-[10px] opacity-80">• rekomendasi</span>
                  )}
                </span>
                <span className="text-[11px] text-gray-400">
                  {s.quality} • load {s.load}%
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Jika pemutaran macet, coba pindah server cadangan untuk sumber alternatif.
          </p>
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

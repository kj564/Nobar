"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// vidstack Player component — loaded client-side only via dynamic import.
// vidstack accesses `screen.orientation` during module init which doesn't
// exist on the server, so we use ssr:false to skip SSR entirely.
const VidstackPlayerClient = dynamic(
  () => import("./VidstackPlayerClient").then((m) => m.VidstackPlayerClient),
  {
    ssr: false,
    loading: () => (
      <div className="relative bg-black aspect-video overflow-hidden rounded-lg flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="absolute bottom-4 text-sm text-gray-400">Loading player…</span>
      </div>
    ),
  }
);

type NativePlayerProps = {
  tmdbId: number;
  title: string;
  kind?: "movie" | "tv";
  season?: number;
  episode?: number;
};

export function NativePlayer(props: NativePlayerProps) {
  return <VidstackPlayerClient {...props} />;
}

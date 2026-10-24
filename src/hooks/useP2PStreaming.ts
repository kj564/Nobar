"use client";

// useP2PStreaming — React hook managing P2P engine state for the player.
//
// Responsibilities:
//   - Persist enable/disable toggle in localStorage
//   - Subscribe to stats updates from p2p-engine
//   - Expose a clean API to the player UI:
//       { enabled, toggle(), stats }
//
// Stats include: peers, p2pBytes, httpBytes, p2pRatio (0-1), connection status.
// The engine itself is created/destroyed by NativePlayer based on this toggle,
// because the engine needs the shaka library + player instance at creation time.

import { useEffect, useState, useCallback, useRef } from "react";
import { onP2PStats, type P2PStats } from "@/lib/p2p-engine";

const STORAGE_KEY = "nobar:p2p-enabled";
const DEFAULT_ENABLED = false; // OFF by default — opt-in feature

function readStoredEnabled(): boolean {
  if (typeof window === "undefined") return DEFAULT_ENABLED;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === null) return DEFAULT_ENABLED;
    return v === "1" || v === "true";
  } catch {
    return DEFAULT_ENABLED;
  }
}

function writeStoredEnabled(v: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    // localStorage may be unavailable (private mode) — silently ignore
  }
}

export function useP2PStreaming() {
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_ENABLED);
  const [stats, setStats] = useState<P2PStats>({
    enabled: false,
    connected: false,
    peers: 0,
    p2pBytes: 0,
    httpBytes: 0,
    p2pRatio: 0,
    swarmId: null,
    lastError: null,
  });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Read stored preference on mount
  useEffect(() => {
    setEnabled(readStoredEnabled());
  }, []);

  // Subscribe to P2P stats stream (always subscribed, even if disabled —
  // so when the engine fires events after enabling, we get them)
  useEffect(() => {
    unsubscribeRef.current = onP2PStats((s) => {
      // Always merge the current toggle state into the stats so the UI shows
      // "P2P: ON" even before the engine has connected to a tracker
      setStats({ ...s, enabled: enabled });
    });
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [enabled]);

  // Toggle handler — flip state + persist
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      writeStoredEnabled(next);
      // Update stats' enabled flag immediately for responsive UI
      setStats((s) => ({ ...s, enabled: next }));
      return next;
    });
  }, []);

  return {
    enabled,
    stats,
    toggle,
  };
}

// P2P Engine — wrapper around p2p-media-loader-shaka for Nobar.
//
// Implements the Hybrid P2P-CDN video delivery architecture:
//   - Signaling & Tracker Server: mini-services/p2p-signaling (port 3003)
//   - Client-Side P2P Engine: this module (integrates ShakaP2PEngine)
//   - Buffer scheduler: built into p2p-media-loader (critical zone = HTTP,
//     swarm zone = P2P, with auto-fallback to HTTP on P2P failure)
//
// Lifecycle:
//   1. createP2PEngine(shaka) → singleton instance
//   2. engine.bind(player)    → hooks Shaka networking engine
//   3. Shaka loads MPD → P2P engine registers stream swarm
//   4. Each segment request: P2P-first, CDN fallback (transparent to user)
//   5. engine.destroy()       → tears down P2P connections
//
// Stats events (subscribe via engine.onStats):
//   - peers: number of connected peers
//   - p2pBytes: bytes downloaded from peers
//   - httpBytes: bytes downloaded from CDN
//   - p2pRatio: P2P / total (0-1)

import type { ShakaP2PEngine as ShakaP2PEngineType } from "p2p-media-loader-shaka";

// Singleton state — one engine per page (ShakaP2PEngine instance)
let p2pEngineInstance: ShakaP2PEngineType | null = null;
let statsListeners: Array<(stats: P2PStats) => void> = [];
let currentStats: P2PStats = {
  enabled: false,
  connected: false,
  peers: 0,
  p2pBytes: 0,
  httpBytes: 0,
  p2pRatio: 0,
  swarmId: null,
  lastError: null,
};

export type P2PStats = {
  enabled: boolean;        // toggle is ON
  connected: boolean;      // tracker WebSocket connected
  peers: number;           // active peer connections
  p2pBytes: number;        // bytes downloaded via P2P (WebRTC)
  httpBytes: number;       // bytes downloaded via CDN (HTTP fallback)
  p2pRatio: number;        // 0-1 (p2pBytes / (p2pBytes + httpBytes))
  swarmId: string | null;  // stream swarm ID for current peers
  lastError: string | null;
};

// Our self-hosted tracker URL — constructed dynamically from current page origin.
// The Caddy gateway routes `?XTransformPort=3003` requests to the signaling
// mini-service on port 3003. In production (Vercel), this URL is unreachable
// and the engine falls back to the public WebTorrent trackers below.
function getSelfHostedTrackerUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host; // includes port if non-default
    return `${proto}//${host}/?XTransformPort=3003`;
  } catch {
    return null;
  }
}

const TRACKERS: string[] = (() => {
  const list: string[] = [];
  const self = getSelfHostedTrackerUrl();
  if (self) list.push(self);
  // Public WebTorrent trackers (fallback if our tracker is unreachable
  // or for cross-network peer density in production):
  list.push(
    "wss://tracker.novage.com.ua",
    "wss://tracker.webtorrent.dev",
    "wss://tracker.openwebtorrent.com",
  );
  return list;
})();

// Push current stats to all subscribers
function emitStats() {
  for (const fn of statsListeners) {
    try { fn(currentStats); } catch {}
  }
}

function updateStats(patch: Partial<P2PStats>) {
  const totalBytes = (patch.p2pBytes ?? currentStats.p2pBytes) +
                     (patch.httpBytes ?? currentStats.httpBytes);
  const p2pRatio = totalBytes > 0
    ? (patch.p2pBytes ?? currentStats.p2pBytes) / totalBytes
    : 0;
  currentStats = {
    ...currentStats,
    ...patch,
    p2pRatio,
  };
  emitStats();
}

/**
 * Subscribe to P2P stats updates. Returns an unsubscribe function.
 */
export function onP2PStats(listener: (stats: P2PStats) => void): () => void {
  statsListeners.push(listener);
  // Emit current state immediately so subscriber doesn't wait for next event
  try { listener(currentStats); } catch {}
  return () => {
    statsListeners = statsListeners.filter((l) => l !== listener);
  };
}

/**
 * Get the singleton P2P engine instance (or null if not yet created).
 * Pass the shaka library to ensure version match.
 */
export async function getP2PEngine(shaka: any): Promise<ShakaP2PEngineType | null> {
  if (typeof window === "undefined") return null;
  if (p2pEngineInstance) return p2pEngineInstance;

  try {
    const mod = await import("p2p-media-loader-shaka");
    const ShakaP2PEngineClass = (mod as any).ShakaP2PEngine || (mod as any).default;
    if (!ShakaP2PEngineClass) {
      console.warn("[NOBAR-P2P] ShakaP2PEngine class not found in module");
      return null;
    }

    p2pEngineInstance = new ShakaP2PEngineClass({
      core: {
        // Trackers — our self-hosted one + public fallbacks.
        // p2p-media-loader deduplicates and uses whichever responds first.
        announceTrackers: TRACKERS,
        // P2P config tuned for smoothness:
        // - High demand window: next 15s of segments always fetched from CDN
        //   (critical zone — guarantees zero stall at playhead)
        // - P2P time window: 6s ahead — segments in this window try P2P first
        // - HTTP time window: 3s ahead — segments here HTTP-priority
        // - p2pMaxPeers: 30 — enough for swarm density without overloading browser
        // - httpDownloadErrorRetries / p2pErrorRetries: 3 — fail-fast on bad peers
        highDemandTimeWindow: 15,
        httpDownloadTimeWindow: 3,
        p2pDownloadTimeWindow: 6,
        simultaneousHttpDownloads: 2,
        simultaneousP2PDownloads: 3,
        p2pMaxPeers: 30,
        httpErrorRetries: 3,
        p2pErrorRetries: 3,
        p2pNotReceivingBytesTimeoutMs: 4000,    // 4s no bytes → kill P2P conn
        httpNotReceivingBytesTimeoutMs: 3000,    // 3s no bytes → retry HTTP
        p2pInactiveLoaderDestroyTimeoutMs: 30000, // 30s no P2P activity → destroy
        // WebRTC config: STUN servers for NAT traversal
        rtcConfig: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      },
    }, shaka);

    const engine = p2pEngineInstance;
    if (!engine) {
      console.warn("[NOBAR-P2P] Engine instance null after creation");
      return null;
    }

    // ── Wire up event listeners for stats ──
    engine.addEventListener("onPeerConnect", () => {
      updateStats({
        connected: true,
        peers: currentStats.peers + 1,
        lastError: null,
      });
      console.log("[NOBAR-P2P] Peer connected — total:", currentStats.peers);
    });

    engine.addEventListener("onPeerClose", () => {
      updateStats({
        peers: Math.max(0, currentStats.peers - 1),
      });
      console.log("[NOBAR-P2P] Peer disconnected — total:", currentStats.peers);
    });

    engine.addEventListener("onChunkDownloaded", (e: any) => {
      // e: { bytes: number, downloadSource: 'http' | 'p2p', peerId?: string, streamType: string }
      const [bytes, downloadSource] = e.detail || e;
      const byteCount = typeof bytes === "number" ? bytes : (e?.bytes ?? 0);
      const source = downloadSource || e?.downloadSource || "http";

      if (source === "p2p") {
        updateStats({
          p2pBytes: currentStats.p2pBytes + byteCount,
          connected: true,
        });
      } else {
        updateStats({
          httpBytes: currentStats.httpBytes + byteCount,
        });
      }
    });

    engine.addEventListener("onSegmentLoaded", () => {
      // Could be used to track per-segment load times
    });

    engine.addEventListener("onPeerConnectError", (e: any) => {
      const err = e?.detail?.error || e?.error || e;
      updateStats({ lastError: String(err?.message || err || "Connection failed") });
      console.warn("[NOBAR-P2P] Peer connect error:", err);
    });

    engine.addEventListener("onStreamRegistrationError", (e: any) => {
      const err = e?.detail?.error || e?.error || e;
      updateStats({ lastError: String(err?.message || err || "Stream registration failed") });
      console.warn("[NOBAR-P2P] Stream registration error:", err);
    });

    // Mark as enabled (toggle is ON)
    updateStats({
      enabled: true,
      connected: false, // will flip true on first peer connect / chunk download
      peers: 0,
      p2pBytes: 0,
      httpBytes: 0,
      p2pRatio: 0,
      lastError: null,
    });

    return p2pEngineInstance;
  } catch (err: any) {
    console.error("[NOBAR-P2P] Failed to create P2P engine:", err);
    updateStats({
      enabled: false,
      lastError: String(err?.message || err),
    });
    return null;
  }
}

/**
 * Check if P2P engine is currently active.
 */
export function isP2PActive(): boolean {
  return p2pEngineInstance !== null;
}

/**
 * Reset stats counters (called when switching videos).
 */
export function resetStats(): void {
  updateStats({
    p2pBytes: 0,
    httpBytes: 0,
    p2pRatio: 0,
    peers: 0,
    connected: false,
    swarmId: null,
    lastError: null,
  });
}

/**
 * Destroy the P2P engine — tears down all peer connections,
 * closes tracker WebSocket, releases Shaka hooks.
 */
export async function destroyP2PEngine(): Promise<void> {
  if (p2pEngineInstance) {
    try {
      await p2pEngineInstance.destroy();
    } catch (err) {
      console.warn("[NOBAR-P2P] Destroy error:", err);
    }
    p2pEngineInstance = null;
  }
  updateStats({
    enabled: false,
    connected: false,
    peers: 0,
    swarmId: null,
    // Preserve byte counters for final stats display
  });
}

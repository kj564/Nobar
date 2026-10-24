/**
 * Nobar P2P Signaling Mini-Service
 *
 * A WebTorrent tracker that coordinates peer discovery for the
 * Hybrid P2P-CDN video delivery feature. Clients running
 * `p2p-media-loader-shaka` connect over WebSocket, announce the
 * info_hash of the stream they are watching, and the tracker
 * relays the list of other peers on the same swarm so they can
 * exchange video segments over WebRTC.
 *
 * Run in dev mode with auto-restart:
 *     bun --hot index.ts
 *
 * Run in production:
 *     bun index.ts
 */

// Import from the `./server` subpath to skip loading `client.js`.
// The client transitively pulls in `webrtc-polyfill` → `node-datachannel`
// (a native C++ addon) which the tracker server does not need — the
// server only relays SDP/ICE over WebSocket; it never opens WebRTC
// connections itself. This keeps the mini-service dependency-free at
// runtime (no native compilation step).
import Server from "bittorrent-tracker/server";

const PORT = Number(process.env.PORT ?? 3003);
const HOST = "0.0.0.0";

const g = globalThis as unknown as { __nobarSignalingServer?: Server };

// Bun --hot reload safety: close any previous server instance so the
// new module evaluation can rebind port 3003 cleanly.
if (g.__nobarSignalingServer) {
  try {
    g.__nobarSignalingServer.close();
  } catch {
    /* ignore — already closed */
  }
  g.__nobarSignalingServer = undefined;
}

const server = new Server({
  udp: false, // disable UDP tracker — WebSocket only
  http: true, // required: ws server attaches to the http server
  ws: true,
  trustProxy: true,
});

g.__nobarSignalingServer = server;

/**
 * The info_hash from a WebTorrent announce can arrive as a 20-byte
 * Buffer, a binary string, or (from p2p-media-loader) a 40-char hex
 * string. Normalise to lowercase hex for logging.
 */
function infoHashToHex(infoHash: unknown): string {
  if (infoHash == null) return "<unknown>";
  if (Buffer.isBuffer(infoHash)) return infoHash.toString("hex");
  if (typeof infoHash === "string") {
    if (/^[0-9a-fA-F]{40}$/.test(infoHash)) return infoHash.toLowerCase();
    return Buffer.from(infoHash, "binary").toString("hex");
  }
  if (infoHash instanceof Uint8Array) {
    return Buffer.from(infoHash).toString("hex");
  }
  return String(infoHash);
}

/** Short, human-friendly peer id for log lines (first 12 hex chars). */
function shortPeerId(peerId: unknown): string {
  if (peerId == null) return "<no-id>";
  if (Buffer.isBuffer(peerId)) return peerId.toString("hex").slice(0, 12);
  if (typeof peerId === "string") return peerId.slice(0, 12);
  return String(peerId).slice(0, 12);
}

server.on("listening", () => {
  const addr = server.http?.address();
  const boundPort =
    typeof addr === "object" && addr ? addr.port : PORT;
  console.log(
    `[p2p-signaling] Tracker listening on ws://${HOST}:${boundPort}`
  );
  console.log(
    `[p2p-signaling] UDP tracker disabled (WebSocket-only mode).`
  );
});

// Per-swarm peer activity logs. `start` = peer joins a swarm,
// `stop` = peer leaves, `complete` = peer finished downloading,
// `update` = periodic re-announce (logged at debug to avoid noise).
server.on("start", (peer, params) => {
  console.log(
    `[p2p-signaling] peer join   swarm=${infoHashToHex(
      params?.info_hash
    )} peer=${shortPeerId(peer?.peerId)} addr=${peer?.addr ?? "<unknown>"}`
  );
});

server.on("stop", (peer, params) => {
  console.log(
    `[p2p-signaling] peer leave  swarm=${infoHashToHex(
      params?.info_hash
    )} peer=${shortPeerId(peer?.peerId)} addr=${peer?.addr ?? "<unknown>"}`
  );
});

server.on("complete", (peer, params) => {
  console.log(
    `[p2p-signaling] peer done   swarm=${infoHashToHex(
      params?.info_hash
    )} peer=${shortPeerId(peer?.peerId)} addr=${peer?.addr ?? "<unknown>"}`
  );
});

server.on("update", (peer, params) => {
  // Re-announce — keep at debug so production logs stay readable.
  console.debug(
    `[p2p-signaling] peer update swarm=${infoHashToHex(
      params?.info_hash
    )} peer=${shortPeerId(peer?.peerId)} addr=${peer?.addr ?? "<unknown>"}`
  );
});

server.on("error", (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[p2p-signaling] ERROR:`, message);
});

server.on("warning", (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[p2p-signaling] WARNING:`, message);
});

// Graceful shutdown — close the tracker so the WebSocket port is
// released cleanly and any in-flight announces are flushed.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[p2p-signaling] ${signal} received, closing tracker…`);
  server.close((err?: Error) => {
    if (err) {
      console.error(`[p2p-signaling] close error:`, err.message);
      process.exit(1);
    }
    console.log("[p2p-signaling] Tracker closed. Bye.");
    process.exit(0);
  });
  // Hard exit if close() hangs (e.g. lingering sockets).
  setTimeout(() => {
    console.error("[p2p-signaling] Force-exit after 5s timeout.");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, HOST);

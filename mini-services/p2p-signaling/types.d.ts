/**
 * Minimal ambient type declarations for `bittorrent-tracker/server`.
 *
 * The upstream package ships without TypeScript types and there is no
 * @types/bittorrent-tracker on npm. We only consume the Server class
 * here, so this declaration covers the surface area we use; expand it
 * if future tasks need more.
 */

declare module "bittorrent-tracker/server" {
  import { EventEmitter } from "node:events";

  type PeerObject = {
    addr?: string;
    peerId?: Uint8Array | string;
    [k: string]: unknown;
  };

  interface AnnounceParams {
    info_hash: Uint8Array | string;
    peer_id?: Uint8Array | string;
    event?: "started" | "stopped" | "completed" | "update" | "";
    [k: string]: unknown;
  }

  interface ServerOptions {
    udp?: boolean | object;
    http?: boolean | object;
    ws?: boolean | object;
    stats?: boolean;
    trustProxy?: boolean;
    filter?: (
      params: AnnounceParams,
      cb: (err?: Error | null) => void
    ) => void;
  }

  export default class Server extends EventEmitter {
    http?: {
      address(): { port: number; family: string; address: string } | null;
    };
    udp?: unknown;
    constructor(opts?: ServerOptions);
    on(event: "listening", listener: () => void): this;
    on(
      event: "start" | "stop" | "complete" | "update",
      listener: (peer: PeerObject, params: AnnounceParams) => void
    ): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "warning", listener: (err: Error) => void): this;
    listen(port: number, host?: string, callback?: () => void): void;
    close(callback?: (err?: Error) => void): void;
  }
}

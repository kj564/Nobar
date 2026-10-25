// Token minter using tweetnacl (pure JS, Cloudflare Workers compatible)
// Replaces libsodium-wrappers which crashes in Workers runtime.
//
// vidlink.pro token format:
//   nonce = 24 × 0x00 (deterministic)
//   msg   = ascii(movieId) + b"\x00\x00\x00\x00" + struct.pack(">I", unix_ts + 5)
//   ct    = nacl.secretbox(msg, nonce, KEY)  // 16-byte MAC + encrypted msg
//   token = base64url(nonce + ct)

import nacl from "tweetnacl";

const VIDLINK_KEY_HEX =
  "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";
const FUTURE_OFFSET = 5;

export async function mintVidlinkToken(id: string | number): Promise<string> {
  const key = Buffer.from(VIDLINK_KEY_HEX, "hex");
  if (key.length !== 32) throw new Error("bad key length");

  // 24-byte zero nonce
  const nonce = new Uint8Array(24);

  // Message: ascii(id) + 4 null bytes + 4-byte Unix timestamp (big-endian)
  const idBytes = Buffer.from(String(id), "ascii");
  const pad = Buffer.from([0, 0, 0, 0]);
  const tsBuf = Buffer.alloc(4);
  tsBuf.writeUInt32BE(Math.floor(Date.now() / 1000) + FUTURE_OFFSET);
  const msg = Buffer.concat([idBytes, pad, tsBuf]);

  // nacl.secretbox returns ciphertext with 16-byte MAC prepended
  // This is equivalent to libsodium's crypto_secretbox_easy
  const ct = nacl.secretbox(msg, nonce, key);

  // Final: nonce(24) + ct(16+msg_len)
  const combined = Buffer.concat([Buffer.from(nonce), Buffer.from(ct)]);
  return combined
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

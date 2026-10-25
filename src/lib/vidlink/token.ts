// ─────────────────────────────────────────────────────────────────────
// lib/vidlink/token.ts — vidlink.pro token minter + CloudFront auth helper
//
// Pure-sodium replacement for fu.wasm (2.4MB → 0 bytes, 3s startup → <1ms).
// Token formula verified bit-for-bit against WASM on Oct 25, 2026 (see
// research/vidlink-deep-re.md for the full reverse-engineering report).
//
// Token structure:
//   nonce = 24 × 0x00  (deterministic)
//   msg   = ascii(movieId) + b"\x00\x00\x00\x00" + struct.pack(">I", unix_ts)
//   ct    = crypto_secretbox_easy(msg, nonce, KEY)   // MAC(16) + msg_len
//   token = base64url(nonce + ct)                     // 51 bytes → 68 chars
//
// Anti-replay: server REJECTS tokens with past/current timestamps.
// We use now+5s to guarantee the token is in the future from the server's
// clock (handles ~3s clock skew between client and vidlink.pro).
//
// KEY is STATIC (embedded in fu.wasm data section, same for all movies):
// ─────────────────────────────────────────────────────────────────────

import sodium from "libsodium-wrappers";

// 32-byte secret key extracted from fu.wasm data section.
// Verified stable across all movies (movieId does not affect the key).
const VIDLINK_KEY_HEX =
  "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";

// +5 seconds future offset. Verified empirically:
//   offset ≤ 0  → API returns null (token rejected)
//   offset ≥ +5  → API returns full stream JSON ✓
const FUTURE_OFFSET_SECONDS = 5;

let sodiumReady: Promise<void> | null = null;

async function ensureSodium(): Promise<void> {
  if (sodiumReady) return sodiumReady;
  sodiumReady = sodium.ready;
  return sodiumReady;
}

/**
 * Mint a vidlink.pro auth token for the given movie/show ID.
 *
 * @param id TMDB ID (movie or tv). For tv, pass the show ID (not season/episode).
 * @returns base64url token string (~68 chars) to be appended to the API URL.
 */
export async function mintVidlinkToken(id: string | number): Promise<string> {
  await ensureSodium();
  const key = sodium.from_hex(VIDLINK_KEY_HEX); // Uint8Array(32)

  // 24-byte zero nonce (deterministic — same input → same output)
  const nonce = new Uint8Array(24);

  // Message: ascii(id) + 4 null bytes + 4-byte Unix timestamp (big-endian)
  const idBytes = Buffer.from(String(id), "ascii");
  const pad = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const tsBuf = Buffer.alloc(4);
  tsBuf.writeUInt32BE(Math.floor(Date.now() / 1000) + FUTURE_OFFSET_SECONDS);
  const msg = Buffer.concat([idBytes, pad, tsBuf]);

  // crypto_secretbox_easy returns Uint8Array(msg.length + 16) — 16-byte MAC prefix.
  const ct = sodium.crypto_secretbox_easy(msg, nonce, key);

  // IMPORTANT: copy via Buffer.alloc + set. Buffer.from(uint8array) sometimes
  // grabs the underlying ArrayBuffer view, which can produce wrong lengths
  // when the Uint8Array is a view into a larger buffer.
  const ctBuf = Buffer.alloc(ct.length);
  ctBuf.set(ct);
  const nonceBuf = Buffer.alloc(24); // all zeros

  // Final: nonce(24) + ct(27) = 51 bytes → 68 base64url chars
  const combined = Buffer.concat([nonceBuf, ctBuf]);
  return combined
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─────────────────────────────────────────────────────────────────────
// CloudFront signed-URL helpers
//
// vidlink.pro's API returns `playlistHeaders.Cookie` containing:
//   CloudFront-Policy=...;CloudFront-Signature=...;CloudFront-Key-Pair-Id=...;
//
// Cookie is a FORBIDDEN fetch header (can't set cross-origin from JS).
// CloudFront signed URLs also accept the SAME values as URL query params,
// but with the `CloudFront-` prefix dropped:
//   ?Policy=...&Signature=...&Key-Pair-Id=...
//
// The values are already base64url-safe — do NOT URL-encode them.
// ─────────────────────────────────────────────────────────────────────

export type CloudFrontAuth = {
  policy: string;
  signature: string;
  keyPairId: string;
};

/**
 * Extract the 3 CloudFront auth values from a Cookie header.
 * Returns null if any of the 3 values is missing.
 */
export function extractCloudFrontAuth(cookieHeader: string): CloudFrontAuth | null {
  const policy = (cookieHeader.match(/CloudFront-Policy=([^;]+)/) || [])[1];
  const signature = (cookieHeader.match(/CloudFront-Signature=([^;]+)/) || [])[1];
  const keyPairId = (cookieHeader.match(/CloudFront-Key-Pair-Id=([^;]+)/) || [])[1];
  if (!policy || !signature || !keyPairId) return null;
  return { policy, signature, keyPairId };
}

/**
 * Build a CloudFront signed URL by appending auth as query parameters.
 *
 * @param baseUrl The CDN URL (e.g. https://sacdn.hakunaymatata.com/hls/{id}/local.m3u8)
 * @param auth    The 3 CloudFront values extracted from the cookie
 * @returns        baseUrl + "?Policy=...&Signature=...&Key-Pair-Id=..."
 *
 * Values are NOT URL-encoded — they are already base64url-safe (CloudFront docs).
 * Encoding them breaks auth (CloudFront decodes then compares to the raw value).
 */
export function buildSignedUrl(baseUrl: string, auth: CloudFrontAuth): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return (
    baseUrl +
    sep +
    "Policy=" + auth.policy +
    "&Signature=" + auth.signature +
    "&Key-Pair-Id=" + auth.keyPairId
  );
}

/**
 * Build the auth query string for appending to relative segment URLs.
 * Used by the hls.js custom fragment loader to inject auth into .ts URLs.
 *
 * Format: "?Policy=...&Signature=...&Key-Pair-Id=..." (with leading ?)
 */
export function buildAuthQuery(auth: CloudFrontAuth): string {
  return (
    "?Policy=" + auth.policy +
    "&Signature=" + auth.signature +
    "&Key-Pair-Id=" + auth.keyPairId
  );
}

// ─────────────────────────────────────────────────────────────────────
// vidlink.pro API call helper
//
// Returns the parsed API JSON or null on any failure.
// Handles:
//   - Token minting (sodium, <1ms)
//   - Future timestamp (+5s)
//   - X-Playback-Environment: hls (for HLS playlist + CloudFront cookie)
//   - "null" body (token rejected) → return null
// ─────────────────────────────────────────────────────────────────────

export type VidlinkApiResponse = {
  sourceId?: string;
  stream?: {
    id?: string;
    type?: string;
    deliveryType?: string;
    playlist?: string;
    playlistHeaders?: {
      Cookie?: string;
      Origin?: string;
      Referer?: string;
    };
    requiresProxy?: boolean;
    qualities?: Record<string, {
      type?: string;
      url?: string;
      size?: string;
      codecName?: string;
    }>;
    captions?: Array<{
      id?: string;
      url: string;
      language?: string;
      type?: string;
      hasCorsRestrictions?: boolean;
    }>;
    alternates?: Record<string, any>;
  };
} | null;

/**
 * Call vidlink.pro /api/b/movie/{token} or /api/b/tv/{token}/{s}/{e}.
 *
 * URL format (verified Oct 25, 2026 via SPA JS analysis — see RE-round5 report):
 *   Movie: /api/b/movie/{token}?multiLang=1
 *   TV:    /api/b/tv/{token}/{season}/{episode}?multiLang=1
 *
 * NOTE: For TV, the TOKEN is the FIRST path segment after /tv/ (not the tmdbId).
 * This was a critical bug in the original implementation — putting tmdbId first
 * caused the API to return 404 HTML instead of stream JSON.
 *
 * @param tmdbId  TMDB ID of the movie or TV show.
 * @param kind    "movie" or "tv".
 * @param season  For tv: season number (1-indexed).
 * @param episode For tv: episode number (1-indexed).
 * @param xpe     X-Playback-Environment header. "hls" returns HLS playlist
 *                + CloudFront cookie (preferred for movies). "standard" returns
 *                MP4 only. TV shows always return MP4 regardless of XPE.
 *                Default "hls".
 * @returns       Parsed JSON response, or null if the token was rejected.
 */
export async function callVidlinkApi(
  tmdbId: number,
  kind: "movie" | "tv",
  season: number = 1,
  episode: number = 1,
  xpe: "hls" | "standard" = "hls"
): Promise<VidlinkApiResponse> {
  const token = await mintVidlinkToken(tmdbId);

  // CRITICAL: token is FIRST path segment for both movie and TV.
  // The tmdbId is NOT in the URL — it's encoded inside the token itself.
  const apiPath =
    kind === "tv"
      ? `/api/b/tv/${token}/${season}/${episode}`
      : `/api/b/movie/${token}`;
  const apiUrl = `https://vidlink.pro${apiPath}?multiLang=1`;

  // Referer must match the SPA's route pattern for the content type.
  // Movie: /movie/{tmdbId}  TV: /tv/{tmdbId}/{season}/{episode}
  const referer =
    kind === "tv"
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${tmdbId}`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: referer,
      "X-Playback-Environment": xpe,
    },
  });

  const text = await res.text();
  // vidlink.pro returns the literal string "null" (4 bytes) when the token
  // is rejected (past timestamp, bad sign, etc).
  if (text === "null" || text.length < 10) return null;

  try {
    return JSON.parse(text) as VidlinkApiResponse;
  } catch {
    return null;
  }
}

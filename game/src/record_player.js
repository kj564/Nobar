// src/record_player.js — fomt record_player.cc + furniture.hh:75-86 (record player)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/furniture.hh        — RecordPlayer struct (has_album:1, album_id:4)
//   /tmp/fomt-repo/src/record_player.cc          — HasAlbum, GetUnknown, RemoveAlbum, SetAlbum
//
// State lives on farmHouse (recordPlayerHasAlbum + recordPlayerAlbumId) to mirror the
// C struct fields (has_album:1 + album_id:4 — fits in a single byte in fomt). The
// farmHouse object is owned by ./src/farm_house.js and imported here as a live binding.

import { farmHouse } from './farm_house.js';

// ===== fomt 1:1 RecordPlayer (furniture.hh:75-86, record_player.cc) =====
// State lives on farmHouse as recordPlayerHasAlbum + recordPlayerAlbumId to mirror
// the C struct fields (has_album:1 + album_id:4 — fits in a single byte in fomt).
//
// record_player.cc:4-6 — unk_080E9605 song-id lookup table (15 entries: 18..32).
// Each album_id (0..14) maps to a song id. album_id 0 → song 18, album_id 14 → song 32.
// GetUnknown() returns 199 (sentinel) when no album is inserted.
export const RECORD_PLAYER_SONG_IDS = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const RECORD_PLAYER_ALBUM_COUNT = 15;        // fomt ARTICLE_ALBUM_1..ARTICLE_ALBUM_15
export const RECORD_PLAYER_EMPTY_SONG_ID = 199;     // record_player.cc:22 sentinel
export const RECORD_PLAYER_ALBUM_ARTICLE_BASE = 0x40; // fomt ARTICLE_ALBUM_1 = 0x40 (record_player.cc:34, 46)

// HasAlbum() — record_player.cc:14-17
export function rpHasAlbum() { return !!farmHouse.recordPlayerHasAlbum; }

// GetUnknown() — record_player.cc:19-25: returns 199 if empty, else song_id from table
export function rpGetSongId() {
  if (!rpHasAlbum()) return RECORD_PLAYER_EMPTY_SONG_ID;
  const idx = farmHouse.recordPlayerAlbumId || 0;
  return RECORD_PLAYER_SONG_IDS[idx] || RECORD_PLAYER_SONG_IDS[0];
}

// SetAlbum(albumArticleId) — record_player.cc:37-53 EXACT port.
// Accepts only ARTICLE_ALBUM_1..ARTICLE_ALBUM_15 (0x40..0x4E). Rejects everything else.
// Sets has_album=true, swaps album_id, and returns the OLD album article id (for shelf swap).
// Returns null when the player doesn't have the record player furniture, or when the
// article isn't a valid album.
export function rpSetAlbum(albumArticleId) {
  if (!farmHouse.hasRecordPlayer) return null;          // no furniture
  if (albumArticleId < RECORD_PLAYER_ALBUM_ARTICLE_BASE ||
      albumArticleId >= RECORD_PLAYER_ALBUM_ARTICLE_BASE + RECORD_PLAYER_ALBUM_COUNT) {
    return null;                                          // record_player.cc:50-51 default branch
  }
  farmHouse.recordPlayerHasAlbum = true;                 // record_player.cc:44
  const oldAlbumId = farmHouse.recordPlayerAlbumId || 0; // record_player.cc:45 old_album_id
  farmHouse.recordPlayerAlbumId = albumArticleId - RECORD_PLAYER_ALBUM_ARTICLE_BASE; // :46
  // record_player.cc:48 — return ArticleStack(Article(old_album_id + ARTICLE_ALBUM_1), 1)
  return RECORD_PLAYER_ALBUM_ARTICLE_BASE + oldAlbumId;
}

// RemoveAlbum() — record_player.cc:27-35 EXACT port.
// Ejects the current album and returns its article id (for shelf return).
// Returns null if no album is currently inserted (record_player.cc:30 ArticleStack() = empty).
export function rpRemoveAlbum() {
  if (!rpHasAlbum()) return null;                        // record_player.cc:29-30
  farmHouse.recordPlayerHasAlbum = false;                // record_player.cc:32
  // record_player.cc:34 — return ArticleStack(Article(ARTICLE_ALBUM_1 + album_id), 1)
  return RECORD_PLAYER_ALBUM_ARTICLE_BASE + (farmHouse.recordPlayerAlbumId || 0);
}

// Song-id → friendly name (for UI display). FoMT song names from fomt-data.js album.desc
// fields. These are the SFC/N64/PS/GC series songs the album records play.
export const RECORD_PLAYER_SONG_NAMES = [
  'Spring Song (SFC Map)',
  'Event Song (SFC)',
  'Fall Song (N64 Map)',
  'Opening (N64)',
  'Girl Opening (PS)',
  'Girl Love Event (PS)',
  'Summer Song (PS2 Map)',
  'Fall Song (PS2 Forest)',
  'Fall/Winter Song (GC Farm)',
  'Bar Night Song (GC)',
  'Unused (RPS 90 wins)',
  'Unused (RPS 80 wins)',
  'Unused (RPS 70 wins)',
  'Unused (RPS 60 wins)',
  'Unused (RPS 50 wins)',
];

// Get the song name for the currently-inserted album (or "Empty" sentinel).
export function rpGetSongName() {
  if (!rpHasAlbum()) return 'Kosong';
  const idx = farmHouse.recordPlayerAlbumId || 0;
  return RECORD_PLAYER_SONG_NAMES[idx] || ('Album #' + (idx + 1));
}

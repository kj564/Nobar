// ============================================================
// FoMT Sound data — VERIFIED from music_player_table.s + song_table.s (RULE 0)
// Source: /tmp/fomt-repo/data/sound/music_player_table.s
//         /tmp/fomt-repo/data/sound/song_table.s
// ============================================================

// fomt music_player_table.s:5 — `.equiv NUM_TRACKS, 8`
export const NUM_TRACKS = 8;

// fomt music_player_table.s:13-17 — 5 MusicPlayer instances (gMusicPlayerA..E)
export const MUSIC_PLAYERS = [
  { id: 'A', tracks: NUM_TRACKS, unknown: 0 },
  { id: 'B', tracks: NUM_TRACKS, unknown: 0 },
  { id: 'C', tracks: NUM_TRACKS, unknown: 0 },
  { id: 'D', tracks: NUM_TRACKS, unknown: 0 },
  { id: 'E', tracks: NUM_TRACKS, unknown: 0 },
];

// fomt song_table.s:7 — gSongTable is .incbin of baserom.gba at 0x13ABF0..0x13B288
// Size = 0x13B288 - 0x13ABF0 = 0x698 = 1688 bytes (binary song data, not portable to JS)
export const SONG_TABLE_OFFSET = '0x13ABF0';
export const SONG_TABLE_SIZE = 1688;

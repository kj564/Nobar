// fomt sound tables, mirrored from fomt data/sound/*.s
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/data/sound/song_table.s          — gSongTable (rodata, .incbin of baserom.gba 0x13ABF0..0x13B288 = 0x698 = 1688 bytes)
//   /tmp/fomt-repo/data/sound/music_player_table.s  — gMusicPlayerTable (5 MusicPlayer entries A..E, each with NUM_TRACKS=8 MusicPlayerTracks)
//
// fomt's song_table.s is essentially an .incbin of binary song data (no human-readable
// per-song constants in the source). The 5 music players (gMusicPlayerA..E) each hold
// 8 MusicPlayerTrack slots used by the m4a audio driver. None of this is directly
// portable to JS — fomt ships binary m4a song sequences, while our web game uses
// .ogg files from /assets/ninja-adventure/Audio/Musics/.
//
// What we CAN mirror faithfully here is the structural layout: NUM_TRACKS, the 5 music
// player IDs, and a placeholder gSongTable array sized to match fomt's binary blob.

// fomt music_player_table.s:5 — `.equiv NUM_TRACKS, 8`
export const NUM_TRACKS = 8;

// fomt music_player_table.s:13-17 — 5 MusicPlayer instances (gMusicPlayerA..E)
export const MUSIC_PLAYERS = [
  { id: 'A', tracks: NUM_TRACKS, unknown: 0 },   // gMusicPlayerA → gMusicPlayerTrackA
  { id: 'B', tracks: NUM_TRACKS, unknown: 0 },   // gMusicPlayerB → gMusicPlayerTrackB
  { id: 'C', tracks: NUM_TRACKS, unknown: 0 },   // gMusicPlayerC → gMusicPlayerTrackC
  { id: 'D', tracks: NUM_TRACKS, unknown: 0 },   // gMusicPlayerD → gMusicPlayerTrackD
  { id: 'E', tracks: NUM_TRACKS, unknown: 0 },   // gMusicPlayerE → gMusicPlayerTrackE
];

// fomt song_table.s:7 — gSongTable is `.incbin` of baserom.gba at 0x13ABF0..0x13B288
//   size = 0x13B288 - 0x13ABF0 = 0x698 = 1688 bytes
// The fomt source does NOT expose individual song IDs or names (they live inside the
// m4a binary). Our web game uses the ninja-adventure .ogg files instead; see the
// AudioManager in index.html for the actual BGM playback.
export const SONG_TABLE_SIZE_BYTES = 0x698;       // 1688 bytes — fomt song_table.s:7
export const SONG_TABLE_BASE_ADDR = 0x13ABF0;       // fomt song_table.s:7 — baserom offset

// Placeholder: array of NUM_TRACKS × MUSIC_PLAYERS.length song-track slot descriptors.
// fomt m4a driver fills these from the binary gSongTable at runtime; we keep the
// structure here for fidelity but do not populate song data (we use .ogg files).
export const gSongTable = MUSIC_PLAYERS.map(p => ({
  playerId: p.id,
  trackSlots: new Array(p.tracks).fill(null),
}));

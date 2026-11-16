// Auto-generated: available sprite frames per fomt character ID
// Source: assets/fomt/chars_final/ (extracted from fomt ROM)
// Used by drawCharacter() to pick the best available frame for each direction+walk state.
// Frame layout: 0,1,2=down, 3,4,5=left, 6,7,8=right, 9,10,11=up
// (idle, walk1, walk2 per direction)

export const SPRITE_FRAMES_AVAILABLE = {
  "00": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "01": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "02": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "03": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "04": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "05": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "06": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "07": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7
  ],
  "08": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7
  ],
  "09": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    10,
    11
  ],
  "10": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "11": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "12": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "13": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "14": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "15": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "16": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11
  ],
  "17": [
    0,
    1,
    2,
    4,
    5,
    6,
    7,
    8,
    9
  ],
  "18": [
    3,
    4,
    5,
    11
  ],
  "19": [
    0,
    1,
    2,
    7,
    8,
    9,
    10
  ],
  "20": [
    4,
    5,
    6
  ],
  "21": [
    0,
    1,
    2
  ]
};

// Best frame picker: given charId + direction + walkState, return the best available frame index.
// Falls back: specific frame → direction idle → down idle → first available.
export function pickFrame(charId, dir, walking) {
  const frames = SPRITE_FRAMES_AVAILABLE[charId];
  if (!frames || frames.length === 0) return -1;  // no sprites → procedural
  const set = new Set(frames);
  const dirBase = dir === 'down' ? 0 : dir === 'left' ? 3 : dir === 'right' ? 6 : dir === 'up' ? 9 : 0;
  const walkOffset = walking ? (Math.floor(performance.now() / 200) % 4 === 1 ? 1 : Math.floor(performance.now() / 200) % 4 === 3 ? 2 : 0) : 0;

  // Try: requested frame → direction idle (dirBase+0) → down idle (0) → first available
  const candidates = [
    dirBase + walkOffset,  // exact frame we want
    dirBase,               // idle for this direction
    dirBase + 1,           // walk1 for this direction (often exists when walk2 doesn't)
    dirBase + 2,           // walk2
    0,                     // down idle (always exists if any frames exist)
    frames[0],             // first available frame (last resort)
  ];
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return frames[0];
}

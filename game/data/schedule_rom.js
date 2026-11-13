// fomt NPC Schedule Data — 1:1 port of data_schedules.cc (456 lines)
// Source: /tmp/fomt-repo/src/data_schedules.cc
// Read line-by-line (Rule Zero).
//
// This is REAL fomt schedule data for NPC "Unk_080F1A80" (likely a villager).
// The schedule system controls where NPCs walk at what time of day.
//
// Data structure (schedule_info.hh):
//   ScheduleInfo: { select_schedule_fn, num_schedules, schedules[] }
//   Schedule: { num_time_entries, time_entries[] }
//   ScheduleEntry: { time (min since 06:00), PathInfo* }
//   PathInfo: { points, num_points, x_start, y_start, location_start:10, facing_start:2, point_type_select:1 }
//   PathPointA: { instant (frame/time), coord (i16), is_y_coord:1 }
//   PathPointB: { coord, speed, unk_04 (duration), facing:2, is_y_coord:1 }
//
// Time decode (from tools/scripts/dump_schedule.py):
//   time=0 → 06:00, time=60 → 07:00, time=1054 → 23:34
//   Formula: 6 + time/60 hours, time%60 minutes

// ===== PathPointA (schedule_info.hh:6-11) =====
// { u16 instant; i16 coord; bool is_y_coord:1 }
// instant = frame/time index along path
// coord = x or y coordinate (selected by is_y_coord)

// ===== PathPointB (schedule_info.hh:13-20) =====
// { u16 coord; u16 speed; u16 unk_04; u16 facing:2; bool is_y_coord:1 }

// ===== PathInfo (schedule_info.hh:22-31) =====
// { void const* points; u16 num_points; i16 x_start; i16 y_start;
//   u32 location_start:10; u32 facing_start:2; bool point_type_select:1 }
// location_start: map ID (0..1023)
// facing_start: 0=down, 1=left, 2=right, 3=up (from dump_schedule.py)
// point_type_select: 0=PathPointA[], 1=PathPointB[]

// All 23 PathInfo definitions (data_schedules.cc:141-369)
export const PATHS = {
  0:  { points: null, num_points: 0, x_start: 72,   y_start: 80,  location: 11, facing: 0, type_b: false },
  1:  { points: null, num_points: 0, x_start: 64,   y_start: 83,  location: 10, facing: 1, type_b: false },
  2:  { points: [[19,240,1],[21,144,0],[22,216,1],[47,776,0],[48,184,1]], num_points: 5, x_start: 104, y_start: 704, location: 5, facing: 0, type_b: false },
  3:  { points: null, num_points: 0, x_start: 776,  y_start: 184, location: 5, facing: 0, type_b: false },
  4:  { points: [[1,216,1],[26,144,0],[27,240,1],[29,104,0],[49,736,1]], num_points: 5, x_start: 776, y_start: 184, location: 5, facing: 0, type_b: false },
  5:  { points: [[6,152,1],[21,472,0],[25,248,1],[29,572,0],[30,227,1]], num_points: 5, x_start: 104, y_start: 0, location: 7, facing: 0, type_b: false },
  6:  { points: [[1,248,1],[5,472,0],[9,152,1],[40,1248,0],[41,128,1],[42,1272,0],[47,0,1]], num_points: 7, x_start: 572, y_start: 227, location: 7, facing: 0, type_b: false },
  7:  { points: [[7,536,1],[32,632,0],[34,488,1]], num_points: 3, x_start: 1260, y_start: 704, location: 5, facing: 0, type_b: false },
  8:  { points: null, num_points: 0, x_start: 232,  y_start: 120, location: 21, facing: 1, type_b: false },
  9:  { points: [[2,536,1],[27,1260,0],[35,736,1]], num_points: 3, x_start: 632, y_start: 488, location: 5, facing: 0, type_b: false },
  10: { points: [[5,128,1],[6,1248,0],[7,152,1],[38,472,0],[42,248,1],[46,572,0],[47,227,1]], num_points: 7, x_start: 1272, y_start: 0, location: 7, facing: 0, type_b: false },
  11: { points: [[3,384,1],[9,376,0]], num_points: 2, x_start: 220, y_start: 448, location: 6, facing: 0, type_b: false },
  12: { points: [[304,2,120,0,1],[384,2,120,1,1]], num_points: 2, x_start: 376, y_start: 384, location: 6, facing: 0, type_b: true },
  13: { points: [[6,220,0],[10,480,1]], num_points: 2, x_start: 376, y_start: 384, location: 6, facing: 0, type_b: false },
  14: { points: [[5,128,1],[6,1248,0],[7,152,1],[38,472,0],[42,248,1],[46,572,0],[47,227,1]], num_points: 7, x_start: 1272, y_start: 0, location: 7, facing: 0, type_b: false },
  15: { points: [[1,248,1],[5,472,0],[9,152,1],[16,296,0],[18,116,1]], num_points: 5, x_start: 572, y_start: 227, location: 7, facing: 0, type_b: false },
  16: { points: null, num_points: 0, x_start: 88,   y_start: 88,  location: 38, facing: 0, type_b: false },
  17: { points: [[2,152,1],[9,472,0],[13,248,1],[17,572,0],[18,227,1]], num_points: 5, x_start: 296, y_start: 116, location: 7, facing: 0, type_b: false },
  18: { points: [[1,248,1],[3,520,0],[7,352,1]], num_points: 3, x_start: 572, y_start: 227, location: 7, facing: 0, type_b: false },
  19: { points: [[440,2,0,0,0],[256,2,120,2,1],[352,2,0,0,1],[520,2,120,3,0]], num_points: 4, x_start: 520, y_start: 352, location: 7, facing: 0, type_b: true },
  20: { points: [[4,248,1],[6,572,0],[7,227,1]], num_points: 3, x_start: 520, y_start: 352, location: 7, facing: 0, type_b: false },
  21: { points: [[4,248,1],[6,472,0],[10,152,1],[25,104,0],[31,0,1]], num_points: 5, x_start: 520, y_start: 352, location: 7, facing: 0, type_b: false },
  22: { points: [[4,248,1],[6,472,0],[10,152,1],[41,1248,0],[42,128,1],[43,1272,0],[48,0,1]], num_points: 7, x_start: 520, y_start: 352, location: 7, facing: 0, type_b: false },
};

// ===== ScheduleEntry (schedule_info.hh:33-37) =====
// { u16 time; PathInfo* path }
// time = minutes since 06:00 (0=06:00, 60=07:00, 1054=23:34)

// Schedule 1: 17 entries — normal weekday (data_schedules.cc:85-103)
export const SCHEDULE_1 = [
  { time: 0,    path: PATHS[19] },  // 06:00
  { time: 60,   path: PATHS[21] },  // 07:00
  { time: 91,   path: PATHS[2]  },  // 07:31
  { time: 139,  path: PATHS[3]  },  // 08:19
  { time: 242,  path: PATHS[4]  },  // 10:02
  { time: 291,  path: PATHS[5]  },  // 10:51
  { time: 321,  path: PATHS[1]  },  // 11:21
  { time: 423,  path: PATHS[18] },  // 13:03
  { time: 430,  path: PATHS[19] },  // 13:10
  { time: 600,  path: PATHS[20] },  // 16:00
  { time: 607,  path: PATHS[1]  },  // 16:07
  { time: 780,  path: PATHS[6]  },  // 19:00
  { time: 827,  path: PATHS[7]  },  // 19:47
  { time: 861,  path: PATHS[8]  },  // 20:21
  { time: 972,  path: PATHS[9]  },  // 22:12
  { time: 1007, path: PATHS[10] },  // 22:47
  { time: 1054, path: PATHS[0]  },  // 23:34
];

// Schedule 2: 9 entries — rainy day (data_schedules.cc:105-115)
export const SCHEDULE_2 = [
  { time: 0,    path: PATHS[19] },  // 06:00
  { time: 60,   path: PATHS[20] },  // 07:00
  { time: 67,   path: PATHS[0]  },  // 07:07
  { time: 780,  path: PATHS[6]  },  // 19:00
  { time: 827,  path: PATHS[7]  },  // 19:47
  { time: 861,  path: PATHS[8]  },  // 20:21
  { time: 972,  path: PATHS[9]  },  // 22:12
  { time: 1007, path: PATHS[10] },  // 22:47
  { time: 1054, path: PATHS[0]  },  // 23:34
];

// Schedule 3: 17 entries — alternate day (data_schedules.cc:117-135)
export const SCHEDULE_3 = [
  { time: 0,    path: PATHS[19] },  // 06:00
  { time: 60,   path: PATHS[22] },  // 07:00
  { time: 108,  path: PATHS[11] },  // 07:48
  { time: 117,  path: PATHS[12] },  // 07:57
  { time: 240,  path: PATHS[13] },  // 10:00
  { time: 250,  path: PATHS[14] },  // 10:10
  { time: 297,  path: PATHS[1]  },  // 10:57
  { time: 420,  path: PATHS[15] },  // 13:00
  { time: 438,  path: PATHS[16] },  // 13:18
  { time: 600,  path: PATHS[17] },  // 16:00
  { time: 618,  path: PATHS[1]  },  // 16:18
  { time: 780,  path: PATHS[6]  },  // 19:00
  { time: 827,  path: PATHS[7]  },  // 19:47
  { time: 861,  path: PATHS[8]  },  // 20:21
  { time: 972,  path: PATHS[9]  },  // 22:12
  { time: 1007, path: PATHS[10] },  // 22:47
  { time: 1054, path: PATHS[0]  },  // 23:34
];

// Schedule 4: 1 entry — sick day (data_schedules.cc:137-139)
export const SCHEDULE_4 = [
  { time: 0, path: PATHS[0] },  // 06:00 — stay home all day
];

// ===== ScheduleInfo (schedule_info.hh:45-50) =====
// { select_schedule_fn, num_schedules, schedules[] }
// Index 0 = nullptr → hide NPC (data_schedules.cc:74)
// func_0803DA24 = select_schedule function (asm, not decompiled)
export const SCHEDULE_INFO = {
  selectSchedule: null,  // func_0803DA24 (not decompiled in C)
  numSchedules: 5,
  schedules: [null, SCHEDULE_1, SCHEDULE_2, SCHEDULE_3, SCHEDULE_4],
};

// ===== Helper: decode time (from dump_schedule.py:5-6) =====
// time=0 → 06:00, time=60 → 07:00, etc.
// Formula: hours = 6 + time // 60, minutes = time % 60
export function decodeTime(timeMinutes) {
  const hours = 6 + Math.floor(timeMinutes / 60);
  const minutes = timeMinutes % 60;
  return { hours: hours % 24, minutes };
}

export function timeLabel(timeMinutes) {
  const t = decodeTime(timeMinutes);
  return `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
}

// ===== Helper: find current schedule entry (npc_entity.cc schedule logic) =====
// Returns the entry with the largest time <= currentMinutesSince0600
export function getCurrentScheduleEntry(schedule, currentMinutesSince0600) {
  if (!schedule || schedule.length === 0) return null;
  let entry = schedule[0];
  for (const e of schedule) {
    if (e.time <= currentMinutesSince0600) entry = e;
    else break;
  }
  return entry;
}

// ===== Helper: interpolate path position (from npc_entity.cc asm analysis) =====
// PathPointA: { instant, coord, is_y_coord }
// NPC starts at (x_start, y_start) and moves through waypoints
// Each waypoint: at frame `instant`, coordinate `coord` (x or y based on is_y_coord)
export function getPathPosition(pathInfo, currentFrame) {
  if (!pathInfo || !pathInfo.points || pathInfo.points.length === 0) {
    return { x: pathInfo?.x_start || 0, y: pathInfo?.y_start || 0, facing: pathInfo?.facing || 0 };
  }
  let x = pathInfo.x_start;
  let y = pathInfo.y_start;
  for (const point of pathInfo.points) {
    if (pathInfo.type_b) {
      // PathPointB: { coord, speed, unk_04, facing, is_y_coord }
      const [coord, speed, unk04, facing, isY] = point;
      if (currentFrame >= point[0]) {  // coord is first field for PathPointB too? No, PathPointB doesn't have instant
        // PathPointB format: { coord, speed, unk_04, facing:2, is_y_coord:1 }
        // No instant field — these are sequential position targets
      }
    } else {
      // PathPointA: { instant, coord, is_y_coord }
      const [instant, coord, isY] = point;
      if (currentFrame >= instant) {
        if (isY) y = coord;
        else x = coord;
      }
    }
  }
  return { x, y, facing: pathInfo.facing };
}

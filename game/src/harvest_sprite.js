// src/harvest_sprite.js — fomt harvest_sprite.hh + harvest_sprite.cc (sprite team)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/harvest_sprite.hh    — HarvestSprite struct (Npc subclass with task_exp[3],
//                                                  minigame_exp[3], current_task:2, work_days_left:3, played_minigame)
//   /tmp/fomt-repo/src/harvest_sprite.cc         — AddTaskExp, StartTask, SetPlayedMinigame, TaskDayUpdate, DayUpdate
//
// This module exports the harvestSprites array (3 sprites: Chef, Timid, Staid) + the
// fomt 1:1 helper ports. The UI glue function hsPlayMinigame (which calls toast/
// AudioManager/updateHUD/save/openSpriteHut) stays in index.html because those UI
// helpers live there.

// ===== fomt 1:1 Harvest Sprite team (harvest_sprite.hh + harvest_sprite.cc) =====
// fomt has 3 Harvest Sprites (Chef, Timid, Staid) that the player can hire to help
// with farm work. Each is a Npc subclass (harvest_sprite.hh:9) with:
//   task_exp[3]     : u8  (0..255) per task type
//   minigame_exp[3] : u8  (0..31)  per task type — determines tier
//   current_task    : 2-bit (0=HARVEST, 1=WATER, 2=ANIMALS, 3=NONE)
//   work_days_left  : 3-bit (0..7, cap 7 days)
//   played_minigame : bool (resets daily)
// Friendship is inherited from Npc (0..255, 10 hearts, 25 per heart).
export let harvestSprites = [
  { name: 'Chef',  friendship: 50, met: false, spoken_today: false, gifted_today: false,
    days_since_last_spoken: 0,
    task_exp: [0, 0, 0], minigame_exp: [0, 0, 0], current_task: 3, work_days_left: 0, played_minigame: false },
  { name: 'Timid', friendship: 50, met: false, spoken_today: false, gifted_today: false,
    days_since_last_spoken: 0,
    task_exp: [0, 0, 0], minigame_exp: [0, 0, 0], current_task: 3, work_days_left: 0, played_minigame: false },
  { name: 'Staid', friendship: 50, met: false, spoken_today: false, gifted_today: false,
    days_since_last_spoken: 0,
    task_exp: [0, 0, 0], minigame_exp: [0, 0, 0], current_task: 3, work_days_left: 0, played_minigame: false },
];
// fomt harvest_sprite.hh:11-19 Task enum: TASK_HARVEST=0, TASK_WATER=1, TASK_ANIMALS=2, TASK_NONE=3
export const HS_TASK_HARVEST = 0;
export const HS_TASK_WATER   = 1;
export const HS_TASK_ANIMALS  = 2;
export const HS_TASK_NONE     = 3;
// fomt harvest_sprite.cc:84 — minigame_exp cap is 31 (NOT 255)
export const HS_MINIGAME_EXP_CAP = 31;
// fomt harvest_sprite.cc:62 — task_exp cap is 255 (u8)
export const HS_TASK_EXP_CAP = 255;
// fomt harvest_sprite.cc:72 — work_days_left is 3-bit (0..7); StartTask clamps via caller
export const HS_WORK_DAYS_CAP = 7;
// fomt harvest_sprite.cc:80-103 — SetPlayedMinigame tier thresholds for task_exp delta
//   minigame_exp < 6  → +1
//   minigame_exp < 11 → +2
//   minigame_exp < 17 → +3
//   minigame_exp >=17 → +4
// On failure: negate the delta. Friendship +1 always (regardless of success).

// ===== fomt 1:1 Harvest Sprite helpers (harvest_sprite.cc exact ports) =====
// hsAddTaskExp(sprite, task, amount) — harvest_sprite.cc:53-67 AddTaskExp.
//   Clamps total to [0, 255] (u8). Task must be 0..2 (NUM_TASKS-1).
export function hsAddTaskExp(sprite, task, amount) {
  if (task < 0 || task >= 3) return;   // fomt guards with task < NUM_TASKS
  let total = sprite.task_exp[task] + amount;
  if (total < 0) total = 0;
  else if (total > HS_TASK_EXP_CAP) total = HS_TASK_EXP_CAP;
  sprite.task_exp[task] = total;
}
// hsStartTask(sprite, task, days) — harvest_sprite.cc:69-73 StartTask.
//   Sets current_task + work_days_left (3-bit, capped at 7 by caller).
export function hsStartTask(sprite, task, days) {
  sprite.current_task = task;
  sprite.work_days_left = Math.min(HS_WORK_DAYS_CAP, Math.max(0, days));
}
// hsSetPlayedMinigame(sprite, task, succeeded) — harvest_sprite.cc:80-103 EXACT port.
//   1. Set played_minigame = true (regardless of success).
//   2. If succeeded AND minigame_exp[task] != 31 → minigame_exp[task]++ (cap 31).
//   3. Tier thresholds based on the (possibly just-incremented) minigame_exp[task]:
//        < 6  → task_exp_delta = 1
//        < 11 → task_exp_delta = 2
//        < 17 → task_exp_delta = 3
//        >=17 → task_exp_delta = 4
//   4. If !succeeded → task_exp_delta = -task_exp_delta (negate).
//   5. AddTaskExp(task, delta) — clamps 0..255.
//   6. AddFriendship(1) — friendship +1 always (regardless of success).
export function hsSetPlayedMinigame(sprite, task, succeeded) {
  if (task < 0 || task >= 3) return;
  sprite.played_minigame = true;
  if (succeeded && sprite.minigame_exp[task] !== HS_MINIGAME_EXP_CAP) {
    sprite.minigame_exp[task]++;
  }
  let taskExpDelta;
  if (sprite.minigame_exp[task] < 6) taskExpDelta = 1;
  else if (sprite.minigame_exp[task] < 11) taskExpDelta = 2;
  else if (sprite.minigame_exp[task] < 17) taskExpDelta = 3;
  else taskExpDelta = 4;
  if (!succeeded) taskExpDelta = -taskExpDelta;
  hsAddTaskExp(sprite, task, taskExpDelta);
  // Npc::AddFriendship(1) — friendship clamped to 0..255
  sprite.friendship = Math.max(0, Math.min(255, (sprite.friendship || 0) + 1));
}
// hsTaskDayUpdate(sprite) — harvest_sprite.cc:105-116 TaskDayUpdate.
//   If work_days_left > 0:
//     - work_days_left-- (3-bit cap implicit)
//     - if work_days_left becomes 0 → current_task = TASK_NONE
//     - SubtractFriendship(2) — friendship -2 each working day (penalty for hiring)
export function hsTaskDayUpdate(sprite) {
  if (sprite.work_days_left > 0) {
    sprite.work_days_left--;
    if (sprite.work_days_left === 0) sprite.current_task = HS_TASK_NONE;
    sprite.friendship = Math.max(0, (sprite.friendship || 0) - 2);
  }
}
// hsDayUpdate(sprite) — harvest_sprite.cc:118-122 DayUpdate.
//   1. Npc::DayUpdate(rand()%100) — same as regular NPC daily tick (early game -1 if not
//      spoken/gifted, +1 if spoken, days_since_last_spoken caps 31).
//   2. played_minigame = false.
//   3. TaskDayUpdate() is invoked from the surrounding loop (kept separate so callers can
//      run sprite auto-work between the two — fomt order: Npc::DayUpdate, played=false,
//      then TaskDayUpdate. We mirror that here by calling hsTaskDayUpdate at the end).
export function hsDayUpdate(sprite, earlyGame) {
  // Npc::DayUpdate(arg_01) — same logic as advanceDay's npc loop
  if (sprite.met) {
    if (!sprite.spoken_today && !sprite.gifted_today) {
      if (sprite.days_since_last_spoken < 31) sprite.days_since_last_spoken++;
      if (earlyGame) sprite.friendship = Math.max(0, sprite.friendship - 1);
    } else {
      sprite.days_since_last_spoken = 0;
      if (sprite.spoken_today) sprite.friendship = Math.min(255, sprite.friendship + 1);
    }
    sprite.spoken_today = false;
    sprite.gifted_today = false;
  }
  sprite.played_minigame = false;
  hsTaskDayUpdate(sprite);
}
// hsHearts(sprite) — friendship 0..255 → 0..10 hearts (25 per heart)
export function hsHearts(sprite) { return Math.floor((sprite.friendship || 0) / 25); }
// hsTaskLabel(task) — human-readable task name for UI
export function hsTaskLabel(task) {
  return task === HS_TASK_HARVEST ? 'Panen' :
         task === HS_TASK_WATER   ? 'Siram' :
         task === HS_TASK_ANIMALS ? 'Hewan' : '—';
}
// hsPlayMinigame(spriteIdx, task) remains in index.html (depends on toast, AudioManager,
// updateHUD, save, openSpriteHut — all UI glue living in index.html).

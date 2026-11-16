// src/farmer.js — fomt farmer.hh + farmer.cc (player state, stamina/fatigue, power
// berries, kappa berry, tool levels, tool usage)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/farmer.hh        — Farmer struct (stamina, fatigue, powerBerries, kappaBerry, ToolLevel)
//   /tmp/fomt-repo/src/farmer.cc            — adjustStamina, adjustFatigue, acquirePowerBerry, acquireKappaBerry,
//                                              ToolLevel::AddUsage, SetPendingLevel, Commit
//
// This module owns the player state and all stamina/fatigue/tool-level mutations.
// Other modules import { player, adjustStamina, ... } from './src/farmer.js'.

import { TILE, TOOL_LEVEL_MAX, TOOL_USAGE_MAX, TOOL_FAMILY_NAMES } from '../include/constants.js';

// ===== fomt-faithful Player State (farmer.hh:41-61) =====
// stamina: 8-bit, init 150, max = 150 + powerBerries*10 (cap 250)
// fatigue: 8-bit stored as 2×display (0..200 internal = 0..100 shown)
//   - When kappaBerry is FALSE, fatigue DELTA is doubled (farmer.cc func_0800EA68)
//   - When kappaBerry is TRUE, fatigue delta is NOT doubled (i.e. halves accumulation)
// powerBerries: 4-bit (0..10), each grants +10 max stamina immediately (func_0800EAFC)
// kappaBerry: bool, sets unk_44_04=true (func_0800EAF0)
export let player = {
  x: 20 * TILE, y: 22 * TILE,
  dir: 'down',
  walkFrame: 0,
  walkTime: 0,
  moving: false,
  gold: 500,
  stamina: 150,           // fomt: init 150, 8-bit
  fatigue: 0,             // fomt: init 0, stored 2× (so 0..200 = 0..100 display)
  powerBerries: 0,        // fomt: 4-bit, 0..10
  kappaBerry: false,      // fomt: unk_44_04 bool
  maxStamina: 150,       // fomt: 150 + powerBerries*10 (max 250)
  inventory: { parsnip: 0, potato: 0, tomato: 0, corn: 0, carrot: 0, pumpkin: 0, cabbage: 0, beetroot: 0, cauliflower: 0, kale: 0, radish: 0, sunflower: 0, wheat: 0 },
  seeds: { parsnip: 5, potato: 2, tomato: 1, corn: 0, carrot: 0, pumpkin: 0, cabbage: 0, beetroot: 0, cauliflower: 0, kale: 0, radish: 0, sunflower: 0, wheat: 0 },
  water: 20, maxWater: 20,
  medicine: 0,           // fomt ANIMAL_MEDICINE count (cures sick animals)
  blueFeather: false,   // fomt BLUE_FEATHER (article id 0x4B) — bought at Carpenter for proposal
};

// ===== fomt helpers (farmer.cc) =====
// adjustStamina(delta): clamp to [0, maxStamina] (func_0800E9E4)
export function adjustStamina(delta) {
  const v = player.stamina + delta;
  player.stamina = Math.max(0, Math.min(player.maxStamina, v));
}
// adjustFatigue(delta): fomt func_0800EA68 — if !kappaBerry, POSITIVE delta doubled
export function adjustFatigue(delta) {
  if (delta > 0) {
    if (!player.kappaBerry) delta = delta * 2;     // Kappa berry halves fatigue gain
    player.fatigue = Math.min(200, player.fatigue + delta);
  } else if (delta < 0) {
    delta = delta * 2;                              // recovery is always doubled
    player.fatigue = Math.max(0, player.fatigue + delta);
  }
}
// acquirePowerBerry(): fomt func_0800EAFC — +10 max stamina, max 10 berries
export function acquirePowerBerry() {
  if (player.powerBerries < 10) {
    player.powerBerries++;
    player.maxStamina = 150 + player.powerBerries * 10;
    player.stamina = Math.min(player.maxStamina, player.stamina + 10);
    return true;
  }
  return false;
}
// acquireKappaBerry(): fomt func_0800EAF0 — halves future fatigue gain
export function acquireKappaBerry() {
  if (!player.kappaBerry) {
    player.kappaBerry = true;
    return true;
  }
  return false;
}

// stamina exhaustion check (fomt func_0800E504: fatigue >= 200 = exhausted)
export function isFatigued() { return player.fatigue >= 200; }
export function isExhausted() { return player.stamina <= 0; }

// ===== fomt 1:1 Farmer ToolLevel system (farmer.hh:15-37, farmer.cc:513-549) =====
// 6 tools × 5 upgrade tiers: Hoe, Sickle, Axe, Hammer, Watering Can, Fishing Rod
// Tiers: LEVEL_0 (Iron) → LEVEL_1 (Copper) → LEVEL_2 (Silver) → LEVEL_3 (Gold) → LEVEL_4 (Mystrile) → LEVEL_5 (Mythic)
// (We skip Cursed/Blessed tiers since those are post-game, see tool.def 0x05/0x06)
// Constants TOOL_LEVEL_MAX, TOOL_USAGE_MAX, TOOL_FAMILY_NAMES imported from include/constants.js
// (single source of truth — fomt farmer.hh:15-37, farmer.cc:513-549).
export let toolLevels = [
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 0: Hoe
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 1: Sickle
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 2: Axe
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 3: Hammer
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 4: Watering Can
  { usage: 0, committedLevel: 0, pendingLevel: 0 },  // 5: Fishing Rod
];
// ToolLevel.AddUsage (farmer.cc func_0800EF88): usage = min(usage + n, 0xFFFF)
export function toolAddUsage(familyIdx, n) {
  toolLevels[familyIdx].usage = Math.min(TOOL_USAGE_MAX, toolLevels[familyIdx].usage + n);
}
// ToolLevel.SetPendingLevel (farmer.cc func_0800EFB4)
export function toolSetPendingLevel(familyIdx, newLevel) {
  if (toolLevels[familyIdx].committedLevel !== newLevel) {
    toolLevels[familyIdx].pendingLevel = newLevel;
  }
}
// ToolLevel.Commit (farmer.cc func_0800EFD8)
export function toolCommitLevel(familyIdx) {
  toolLevels[familyIdx].committedLevel = toolLevels[familyIdx].pendingLevel;
}
export function toolHasPendingUpgrade(familyIdx) {
  return toolLevels[familyIdx].pendingLevel !== toolLevels[familyIdx].committedLevel;
}

// Get the fomt tool id for current upgrade tier of a tool family
// Maps tool family + level → fomt TOOLS[].id (e.g., hoe + level 2 = COPPER_HOE = 0x09)
export function getFomtToolId(familyIdx, level) {
  if (!window.FOMT || !window.FOMT.TOOLS) return null;
  const tierTags = ['IRON', 'COPPER', 'SILVER', 'GOLD', 'MYSTRILE', 'MYTHIC'];
  // Special: watering can has no IRON prefix, just "WATERING_CAN"
  const familyTags = ['HOE', 'SICKLE', 'AXE', 'HAMMER', 'WATERING_CAN', 'FISHING_ROD'];
  const tier = tierTags[level] || 'IRON';
  const tag = (familyIdx === 4)  // watering can
    ? (level === 0 ? 'WATERING_CAN' : `${tier}_WATERING_CAN`)
    : `${tier}_${familyTags[familyIdx]}`;
  const t = window.FOMT.TOOL_BY_TAG[tag];
  return t ? t.id : null;
}

// ===== fomt Power Berries & Kappa Berry collectibles =====
// 10 Power Berries +1 max stamina each (fomt func_0800EAFC)
// 1 Kappa berry in a hard-to-reach spot (halves fatigue, fomt func_0800EAF0)
export let powerBerrySpots = [
  { x: 5 * TILE,  y: 5 * TILE,  taken: false },   // 1: NW corner of town
  { x: 35 * TILE, y: 4 * TILE,  taken: false },   // 2: NE forest edge
  { x: 36 * TILE, y: 27 * TILE, taken: false },   // 3: SE corner
  { x: 3 * TILE,  y: 26 * TILE, taken: false },   // 4: SW corner
  { x: 19 * TILE, y: 2 * TILE,  taken: false },   // 5: top center near shop
  { x: 30 * TILE, y: 12 * TILE, taken: false },   // 6: forest interior
  { x: 22 * TILE, y: 22 * TILE, taken: false },   // 7: forest clearing
  { x: 8 * TILE,  y: 15 * TILE, taken: false },   // 8: town alley
  { x: 14 * TILE, y: 24 * TILE, taken: false },   // 9: south field edge
  { x: 33 * TILE, y: 18 * TILE, taken: false },   // 10: eastern grove
];
export let kappaBerrySpot = { x: 38 * TILE, y: 28 * TILE, taken: false }; // far SE corner (hidden)

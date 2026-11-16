// src/rucksack.js — fomt rucksack.hh + rucksack.cc (inventory bag)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/rucksack.hh   — Rucksack struct (FixedVec<RucksackItem, 8>, FixedVec<ToolStack, 8>)
//   /tmp/fomt-repo/src/rucksack.cc       — GetUpgradeLevel, Upgrade, GetFirstFreeItemSlot, AddAmountOfFood/Article/Tool
//
// This module owns the rucksack (player inventory bag) state and all slot/stack
// mutations. Other modules import { rucksack, rucksackUpgradeLevel, ... } from './src/rucksack.js'.

import {
  RUCKSACK_MAX_SLOTS, RUCKSACK_MAX_TOOL_SLOTS, TOOLSTACK_MAX_AMOUNT,
} from '../include/constants.js';

// ===== fomt 1:1 Rucksack system (rucksack.hh, rucksack.cc) =====
// - Upgrade ladder: 2 → 4 → 8 slots (LEVEL_0/1/2). Tools same slot count.
// - Each item slot holds 1 RucksackItem (no per-slot stacking for items).
// - Tool slots DO stack up to 99 (ToolStack::MAX_AMOUNT).
// - CycleItemBack/Front shift items through slots.
// Constants RUCKSACK_MAX_SLOTS, RUCKSACK_MAX_TOOL_SLOTS, TOOLSTACK_MAX_AMOUNT imported
// from include/constants.js (single source of truth — fomt rucksack.hh FixedVec sizes).
export let rucksack = {
  itemSlotsUsed: 2,                    // fomt: start LEVEL_0 = 2 slots
  toolSlotsUsed: 2,
  items: [],                           // array of {kind:'food'|'article', id, wrapped} or null (size RUCKSACK_MAX_SLOTS)
  tools: [],                           // array of {id, amount} or null (size RUCKSACK_MAX_TOOL_SLOTS)
};
// Initialize rucksack to fomt LEVEL_0 (rucksack.cc:3-6 — Rucksack() : items(2, RucksackItem()), tools(2, ToolStack()))
for (let i = 0; i < RUCKSACK_MAX_SLOTS; i++) rucksack.items[i] = null;
for (let i = 0; i < RUCKSACK_MAX_TOOL_SLOTS; i++) rucksack.tools[i] = null;

// rucksack.GetUpgradeLevel (rucksack.cc:8-22): 2→LEVEL_0, 4→LEVEL_1, 8→LEVEL_2
export function rucksackUpgradeLevel() {
  if (rucksack.itemSlotsUsed >= 8) return 2;     // LEVEL_2
  if (rucksack.itemSlotsUsed >= 4) return 1;     // LEVEL_1
  return 0;                                       // LEVEL_0
}
// rucksack.Upgrade (rucksack.cc:275-290): 2→4→8, blocked at LEVEL_2
export function rucksackUpgrade() {
  if (rucksackUpgradeLevel() >= 2) return false;
  rucksack.itemSlotsUsed = Math.min(8, rucksack.itemSlotsUsed * 2);
  rucksack.toolSlotsUsed = rucksack.itemSlotsUsed;
  return true;
}
// rucksack.GetFirstFreeItemSlot (rucksack.cc:48-82)
export function rucksackFirstFreeItemSlot() {
  for (let i = 0; i < rucksack.itemSlotsUsed; i++) if (!rucksack.items[i]) return i;
  return -1;
}
// rucksack.AddAmountOfFood (rucksack.cc:679-721) — 1 food per slot, no stacking
export function rucksackAddFood(foodId, amount) {
  let leftover = amount;
  // First, fill existing matching slots (shouldn't be any since 1 per slot, but be safe)
  for (let i = 0; i < rucksack.itemSlotsUsed && leftover > 0; i++) {
    if (rucksack.items[i] && rucksack.items[i].kind === 'food' && rucksack.items[i].id === foodId) {
      // fomt: each slot holds 1 item, so we don't stack here
    }
  }
  // Then fill empty slots
  for (let i = 0; i < rucksack.itemSlotsUsed && leftover > 0; i++) {
    if (!rucksack.items[i]) {
      rucksack.items[i] = { kind: 'food', id: foodId, wrapped: false };
      leftover--;
    }
  }
  return leftover;     // un-added remainder
}
export function rucksackAddArticle(articleId, amount) {
  let leftover = amount;
  for (let i = 0; i < rucksack.itemSlotsUsed && leftover > 0; i++) {
    if (!rucksack.items[i]) {
      rucksack.items[i] = { kind: 'article', id: articleId, wrapped: false };
      leftover--;
    }
  }
  return leftover;
}
// rucksack.AddAmountOfTool (rucksack.cc:750-777) — fills empty slots with stacks of min(amount, 99), then tops up matching
export function rucksackAddTool(toolId, amount) {
  let leftover = amount;
  // First top up matching slots
  for (let i = 0; i < rucksack.toolSlotsUsed && leftover > 0; i++) {
    if (rucksack.tools[i] && rucksack.tools[i].id === toolId) {
      const space = TOOLSTACK_MAX_AMOUNT - rucksack.tools[i].amount;
      const add = Math.min(leftover, space);
      rucksack.tools[i].amount += add;
      leftover -= add;
    }
  }
  // Then fill empty slots with new stacks
  for (let i = 0; i < rucksack.toolSlotsUsed && leftover > 0; i++) {
    if (!rucksack.tools[i]) {
      const add = Math.min(leftover, TOOLSTACK_MAX_AMOUNT);
      rucksack.tools[i] = { id: toolId, amount: add };
      leftover -= add;
    }
  }
  return leftover;
}
export function rucksackGetAmountOfTool(toolId) {
  let total = 0;
  for (let i = 0; i < rucksack.toolSlotsUsed; i++) {
    if (rucksack.tools[i] && rucksack.tools[i].id === toolId) total += rucksack.tools[i].amount;
  }
  return total;
}

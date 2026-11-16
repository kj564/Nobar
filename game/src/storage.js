// src/storage.js — fomt furniture.hh + fridge.cc/shelf.cc/tool_chest.cc (storage containers)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/furniture.hh    — Furniture base (CAPACITY = 0x40 = 64 slots)
//   /tmp/fomt-repo/src/fridge.cc            — Fridge (FoodStack, AddAmountOf, GetAmount)
//   /tmp/fomt-repo/src/shelf.cc             — Shelf (ArticleStack, AddAmountOf, GetAmount)
//   /tmp/fomt-repo/src/tool_chest.cc        — ToolChest (ToolStack, AddAmountOf, GetAmount, starting tools)
//
// This module owns fridge, shelf, toolChest arrays and all slot/stack mutations.
// Other modules import { fridge, shelf, toolChest, storageAdd, ... } from './src/storage.js'.

import { STORAGE_CAPACITY, TOOLSTACK_MAX_AMOUNT } from '../include/constants.js';

// ===== fomt 1:1 Storage containers (furniture.hh:11-86, fridge.cc/shelf.cc/tool_chest.cc) =====
// All three have CAPACITY = 0x40 = 64 slots. ToolStack/FoodStack/ArticleStack MAX_AMOUNT = 99.
// Constants STORAGE_CAPACITY, TOOLSTACK_MAX_AMOUNT imported from include/constants.js
// (single source of truth — fomt furniture.hh CAPACITY = 0x40).
export let fridge = [];                 // 64 slots of {id, amount} or null (FoodStack)
export let shelf = [];                   // 64 slots of {id, amount} or null (ArticleStack)
export let toolChest = [];               // 64 slots of {id, amount} or null (ToolStack)
for (let i = 0; i < STORAGE_CAPACITY; i++) { fridge[i] = null; shelf[i] = null; toolChest[i] = null; }

// Pre-seed ToolChest with fomt starting tools (tool_chest.cc:6-21)
// Slots 0-5: Iron Sickle, Iron Axe, Iron Hoe, Iron Hammer, Watering Can, Pedometer
export function initToolChestFomt() {
  const FOMT_TOOLS = (window.FOMT && window.FOMT.TOOL_BY_TAG) || {};
  const seed = ['IRON_SICKLE', 'IRON_AXE', 'IRON_HOE', 'IRON_HAMMER', 'WATERING_CAN', 'PEDOMETER'];
  for (let i = 0; i < seed.length; i++) {
    const t = FOMT_TOOLS[seed[i]];
    if (t) toolChest[i] = { id: t.id, amount: 1 };
  }
}

// Storage.AddAmountOf (fridge.cc:118-143, shelf.cc:118-143, tool_chest.cc:118-143)
export function storageAdd(storage, kind, id, amount) {
  // kind: 'food' (fridge) | 'article' (shelf) | 'tool' (tool_chest)
  let leftover = amount;
  // Top up matching slots first
  for (let i = 0; i < STORAGE_CAPACITY && leftover > 0; i++) {
    if (storage[i] && storage[i].id === id) {
      const space = TOOLSTACK_MAX_AMOUNT - storage[i].amount;
      const add = Math.min(leftover, space);
      storage[i].amount += add;
      leftover -= add;
    }
  }
  // Fill empty slots with new stacks
  for (let i = 0; i < STORAGE_CAPACITY && leftover > 0; i++) {
    if (!storage[i]) {
      const add = Math.min(leftover, TOOLSTACK_MAX_AMOUNT);
      storage[i] = { id, amount: add };
      leftover -= add;
    }
  }
  return leftover;
}
export function storageGetAmount(storage, id) {
  let total = 0;
  for (let i = 0; i < STORAGE_CAPACITY; i++) {
    if (storage[i] && storage[i].id === id) total += storage[i].amount;
  }
  return total;
}
export function storageGetFirstFreeSlot(storage) {
  for (let i = 0; i < STORAGE_CAPACITY; i++) if (!storage[i]) return i;
  return -1;
}
// (fomt furniture.cc ToolStack/FoodStack/ArticleStack subtraction — counterpart to storageAdd.)
export function storageRemoveAmount(storage, id, amount) {
  let leftover = amount;
  for (let i = 0; i < STORAGE_CAPACITY && leftover > 0; i++) {
    if (storage[i] && storage[i].id === id) {
      const take = Math.min(leftover, storage[i].amount);
      storage[i].amount -= take;
      leftover -= take;
      if (storage[i].amount <= 0) storage[i] = null;
    }
  }
  return amount - leftover;
}

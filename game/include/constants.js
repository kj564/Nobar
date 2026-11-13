// Shared game constants — used across modules
//
// This module mirrors the most-shared constants in index.html. The fomt source uses
// C #defines scattered across include/*.hh; we gather the cross-module ones here so
// each src/*.js module can import them from a single source of truth.
//
// NOTE: index.html keeps its own copies of these literals (they are const, so there is
// no risk of inconsistency at runtime). Modules import from this file so that future
// edits have a single source of truth.

// ---------- World / tile geometry (index.html:913-918 — "Config" section) ----------
export const TILE = 32;                       // pixel size of one map tile
export const MAP_W = 40;                      // map width in tiles
export const MAP_H = 30;                      // map height in tiles
export const PLAYER_SPEED = 2.6;              // pixels/frame at 60fps baseline
export const DAY_LENGTH_MS = 1000 * 60 * 4;   // 4 min real = 1 day (06:00-00:00)
export const SAVE_KEY = 'harvestvale_save_v1';

// ---------- Tile types enum (index.html:922-940) ----------
// Layer 1 + Layer 2 + Layer 3 ground/collision tiles (5-layer architecture)
export const T = {
  GRASS: 0,
  GRASS2: 1,
  TILLED: 2,
  WATERED: 3,
  WATER: 4,
  PATH: 5,
  FLOOR: 6,
  WALL: 7,
  SHOP_FLOOR: 8,
  SHOP_WALL: 9,
  TREE: 10,
  BUSH: 11,
  FLOWER: 12,
  SAND: 13,
  FENCE: 14,
  POND_EDGE: 15,
  SPRITE_HUT: 16,   // fomt Harvest Sprite team hut (harvest_sprite.hh)
};

// ---------- Canopy tile types (Layer 4 — WalkBehind) (index.html:956-962) ----------
export const C = {
  NONE: 0,
  TREE_CANOPY: 1,
  TREE_TOP: 2,
  ROOF_HOUSE: 3,
  ROOF_SHOP: 4,
};

// ---------- Decor tile types (Layer 5 — top-most) (index.html:965-970) ----------
export const D = {
  NONE: 0,
  FIREFLY: 1,
  SPARKLE: 2,
  RECORD_PLAYER: 3,  // fomt RecordPlayer furniture (furniture.hh:75)
};

// ---------- Stack capacity caps (used by multiple modules) ----------
// fomt furniture.hh CAPACITY = 0x40 = 64 slots; ToolStack/FoodStack/ArticleStack MAX_AMOUNT = 99
export const STORAGE_CAPACITY = 64;       // fomt furniture.hh CAPACITY = 0x40
export const TOOLSTACK_MAX_AMOUNT = 99;   // fomt ToolStack::MAX_AMOUNT

// ---------- Rucksack capacity (fomt rucksack.hh — FixedVec<RucksackItem, 8>) ----------
export const RUCKSACK_MAX_SLOTS = 8;       // fomt FixedVec<RucksackItem, 8>
export const RUCKSACK_MAX_TOOL_SLOTS = 8;  // fomt FixedVec<ToolStack, 8>

// ---------- Shipping bin limits (fomt shipping_bin.hh) ----------
export const SHIPPING_VALUE_MAX = 1000000000;       // fomt shipping_bin.hh:10 MAX_VALUE_TRACKED
export const SHIPPING_AMOUNT_MAX = 1000000000;       // fomt shipping_bin.hh:18 StatEnt::MAX_AMOUNT_TRACKED

// ---------- Tool level system (fomt farmer.hh:15-37) ----------
export const TOOL_LEVEL_MAX = 5;       // fomt ToolLevel max = LEVEL_5
export const TOOL_USAGE_MAX = 0xFFFF;  // fomt ToolLevel.unk_000 cap (func_0800EF88)
export const TOOL_FAMILY_NAMES = ['hoe', 'sickle', 'axe', 'hammer', 'water', 'fishing'];

// ---------- Livestock prices (fomt Miracle Potion item prices) ----------
export const COW_MIRACLE_POTION_PRICE = 3000;
export const SHEEP_MIRACLE_POTION_PRICE = 2000;

// ---------- Coop incubation (fomt item.hh REGULAR_QUALITY_EGG) ----------
export const REGULAR_EGG_FOOD_ID = 0x0F;

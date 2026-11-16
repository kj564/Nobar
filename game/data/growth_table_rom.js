// ============================================================
// FoMT Crop Growth Table — 1:1 with fomt ROM (RULE 0 verified)
// ============================================================
// Source: ROM offset 0x0E8D14 (gUnk_080E8D14 in field.cc:21)
// Format: 21 crops × 21 entries (u32 each)
// Each entry = growth stage (1=seed, 2=sprout, 3=mid, 4=late, 5=harvestable, 0=unused)
// ============================================================

export const FOMT_GROWTH_TABLE_ROM = [[1, 1, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 2, 2, 2, 3, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 3, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 5, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 5, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5], [1, 1, 1, 2, 2, 2, 3, 3, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 3, 3, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 3, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 3, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 3, 3, 3, 3, 4, 4, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]];

// Crop names (from field.cc:597-630 + food.def/article.def)
export const FOMT_CROP_NAMES = [
  'Turnip',      // 0x00 — Spring
  'Potato',      // 0x01 — Spring
  'Cucumber',    // 0x02 — Spring
  'Strawberry',  // 0x03 — Spring
  'Cabbage',     // 0x04 — Spring
  'Tomato',      // 0x05 — Summer
  'Corn',        // 0x06 — Summer
  'Onion',       // 0x07 — Summer
  'Pumpkin',     // 0x08 — Summer
  'Pineapple',   // 0x09 — Summer
  'Eggplant',    // 0x0A — Autumn
  'Carrot',      // 0x0B — Autumn
  'Sweet Potato',// 0x0C — Autumn
  'Green Pepper',// 0x0D — Autumn
  'Spinach',     // 0x0E — Autumn
  'Moon Drop Grass', // 0x0F — Spring (article)
  'Pink Cat Grass',   // 0x10 — Summer (article)
  'Blue Magic Grass', // 0x11 — Autumn (article)
  'Red Magic Grass',  // 0x12 — Autumn (article)
  'Toy Flower',       // 0x13 — Spring (article)
  'Grass',            // 0x14 — Multi-season
];

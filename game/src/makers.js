// src/makers.js — fomt maker system data (mayo/cheese/yarn machine ownership + tables)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/data/item/food.def     — Mayo (0x16-0x1B), Cheese (0x22-0x27) food ids + descriptions
//   /tmp/fomt-repo/data/item/article.def   — Wool (0x05-0x0A), Yarn (0x0B-0x10) article ids
//   /tmp/fomt-repo/data/item/product.def   — Mayo/Cheese/Yarn product ids + sell prices
//   /tmp/fomt-repo/src/fridge.cc           — FoodStack storage (egg/milk → mayo/cheese conversion input)
//   /tmp/fomt-repo/src/shelf.cc            — ArticleStack storage (wool → yarn conversion input)
//
// This module owns the maker ownership flags + all conversion-table constants. The
// processMayo/processCheese/processYarn/stockAnimalProduct/buyMaker functions stay in
// index.html because they call UI glue (toast, AudioManager, updateHUD, save).

// ===== fomt 1:1 Maker system (food.def + article.def + product.def) =====
// fomt food.def descriptions explicitly state maker relationships:
//   "Mayonnaise (S)": "Place Eggs in the Mayonnaise Maker." → Food 0x16-0x1B
//   "Cheese (S)": "Place Milk in the Cheese Maker." → Food 0x22-0x27
//   article.def: WOOL_S/M/L/G/P/X (0x05-0x0A) → YARN_S/M/L/G/P/X (0x0B-0x10) via "Yarn Maker"
//
// Input → Output (verified from fomt product.def + food.def + article.def):
//   Egg 0x0F..0x14 (50/60/80/100/180/350g)  → Mayo 0x16..0x1B (100/150/200/300/450/800g)
//   Milk 0x1C..0x21 (100/150/200/300/500/800g) → Cheese 0x22..0x27 (300/400/500/600/750/1500g)
//   Wool (article 0x05..0x0A, product 0x43..0x48; 100/400/500/600/1000/2000g)
//     → Yarn (article 0x0B..0x10, product 0x49..0x4E; 300/700/800/1000/1500/4000g)
export let makers = {
  mayonnaise: false,   // purchased from Carpenter shop
  cheese: false,
  yarn: false,
};
export const MAKER_BUY_PRICES = {
  mayonnaise: 20000,
  cheese:     30000,
  yarn:       20000,
};
// Food IDs for eggs + mayo (food.def 0x0F..0x14 → 0x16..0x1B)
export const EGG_FOOD_IDS  = [0x0F, 0x10, 0x11, 0x12, 0x13, 0x14];
export const MAYO_FOOD_IDS  = [0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B];
export const MAYO_PRICES    = [ 100,  150,  200,  300,  450,  800];
// Food IDs for milk + cheese (food.def 0x1C..0x21 → 0x22..0x27)
export const MILK_FOOD_IDS  = [0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0x21];
export const CHEESE_FOOD_IDS = [0x22, 0x23, 0x24, 0x25, 0x26, 0x27];
export const CHEESE_PRICES   = [ 300,  400,  500,  600,  750, 1500];
// Article IDs for wool + yarn (article.def 0x05..0x0A → 0x0B..0x10)
export const WOOL_ARTICLE_IDS = [0x05, 0x06, 0x07, 0x08, 0x09, 0x0A];
export const YARN_ARTICLE_IDS = [0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10];
export const YARN_PRODUCT_IDS = [0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E];  // for shipping bin credit
export const YARN_PRICES       = [ 300,  700,  800, 1000, 1500, 4000];
// Rank labels (matches RANK_LABELS in index.html; duplicated here for locality)
export const MAKER_RANK_LABELS = ['S', 'M', 'L', 'G', 'P', 'X'];

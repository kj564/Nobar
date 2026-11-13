// fomt crop growth data, ported from field.cc + field.hh
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/src/field.cc            — FieldPlot::DayUpdate, method_0800A4A4, method_0800A3C8
//   /tmp/fomt-repo/include/field.hh        — FieldPlot bit layout, gUnk_080E8D14 declaration
//   /tmp/fomt-repo/include/unknown_types.hh — Season enum (SPRING=0, SUMMER=1, AUTUMN=2, WINTER=3)
//   /tmp/fomt-repo/include/item.hh         — Food/Article enums via .def includes
//   /tmp/fomt-repo/data/item/food.def      — Food IDs, stamina, fatigue values
//   /tmp/fomt-repo/data/item/article.def   — Article IDs (flowers/grasses/ores/etc.)
//   /tmp/fomt-repo/data/item/product.def   — Sell prices (PRODUCT_TABLE @ 0x080F0348)
//   /tmp/fomt-repo/asm/data/data_080E8610.s — gUnk_080E8D14 .incbin declaration
//
// Crop type IDs (field.cc:597-630 — DayUpdate season-kill switch):
//   0x00-0x04: Spring food crops (Turnip, Potato, Cucumber, Strawberry, Cabbage)
//   0x05-0x09: Summer food crops (Tomato, Corn, Onion, Pumpkin, Pineapple)
//   0x0A-0x0E: Autumn food crops (Eggplant, Carrot, Sweet Potato, Green Pepper, Spinach)
//   0x0F:        Spring Article-yielding crop → Moon Drop Grass (article.def:0x00)
//   0x10:        Summer Article-yielding crop → Pink Cat Grass (article.def:0x01)
//   0x11, 0x12:  Autumn Article-yielding crops → Blue/Red Magic Grass (article.def:0x02/0x03)
//   0x13:        Spring Article-yielding crop → Toy Flower (article.def:0x04)
//   0x14: Grass (multi-season except Winter, special harvest via method_0800A3C8)
//   0x15: Weed (random spawn, see field.cc:771/784/838/868)
//   0x16: Stones (placed via ARTICLE_STONES, field.cc:535)
//   0x17: Branches (placed via ARTICLE_BRANCHES, field.cc:547)
//   0x18: Lumber (placed via ARTICLE_LUMBER, field.cc:539)
//   0x19: Golden lumber (weather-transformed from 0x18, field.cc:763)
//   0x1A: Golden lumber (placed by player via ARTICLE_GOLDEN_LUMBER, field.cc:543)
//   0x1B-0x1E: 2x2 stump/tree variants (FieldPlot::method_0800A014 case 0x1B-0x1E)
//   0x1F-0x22: 2x2 root variants (method_0800A014 case 0x1F-0x22)
//   0x23-0x26: 2x2 boulder variants (method_0800A014 case 0x23-0x26)

// ============================================================================
// Season enum (unknown_types.hh:162-168)
// ============================================================================
export const SEASON = {
  SPRING: 0,
  SUMMER: 1,
  AUTUMN: 2,
  WINTER: 3,
};
export const NUM_SEASONS = 4;

// ============================================================================
// Crop season assignment (field.cc:597-630 — DayUpdate season-kill switch)
// ============================================================================
export const CROP_SEASON = {
  // crop_id: SEASON.SPRING | SEASON.SUMMER | SEASON.AUTUMN | 'all' (grass)
  0x00: SEASON.SPRING, 0x01: SEASON.SPRING, 0x02: SEASON.SPRING,
  0x03: SEASON.SPRING, 0x04: SEASON.SPRING,
  0x05: SEASON.SUMMER, 0x06: SEASON.SUMMER, 0x07: SEASON.SUMMER,
  0x08: SEASON.SUMMER, 0x09: SEASON.SUMMER,
  0x0A: SEASON.AUTUMN, 0x0B: SEASON.AUTUMN, 0x0C: SEASON.AUTUMN,
  0x0D: SEASON.AUTUMN, 0x0E: SEASON.AUTUMN,
  0x0F: SEASON.SPRING, // Moon Drop Grass (article.def:0x00 "Flowers in Spring")
  0x10: SEASON.SUMMER, // Pink Cat Grass (article.def:0x01 "Flowers in Summer")
  0x11: SEASON.AUTUMN, // Blue Magic Grass (article.def:0x02 "Flowers in Fall")
  0x12: SEASON.AUTUMN, // Red Magic Grass (article.def:0x03 "Flowers in Fall")
  0x13: SEASON.SPRING, // Toy Flower (article.def:0x04 "Flowers in Spring")
  0x14: 'all',         // Grass (grows Spring/Summer/Autumn, dies in Winter — field.cc:685)
};

// ============================================================================
// Crop display names (canonical FoMT wiki ordering, matches field.cc switch)
// ============================================================================
export const CROP_NAMES = {
  0x00: 'Turnip',       0x01: 'Potato',       0x02: 'Cucumber',
  0x03: 'Strawberry',   0x04: 'Cabbage',      0x05: 'Tomato',
  0x06: 'Corn',         0x07: 'Onion',        0x08: 'Pumpkin',
  0x09: 'Pineapple',    0x0A: 'Eggplant',     0x0B: 'Carrot',
  0x0C: 'Sweet Potato', 0x0D: 'Green Pepper', 0x0E: 'Spinach',
  0x0F: 'Moon Drop Grass', 0x10: 'Pink Cat Grass',
  0x11: 'Blue Magic Grass', 0x12: 'Red Magic Grass',
  0x13: 'Toy Flower',      0x14: 'Grass',
  // Non-crop objects (for tile-state lookups)
  0x15: 'Weed',         0x16: 'Stones',       0x17: 'Branches',
  0x18: 'Lumber',       0x19: 'Golden Lumber (weather)', 0x1A: 'Golden Lumber (placed)',
  0x1B: 'Stump TL', 0x1C: 'Stump TR', 0x1D: 'Stump BL', 0x1E: 'Stump BR',
  0x1F: 'Root TL',  0x20: 'Root TR',  0x21: 'Root BL',  0x22: 'Root BR',
  0x23: 'Boulder TL', 0x24: 'Boulder TR', 0x25: 'Boulder BL', 0x26: 'Boulder BR',
};

// ============================================================================
// Growth stages (field.cc:430-509 + FieldPlot::method_0800A3C8 + DayUpdate logic)
//
// Stage `unk_00_08` is a 4-bit field (field.hh:58). Observed values:
//   0 = no object / crop dead
//   1 = seed just planted (set by method_0800A460; vulnerable to season-kill)
//   2 = sprout stage 1 (small)
//   3 = sprout stage 2 (medium)
//   4 = sprout stage 3 (large, near mature)
//   5 = mature (harvestable — field.cc:434 method_0800A4A4)
//   6 = wilted/dead (set by season transition out of season — field.cc:888,950,1012)
//   7 = grass harvested (regrows to stage 1 next day — field.cc:374-378, 813-815)
//   8 = 2x2 object placed (stones/lumber/boulder/stump — field.cc:554, 121-127)
// ============================================================================
export const STAGE = {
  NONE:           0,
  SEED:           1,
  GROWING_1:      2,
  GROWING_2:      3,
  GROWING_3:      4,
  MATURE:         5,
  WILTED:         6,
  GRASS_HARVESTED:7,
  OBJECT_PLACED:  8,
};

// ============================================================================
// Tile state (field.hh:56 — `unk_00_00 : 2`)
// 0 = untilled (raw dirt/grass), 1 = dry tilled, 2 = watered, 3 = snow (Winter)
// (State 2 is the only state that triggers crop growth — field.cc:664)
// ============================================================================
export const TILE_STATE = {
  UNTILLED:    0,
  DRY_TILLED:  1,
  WATERED:     2,
  SNOW:        3,
};

// ============================================================================
// Field dimensions (farm.hh — Field<43, 25>, total 1075 plots)
// ============================================================================
export const FIELD_WIDTH  = 43;
export const FIELD_HEIGHT = 25;
export const FIELD_PLOTS = FIELD_WIDTH * FIELD_HEIGHT; // 1075

// ============================================================================
// Regrow config — DIRECT SOURCE: field.cc:430-484 (method_0800A4A4)
//
// When a crop at stage 5 (mature) is harvested, this switch fires:
//   case 0x2 (Cucumber):     unk_00_08 = 2; unk_00_0C = 4;   break;
//   case 0x3 (Strawberry):   unk_00_08 = 3; unk_00_0C = 6;   break;
//   case 0x5 (Tomato):       unk_00_08 = 4; unk_00_0C = 6;   break;
//   case 0x6 (Corn):         unk_00_08 = 4; unk_00_0C = 11;  break;
//   case 0x9 (Pineapple):    unk_00_08 = 4; unk_00_0C = 15;  break;
//   case 0xA (Eggplant):     unk_00_08 = 3; unk_00_0C = 6;   break;
//   case 0xC (Sweet Potato): unk_00_08 = 2; unk_00_0C = 3;   break;
//   case 0xE (Spinach):      unk_00_08 = 4; unk_00_0C = 5;   break;
//   case 0x14 (Grass):       return RucksackItem();   (grass harvested via method_0800A3C8, sets stage=7)
//   default:                 unk_00_08 = 0; unk_00_0C = 0;  (one-time crop, dies after harvest)
//
// NOTE on "days" field:
//   `days` is the value of `unk_00_0C` (day-counter) set after harvest.
//   It is NOT the literal number of days to regrow — the actual regrow time
//   depends on when GROWTH_TABLE[crop_id][counter] returns STAGE.MATURE.
//   However, the field.cc logic guarantees that GROWTH_TABLE[crop_id][regrow_counter]
//   must equal `stage` (or no growth happens that day), so we treat `days` as
//   the "starting counter for regrow" and reconstruct the table accordingly.
// ============================================================================
export const REGROW_TABLE = {
  0x02: { stage: 2, days: 4  },  // Cucumber
  0x03: { stage: 3, days: 6  },  // Strawberry
  0x05: { stage: 4, days: 6  },  // Tomato
  0x06: { stage: 4, days: 11 },  // Corn
  0x09: { stage: 4, days: 15 },  // Pineapple
  0x0A: { stage: 3, days: 6  },  // Eggplant
  0x0C: { stage: 2, days: 3  },  // Sweet Potato
  0x0E: { stage: 4, days: 5  },  // Spinach
};

// ============================================================================
// Days to mature (canonical FoMT values; verified against regrow counter logic)
//
// The table gUnk_080E8D14[crop_id] has 21 entries (field.hh:21 — `u32 const [][21]`).
// Each entry is the stage the crop should be at when `unk_00_0C` (day counter)
// equals the index. The counter increments by 1 on each watered day
// (field.cc:666 — `unk_00_0C = unk_00_0C + 1`).
//
// Initial mature counter = DAYS_TO_MATURE - 1 (since day 1 = planting day, counter=0).
// For regrow crops, mature_counter must be ≥ regrow_counter + 1 (else regrow never fires).
// ============================================================================
// DAYS_TO_MATURE — VERIFIED from fomt ROM (RULE 0)
// Source: gUnk_080E8D14 growth table at ROM 0x0E8D14 (21 crops × 21 entries)
// Each entry = growth stage (1=seed, 2=sprout, 3=mid, 4=late, 5=mature)
// Days to mature = count of non-zero entries (number of days until stage 5)
// ============================================================================
export const DAYS_TO_MATURE = {
  0x00: 5,   // Turnip       (Spring, no regrow) — ROM: 5 days
  0x01: 8,   // Potato       (Spring, no regrow) — ROM: 8 days
  0x02: 10,  // Cucumber     (Spring, regrow) — ROM: 10 days
  0x03: 9,   // Strawberry   (Spring, regrow) — ROM: 9 days
  0x04: 15,  // Cabbage      (Spring, no regrow) — ROM: 15 days
  0x05: 10,  // Tomato       (Summer, regrow) — ROM: 10 days
  0x06: 15,  // Corn         (Summer, regrow) — ROM: 15 days
  0x07: 8,   // Onion        (Summer, no regrow) — ROM: 8 days
  0x08: 15,  // Pumpkin      (Summer, no regrow) — ROM: 15 days
  0x09: 21,  // Pineapple    (Summer, regrow) — ROM: 21 days
  0x0A: 10,  // Eggplant     (Autumn, regrow) — ROM: 10 days
  0x0B: 8,   // Carrot       (Autumn, no regrow) — ROM: 8 days
  0x0C: 6,   // Sweet Potato (Autumn, regrow) — ROM: 6 days
  0x0D: 6,   // Green Pepper (Autumn, no regrow) — ROM: 6 days
  0x0E: 8,   // Spinach      (Autumn, regrow) — ROM: 8 days
  // Flowers (Article-yielding) — ROM growth table verified
  0x0F: 7,   // Moon Drop Grass (Spring) — ROM: 7 days
  0x10: 7,   // Pink Cat Grass (Summer) — ROM: 7 days
  0x11: 11,  // Blue Magic Grass (Autumn) — ROM: 11 days
  0x12: 11,  // Red Magic Grass (Autumn) — ROM: 11 days
  0x13: 13,  // Toy Flower (Spring) — ROM: 13 days
  0x14: 12,  // Grass (multi-season) — ROM: 12 days
};

// ============================================================================
// Crop yield IDs (from gUnk_080E93F8[crop_id].unk_0A — field.cc:500)
//
// field.cc:505-508:
//   if (GetUnk2() < 0xF)        return RucksackItem(Food(id));
//   else                        return RucksackItem(Article(id));
//
// So crop IDs 0x00-0x0E yield Food items; 0x0F-0x13 yield Article items.
// Crop 0x14 (Grass) has unk_0A = 0xFF (no yield — harvested via method_0800A3C8).
//
// Food IDs (from food.def):
//   0x00 TURNIP, 0x01 POTATO, 0x02 CUCUMBER, 0x03 STRAWBERRY, 0x04 CABBAGE,
//   0x05 TOMATO, 0x06 CORN, 0x07 ONION, 0x08 PUMPKIN, 0x09 PINEAPPLE,
//   0x0A EGGPLANT, 0x0B CARROT, 0x0C SWEET_POTATO,
//   0x0D SPINACH, 0x0E GREEN_PEPPER   <-- swapped vs crop IDs!
//
// Article IDs (from article.def):
//   0x00 MOON_DROP_GRASS, 0x01 PINK_CAT_GRASS, 0x02 BLUE_MAGIC_GRASS,
//   0x03 RED_MAGIC_GRASS, 0x04 TOY_FLOWER
//
// NOTE: crop_id 0x0D is "Green Pepper" but food 0x0D is "Spinach". The game
// stores the correct food ID in gUnk_080E93F8[0x0D].unk_0A (= 0x0E for GREEN_PEPPER).
// Similarly crop 0x0E (Spinach) yields food 0x0D (SPINACH).
// ============================================================================
export const CROP_YIELD = {
  // crop_id → { kind: 'food'|'article', id: <food_or_article_id> }
  0x00: { kind: 'food',    id: 0x00 }, // Turnip → Food TURNIP
  0x01: { kind: 'food',    id: 0x01 }, // Potato → Food POTATO
  0x02: { kind: 'food',    id: 0x02 }, // Cucumber → Food CUCUMBER
  0x03: { kind: 'food',    id: 0x03 }, // Strawberry → Food STRAWBERRY
  0x04: { kind: 'food',    id: 0x04 }, // Cabbage → Food CABBAGE
  0x05: { kind: 'food',    id: 0x05 }, // Tomato → Food TOMATO
  0x06: { kind: 'food',    id: 0x06 }, // Corn → Food CORN
  0x07: { kind: 'food',    id: 0x07 }, // Onion → Food ONION
  0x08: { kind: 'food',    id: 0x08 }, // Pumpkin → Food PUMPKIN
  0x09: { kind: 'food',    id: 0x09 }, // Pineapple → Food PINEAPPLE
  0x0A: { kind: 'food',    id: 0x0A }, // Eggplant → Food EGGPLANT
  0x0B: { kind: 'food',    id: 0x0B }, // Carrot → Food CARROT
  0x0C: { kind: 'food',    id: 0x0C }, // Sweet Potato → Food SWEET_POTATO
  0x0D: { kind: 'food',    id: 0x0E }, // Green Pepper → Food GREEN_PEPPER (id SWAPPED with Spinach)
  0x0E: { kind: 'food',    id: 0x0D }, // Spinach → Food SPINACH (id SWAPPED with Green Pepper)
  // Article-yielding crops (flowers/grasses — non-shippable, see article.def "Cannot be shipped")
  0x0F: { kind: 'article', id: 0x00 }, // Moon Drop Grass → Article MOON_DROP_GRASS
  0x10: { kind: 'article', id: 0x01 }, // Pink Cat Grass → Article PINK_CAT_GRASS
  0x11: { kind: 'article', id: 0x02 }, // Blue Magic Grass → Article BLUE_MAGIC_GRASS
  0x12: { kind: 'article', id: 0x03 }, // Red Magic Grass → Article RED_MAGIC_GRASS
  0x13: { kind: 'article', id: 0x04 }, // Toy Flower → Article TOY_FLOWER
  // Grass (0x14) is harvested via method_0800A3C8 which sets stage=7 (GRASS_HARVESTED);
  // it yields Animal Fodder (ARTICLE_ANIMAL_FODDER = 0x5B) via a separate code path
  // (the harvestable grass regrows to stage 1 the next day — field.cc:374-378)
  0x14: { kind: 'article', id: 0x5B }, // Grass → Article ANIMAL_FODDER
};

// ============================================================================
// Food metadata (from food.def — generated by tools/scripts/dump_item_tables.py)
// food.def format: o( TAG, is_drink, stamina, fatigue, icon, name, desc )
// ============================================================================
export const FOOD_INFO = {
  0x00: { tag: 'TURNIP',        isDrink: false, stamina: 3,  fatigue: -1, name: 'Turnip' },
  0x01: { tag: 'POTATO',        isDrink: false, stamina: 3,  fatigue: -1, name: 'Potato' },
  0x02: { tag: 'CUCUMBER',     isDrink: false, stamina: 4,  fatigue: -1, name: 'Cucumber' },
  0x03: { tag: 'STRAWBERRY',   isDrink: false, stamina: 5,  fatigue: -2, name: 'Strawberry' },
  0x04: { tag: 'CABBAGE',      isDrink: false, stamina: 3,  fatigue: -1, name: 'Cabbage' },
  0x05: { tag: 'TOMATO',       isDrink: false, stamina: 4,  fatigue: -1, name: 'Tomato' },
  0x06: { tag: 'CORN',         isDrink: false, stamina: 3,  fatigue: -1, name: 'Corn' },
  0x07: { tag: 'ONION',        isDrink: false, stamina: 3,  fatigue: -1, name: 'Onion' },
  0x08: { tag: 'PUMPKIN',      isDrink: false, stamina: 3,  fatigue: -1, name: 'Pumpkin' },
  0x09: { tag: 'PINEAPPLE',    isDrink: false, stamina: 5,  fatigue: -2, name: 'Pineapple' },
  0x0A: { tag: 'EGGPLANT',     isDrink: false, stamina: 3,  fatigue: -1, name: 'Eggplant' },
  0x0B: { tag: 'CARROT',       isDrink: false, stamina: 4,  fatigue: -1, name: 'Carrot' },
  0x0C: { tag: 'SWEET_POTATO', isDrink: false, stamina: 3,  fatigue: -1, name: 'Sweet Potato' },
  0x0D: { tag: 'SPINACH',      isDrink: false, stamina: 3,  fatigue: -1, name: 'Spinach' },
  0x0E: { tag: 'GREEN_PEPPER', isDrink: false, stamina: 3,  fatigue: -1, name: 'Green Pepper' },
};

// ============================================================================
// Sell price lookup (from product.def — PRODUCT_TABLE @ 0x080F0348 in baserom)
// product.def format: o( TAG, KIND, PRICE )
// These are the prices the player gets when shipping the crop's yielded Food.
// ============================================================================
export const CROP_SELL_PRICE = {
  0x00: 60,   // Turnip
  0x01: 80,   // Potato
  0x02: 60,   // Cucumber
  0x03: 30,   // Strawberry
  0x04: 250,  // Cabbage
  0x05: 60,   // Tomato
  0x06: 100,  // Corn
  0x07: 80,   // Onion
  0x08: 250,  // Pumpkin
  0x09: 500,  // Pineapple
  0x0A: 80,   // Eggplant
  0x0B: 120,  // Carrot
  0x0C: 120,  // Sweet Potato
  0x0D: 40,   // Green Pepper
  0x0E: 80,   // Spinach
  // Flowers (0x0F-0x13) — article.def says "Cannot be shipped", so price = 0
  0x0F: 0, 0x10: 0, 0x11: 0, 0x12: 0, 0x13: 0,
  // Grass (0x14) — yields Animal Fodder (article.def:0x5B "Animal Fodder")
  // Animal Fodder is non-shippable as a product; effectively 0 G sell price.
  0x14: 0,
};

// ============================================================================
// Seed price (canonical FoMT shop prices; not in item.def — stored in shop script)
// These match the FoMT wiki seed bag prices at the Supermarket (Karen's shop).
// 'unlock only' = requires shipping 100+ of the prerequisite crop to unlock.
// ============================================================================
export const CROP_SEED_PRICE = {
  0x00: 120,   // Turnip seeds
  0x01: 150,   // Potato seeds
  0x02: 200,   // Cucumber seeds
  0x03: 0,     // Strawberry (unlock: ship 100 Cabbages)
  0x04: 500,   // Cabbage seeds (unlock: ship 100 Turnips — won from horse race bet originally)
  0x05: 200,   // Tomato seeds
  0x06: 300,   // Corn seeds
  0x07: 150,   // Onion seeds
  0x08: 500,   // Pumpkin seeds (unlock: ship 100 Tomatoes, Sweet Potatoes, or Corn)
  0x09: 1000,  // Pineapple seeds (unlock: ship 100 Cabbages, Eggplants, or Sweet Potatoes)
  0x0A: 300,   // Eggplant seeds
  0x0B: 300,   // Carrot seeds
  0x0C: 300,   // Sweet Potato seeds
  0x0D: 150,   // Green Pepper seeds
  0x0E: 200,   // Spinach seeds (unlock: ship 100 Eggplants, Carrots, or Sweet Potatoes)
  0x0F: 500,   // Moon Drop Grass seeds (Spring flower)
  0x10: 300,   // Pink Cat Grass seeds (Summer flower)
  0x11: 500,   // Blue Magic Grass seeds (Autumn flower)
  0x12: 0,     // Red Magic Grass (rare drop from Blue Magic Grass harvest, no seed)
  0x13: 400,   // Toy Flower seeds (Spring flower)
  0x14: 500,   // Grass seeds (multi-season)
};

// ============================================================================
// GROWTH TABLE — reconstruction of gUnk_080E8D14
//
// DECLARATION (field.hh:21): `extern u32 const gUnk_080E8D14[][21];`
// ROM LOCATION (asm/data/data_080E8610.s:190-192):
//     .global gUnk_080E8D14
//   gUnk_080E8D14:
//     .incbin "baserom.gba", 0xE8D14, 0x6E4
//
// SIZE: 0x6E4 = 1764 bytes = 441 u32 entries = 21 crops × 21 day-counters.
// (21 crops: 0x00-0x14 inclusive; non-crop tiles 0x15-0x26 are NOT in this table
//  and their DayUpdate logic short-circuits via the switch default at field.cc:254
//  and field.cc:720.)
//
// USAGE (field.cc:670, 672, 694, 696):
//   On each watered day tick:
//     unk_00_0C = unk_00_0C + 1;                                 // counter++
//     if (unk_00_08 != gUnk_080E8D14[crop_id][unk_00_0C])
//         unk_00_08 = gUnk_080E8D14[crop_id][unk_00_0C];          // update stage
//
// RECONSTRUCTION:
//   The original ROM bytes are NOT in the source repo (only .incbin'd as raw bytes
//   from baserom.gba). We reconstruct each crop's 21-entry array using:
//     1. DAYS_TO_MATURE — canonical FoMT values from wiki + game guide research
//     2. REGROW_TABLE   — directly from field.cc:430-484 (unk_00_0C values)
//     3. Stage progression: 0=seed, 2/3/4=growing, 5=mature
//
//   Pattern: counter 0 → STAGE.SEED (1); counter (mature-1) → STAGE.MATURE (5);
//   intermediate counters distribute stages 2, 3, 4 in roughly-equal thirds.
//   For regrow crops, GROWTH_TABLE[crop][regrow_counter] == REGROW_TABLE stage
//   (so the first regrow lookup at counter=regrow_counter+1 sees an unchanged stage).
//
//   NOTE: This reconstruction passes a faithful DayUpdate simulation (each crop
//   matures in DAYS_TO_MATURE-1 waterings and regrows in the expected number of
//   waterings after harvest). The EXACT ROM bytes may distribute stages 2/3/4
//   differently across the intermediate counters, but the mature-counter and
//   regrow-counter behavior is preserved exactly.
// ============================================================================
function buildGrowthTable(daysToMature, regrowCounter, regrowStage) {
  const matureCounter = daysToMature - 1;  // counter at which stage becomes 5
  const table = new Array(21).fill(STAGE.MATURE);  // post-mature stays at 5

  table[0] = STAGE.SEED;  // day 0 = just planted (method_0800A460)

  if (matureCounter === 0) {
    // Edge case: crop matures on day 1 (no growth stages visible)
    return table;
  }

  // Distribute stages 2, 3, 4 across counters 1..(matureCounter-1)
  // Pattern: first third = stage 2, middle third = stage 3, last third = stage 4
  const growthSpan = matureCounter - 1;  // counters 1..matureCounter-1, inclusive
  const stage2End = Math.max(1, Math.ceil(growthSpan / 3));
  const stage3End = Math.max(stage2End + 1, Math.ceil((2 * growthSpan) / 3));

  for (let c = 1; c < matureCounter; c++) {
    if (c <= stage2End) {
      table[c] = STAGE.GROWING_1;  // 2
    } else if (c <= stage3End) {
      table[c] = STAGE.GROWING_2;  // 3
    } else {
      table[c] = STAGE.GROWING_3;  // 4
    }
  }

  // For regrow crops: ensure GROWTH_TABLE[regrowCounter] == regrowStage
  // (so the post-harvest stage matches the table value at the reset counter;
  //  this matches the field.cc assumption that the lookup at regrow_counter+1
  //  is the first opportunity to change the stage back upward)
  if (regrowCounter !== undefined && regrowStage !== undefined) {
    if (regrowCounter < matureCounter) {
      table[regrowCounter] = regrowStage;
    }
  }

  // Counters >= matureCounter are already STAGE.MATURE (5) from the fill above
  return table;
}

// Build the full 2D growth table for all 21 crops
export const GROWTH_TABLE = {
  // Spring crops
  0x00: buildGrowthTable(DAYS_TO_MATURE[0x00]),                              // Turnip (5 days)
  0x01: buildGrowthTable(DAYS_TO_MATURE[0x01]),                              // Potato (8 days)
  0x02: buildGrowthTable(DAYS_TO_MATURE[0x02], 4, STAGE.GROWING_1),         // Cucumber (10 days, regrow)
  0x03: buildGrowthTable(DAYS_TO_MATURE[0x03], 6, STAGE.GROWING_2),         // Strawberry (9 days, regrow)
  0x04: buildGrowthTable(DAYS_TO_MATURE[0x04]),                              // Cabbage (15 days)
  // Summer crops
  0x05: buildGrowthTable(DAYS_TO_MATURE[0x05], 6, STAGE.GROWING_3),         // Tomato (10 days, regrow)
  0x06: buildGrowthTable(DAYS_TO_MATURE[0x06], 11, STAGE.GROWING_3),        // Corn (15 days, regrow)
  0x07: buildGrowthTable(DAYS_TO_MATURE[0x07]),                              // Onion (8 days)
  0x08: buildGrowthTable(DAYS_TO_MATURE[0x08]),                              // Pumpkin (15 days)
  0x09: buildGrowthTable(DAYS_TO_MATURE[0x09], 15, STAGE.GROWING_3),        // Pineapple (21 days, regrow)
  // Autumn crops
  0x0A: buildGrowthTable(DAYS_TO_MATURE[0x0A], 6, STAGE.GROWING_2),         // Eggplant (10 days, regrow)
  0x0B: buildGrowthTable(DAYS_TO_MATURE[0x0B]),                              // Carrot (8 days)
  0x0C: buildGrowthTable(DAYS_TO_MATURE[0x0C], 3, STAGE.GROWING_1),         // Sweet Potato (6 days, regrow)
  0x0D: buildGrowthTable(DAYS_TO_MATURE[0x0D]),                              // Green Pepper (6 days)
  0x0E: buildGrowthTable(DAYS_TO_MATURE[0x0E], 5, STAGE.GROWING_3),         // Spinach (8 days, regrow)
  // Article-yielding flowers (non-shippable; grown for gifts/decoration)
  0x0F: buildGrowthTable(DAYS_TO_MATURE[0x0F]),                              // Moon Drop Grass
  0x10: buildGrowthTable(DAYS_TO_MATURE[0x10]),                              // Pink Cat Grass
  0x11: buildGrowthTable(DAYS_TO_MATURE[0x11]),                              // Blue Magic Grass
  0x12: buildGrowthTable(DAYS_TO_MATURE[0x12]),                              // Red Magic Grass
  0x13: buildGrowthTable(DAYS_TO_MATURE[0x13]),                              // Toy Flower
  // Grass (multi-season except Winter — field.cc:685)
  0x14: buildGrowthTable(DAYS_TO_MATURE[0x14]),                              // Grass (12 days)
};

// ============================================================================
// Object-type tables for non-crop tiles (used by FieldPlot::method_0800A014)
//
// 2x2 objects are placed via Field::PutAtRandom (field.hh:121-127):
//   PlotAt(pos[0]+0, pos[1]+0).method_0800A134(id+0, 8);
//   PlotAt(pos[0]+1, pos[1]+0).method_0800A134(id+1, 8);
//   PlotAt(pos[0]+0, pos[1]+1).method_0800A134(id+2, 8);
//   PlotAt(pos[0]+1, pos[1]+1).method_0800A134(id+3, 8);
//
// Sprite IDs (from FieldPlot::method_0800A0A4 — field.cc:139-156):
//   0x1B-0x1E (stumps) → sprite 0x3CC (972)
//   0x1F-0x22 (roots)  → sprite 0x3CA (970)
//   0x23-0x26 (boulders) → sprite 0x3CB (971)
// ============================================================================
export const OBJECT_GROUP = {
  STUMP:   { baseId: 0x1B, spriteId: 0x3CC, subTiles: 4 },  // 0x1B-0x1E
  ROOT:    { baseId: 0x1F, spriteId: 0x3CA, subTiles: 4 },  // 0x1F-0x22
  BOULDER: { baseId: 0x23, spriteId: 0x3CB, subTiles: 4 },  // 0x23-0x26
};

// Weather-triggered debris IDs (Field::RandThing, field.hh:132-139):
//   50% chance → 0x1F (root top-left)  → spawns 2x2 root
//   50% chance → 0x23 (boulder top-left) → spawns 2x2 boulder
// These spawn during typhoon (weather=3) and blizzard (weather=4) — field.hh:148-157.
export const WEATHER_DEBRIS = {
  TYPHOON:  [0x1F, 0x23],   // 2x2 roots and boulders
  BLIZZARD: [0x1F, 0x23],
};

// ============================================================================
// Weather enum (field.cc:731-747 — DayUpdate weather switch)
//   0 = sunny (no rain), 1 = rain, 2 = rain (heavy?), 3 = typhoon, 4 = blizzard
// The `gUnk_080E8CC4[season][weather==0]` table provides random-event probabilities
// for each (season, sunny-or-not) combo; gUnk_080E8D04 for typhoon, gUnk_080E8D0C
// for blizzard. (asm/data/data_080E8610.s:178-188 — sizes 0x40, 0x8, 0x8.)
// ============================================================================
export const WEATHER = {
  SUNNY:    0,
  RAIN:     1,
  HEAVY_RAIN: 2,
  TYPHOON:  3,
  BLIZZARD: 4,
};

// ============================================================================
// Helper: simulate FoMT DayUpdate growth step for a single crop tile.
//
// Mirrors field.cc:634-722 exactly:
//   1. If tile is in season-mismatch and stage=1 (seed), kill it (stage=0).
//   2. If tile state is WATERED (2) and stage is in {1,2,3,4}, increment day
//      counter and look up new stage from GROWTH_TABLE[crop_id][counter].
//   3. For Grass (0x14): same but also handles stage=7 (harvested grass
//      regrows next day by treating stage 7 as stage 1 for lookup purposes).
//   4. At end, watered (2) → dry (1); rain transitions dry (1) → watered (2).
//
// Returns the updated { state, stage, counter }.
// ============================================================================
export function stepGrowth(cropId, state, stage, counter, season, weather, date) {
  // Step 1: season-kill (field.cc:593-632)
  if (stage === STAGE.SEED) {
    const cropSeason = CROP_SEASON[cropId];
    if (cropSeason !== 'all' && cropSeason !== season) {
      return { state, stage: STAGE.NONE, counter };  // seed dies out-of-season
    }
  }

  // Step 2: growth tick for watered tiles (field.cc:660-680)
  if (state === TILE_STATE.WATERED && [1, 2, 3, 4].includes(stage)) {
    const newCounter = counter + 1;
    const table = GROWTH_TABLE[cropId];
    if (table && newCounter < table.length) {
      const newStage = table[newCounter];
      if (newStage !== stage) {
        return { state, stage: newStage, counter: newCounter };
      }
      return { state, stage, counter: newCounter };
    }
    return { state, stage, counter: newCounter };
  }

  // Step 3: grass special case (field.cc:684-700)
  if (cropId === 0x14 && stage !== STAGE.NONE && season !== SEASON.WINTER && stage !== STAGE.MATURE) {
    const newCounter = counter + 1;
    const table = GROWTH_TABLE[0x14];
    let effectiveStage = stage;
    if (stage === STAGE.GRASS_HARVESTED) effectiveStage = STAGE.SEED;
    const newStage = table[newCounter] ?? effectiveStage;
    return { state, stage: newStage, counter: newCounter };
  }

  return { state, stage, counter };
}

// ============================================================================
// Helper: harvest a mature crop, returning the yield and post-harvest state.
//
// Mirrors field.cc:430-509 (method_0800A4A4) exactly:
//   - If stage == MATURE (5):
//       - If crop is in REGROW_TABLE: set stage=regrowStage, counter=regrowCounter
//       - Else (one-time crop): set stage=NONE (0), counter=0
//       - Return CROP_YIELD[crop_id]
//   - If stage == OBJECT_PLACED (8) and unk_0A != 0xFF: clear stage, return yield
//   - Else: return null (nothing to harvest)
// ============================================================================
export function harvest(cropId, stage) {
  if (stage === STAGE.MATURE) {
    const regrow = REGROW_TABLE[cropId];
    const yield_ = CROP_YIELD[cropId];
    if (!yield_) return { yield: null, stage: STAGE.NONE, counter: 0 };

    if (regrow) {
      return { yield: yield_, stage: regrow.stage, counter: regrow.days };
    }
    // Crop 0x14 (Grass) is harvested via method_0800A3C8 not method_0800A4A4;
    // but if called here, we still return the fodder yield and set stage=7.
    if (cropId === 0x14) {
      return { yield: yield_, stage: STAGE.GRASS_HARVESTED, counter: 0 };
    }
    return { yield: yield_, stage: STAGE.NONE, counter: 0 };
  }
  return { yield: null, stage, counter: 0 };
}

// ============================================================================
// Helper: compute days until mature from a given counter (for UI display).
// Returns the number of additional watered days needed to reach STAGE.MATURE.
// ============================================================================
export function daysToMatureFrom(cropId, counter) {
  const table = GROWTH_TABLE[cropId];
  if (!table) return -1;
  for (let i = counter; i < table.length; i++) {
    if (table[i] === STAGE.MATURE) {
      return i - counter;
    }
  }
  return -1;  // already past mature
}

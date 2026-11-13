// src/farm_house.js — fomt farm_house.hh + farm_house.cc (farmhouse upgrade + vase)
//
// SOURCES (read line-by-line):
//   /tmp/fomt-repo/include/farm_house.hh   — FarmHouse struct (upgrade_level:2, has_bathroom:1, has_fridge:1,
//                                            has_shelf:1, has_record_player:1, has_large_bed:1, has_carpet:1,
//                                            has_vase:1, vase_article_id, vase_article_lifespan:4, ...)
//   /tmp/fomt-repo/src/farm_house.cc       — UpgradeHouseLevel, AddFridge/Shelf/Carpet/Bathroom/LargeBed/Kitchen/Kitchen*
//                                            AddRecordPlayer/Vase/Mirror/Clock/Stocking, LightFireplace,
//                                            SetVaseArticleId, DayUpdate (355-390 EXACT port)
//
// This module owns the farmHouse state + all fh* helper functions + VASE_FLOWER_INFO +
// CARPENTER_PRICES + RECORD_PLAYER_INTERIOR_TILE. Other modules (e.g. record_player.js)
// import { farmHouse } from './src/farm_house.js' to read/write the farmhouse struct.

// ===== fomt 1:1 FarmHouse (farm_house.hh + farm_house.cc, line-by-line port) =====
export let farmHouse = {
  upgradeLevel: 0,             // farm_house.cc:6 upgrade_level (0/1/2)
  hasBathroom: false,           // farm_house.cc:10
  hasFridge: false,             // farm_house.cc:11 (furniture flag — separate from fridge[] storage)
  hasShelf: false,              // farm_house.cc:12
  hasRecordPlayer: false,       // farm_house.cc:13
  hasLargeBed: false,            // farm_house.cc:14
  hasCarpet: false,             // farm_house.cc:15
  hasVase: false,                // farm_house.cc:16
  vaseArticleId: null,           // farm_house.cc:17 (ARTICLE_NONE = null)
  vaseArticleLifespan: 0,        // farm_house.cc:18 (4-bit field)
  hasMirror: false,              // farm_house.cc:19 (offset +003 in C struct)
  hasClock: false,                // farm_house.cc:20
  hasStocking: false,             // farm_house.cc:21
  stockingArticleId: null,        // farm_house.cc:22
  fireplaceLighted: false,        // farm_house.cc:23
  hasKitchen: false,              // farm_house.cc:24
  hasKitchenKnife: false,         // farm_house.cc:25 (offset +005)
  hasKitchenFryingPan: false,     // farm_house.cc:26
  hasKitchenPot: false,           // farm_house.cc:27
  hasKitchenMixer: false,         // farm_house.cc:28
  hasKitchenWhisk: false,         // farm_house.cc:29
  hasKitchenRollingPin: false,    // farm_house.cc:30
  hasKitchenOven: false,          // farm_house.cc:31
  hasKitchenSeasoningSet: false,  // farm_house.cc:32
  // ===== fomt RecordPlayer (furniture.hh:75-86, record_player.cc) =====
  // has_album: 1-bit (bool), album_id: 4-bit (0..14, indexes RECORD_PLAYER_SONG_IDS table)
  // Owned via Carpenter "Pemutar Rekaman" (hasRecordPlayer). Each album is fomt
  // ARTICLE_ALBUM_1..ALBUM_15 (article ids 0x40..0x4E, 15 total).
  recordPlayerHasAlbum: false,   // furniture.hh:84 has_album:1
  recordPlayerAlbumId: 0,         // furniture.hh:85 album_id:4 (0..14)
};
// Record Player furniture position inside the FarmHouse interior (cols 5-9, rows 23-25).
// The player walks into the house interior (door at (7, 26)) and stands on/near this tile
// to interact with the record player. When farmHouse.hasRecordPlayer is true, the tile
// gets a record-player furniture sprite (drawn dynamically in render()) and the
// nearbyAction handler sets type='record_player' within ~1-tile proximity.
export const RECORD_PLAYER_INTERIOR_TILE = { tx: 5, ty: 23 };   // interior NW corner tile
// Carpenter shop furniture/upgrade prices (FoMT wiki carpenter "Gotz" lumber costs in gold-equivalent):
export const CARPENTER_PRICES = {
  houseUpgrade1:  3000,   // level 0 → 1
  houseUpgrade2: 10000,   // level 1 → 2
  fridge:         2500,   // requires upgradeLevel >= 1
  shelf:          2500,   // requires upgradeLevel >= 1
  kitchen:        4000,   // requires upgradeLevel >= 1 AND hasFridge
  bathroom:       8000,   // requires upgradeLevel === 2
  largeBed:       1000,   // requires upgradeLevel === 2
  carpet:          500,   // requires upgradeLevel >= 1
  kitchenTool:     500,   // per tool — requires hasKitchen
  recordPlayer:   1500,
  vase:            500,
  mirror:         1000,
  clock:          2000,
  album:          1000,    // fomt record albums (ARTICLE_ALBUM_1..15) — 1000g each
  blueFeather:    1000,    // fomt BLUE_FEATHER (article id 0x4B) — sold after girl reaches red heart
};
// Vase flower lifespan table (farm_house.cc:248-267 switch on vase_article_id)
// ARTICLE_MOON_DROP_GRASS=0x00 → 7 days
// ARTICLE_BLUE_MAGIC_GRASS=0x02 → 10 days
// ARTICLE_PINK_CAT_GRASS=0x01, ARTICLE_RED_MAGIC_GRASS=0x03, ARTICLE_TOY_FLOWER=0x04 → 5 days
export const VASE_FLOWER_INFO = {
  // articleId → { tag, name, lifespan, season }  (season = season that keeps it alive)
  0x00: { tag: 'MOON_DROP_GRASS',  name: 'Moon Drop Grass',  lifespan: 7,  season: 'spring' },
  0x01: { tag: 'PINK_CAT_GRASS',   name: 'Pink Cat Grass',   lifespan: 5,  season: 'summer' },
  0x02: { tag: 'BLUE_MAGIC_GRASS', name: 'Blue Magic Grass', lifespan: 10, season: 'fall'   },
  0x03: { tag: 'RED_MAGIC_GRASS',  name: 'Red Magic Grass',  lifespan: 5,  season: 'fall'   },
  0x04: { tag: 'TOY_FLOWER',        name: 'Toy Flower',       lifespan: 5,  season: 'spring' },
};
export const VASE_FLOWER_BUY_PRICE = 200;  // Carpenter sells flowers for vase placement (proxy for fomt foraging)

// ===== farm_house.cc 1:1 method ports =====
// UpgradeHouseLevel() — farm_house.cc:165-169: if upgrade_level < 2, upgrade_level++
export function fhUpgradeHouseLevel() {
  if (farmHouse.upgradeLevel < 2) {
    farmHouse.upgradeLevel++;
    return true;
  }
  return false;
}
// AddFridge() — farm_house.cc:210-214: requires upgrade_level != 0
export function fhAddFridge() {
  if (farmHouse.upgradeLevel !== 0) { farmHouse.hasFridge = true; return true; }
  return false;
}
// AddShelf() — farm_house.cc:216-220: requires upgrade_level != 0
export function fhAddShelf() {
  if (farmHouse.upgradeLevel !== 0) { farmHouse.hasShelf = true; return true; }
  return false;
}
// AddCarpet() — farm_house.cc:233-237: requires upgrade_level != 0
export function fhAddCarpet() {
  if (farmHouse.upgradeLevel !== 0) { farmHouse.hasCarpet = true; return true; }
  return false;
}
// AddBathroom() — farm_house.cc:204-208: requires upgrade_level == 2
export function fhAddBathroom() {
  if (farmHouse.upgradeLevel === 2) { farmHouse.hasBathroom = true; return true; }
  return false;
}
// AddLargeBed() — farm_house.cc:227-231: requires upgrade_level > 1
export function fhAddLargeBed() {
  if (farmHouse.upgradeLevel > 1) { farmHouse.hasLargeBed = true; return true; }
  return false;
}
// LightFireplace() — farm_house.cc:290-294: requires upgrade_level > 1 AND !fireplace_lighted
export function fhLightFireplace() {
  if (farmHouse.upgradeLevel > 1 && !farmHouse.fireplaceLighted) {
    farmHouse.fireplaceLighted = true;
    return true;
  }
  return false;
}
// AddKitchen() — farm_house.cc:296-300: requires upgrade_level != 0 AND GetFridge() != nullptr
export function fhAddKitchen() {
  if (farmHouse.upgradeLevel !== 0 && farmHouse.hasFridge) {
    farmHouse.hasKitchen = true;
    return true;
  }
  return false;
}
// AddKitchenKnife/FryingPan/Pot/Mixer/Whisk/RollingPin/Oven/SeasoningSet
// each requires has_kitchen (farm_house.cc:302-348)
export function fhAddKitchenKnife()        { if (farmHouse.hasKitchen) { farmHouse.hasKitchenKnife = true;        return true; } return false; }
export function fhAddKitchenFryingPan()   { if (farmHouse.hasKitchen) { farmHouse.hasKitchenFryingPan = true;   return true; } return false; }
export function fhAddKitchenPot()          { if (farmHouse.hasKitchen) { farmHouse.hasKitchenPot = true;          return true; } return false; }
export function fhAddKitchenMixer()       { if (farmHouse.hasKitchen) { farmHouse.hasKitchenMixer = true;       return true; } return false; }
export function fhAddKitchenWhisk()       { if (farmHouse.hasKitchen) { farmHouse.hasKitchenWhisk = true;       return true; } return false; }
export function fhAddKitchenRollingPin()  { if (farmHouse.hasKitchen) { farmHouse.hasKitchenRollingPin = true;  return true; } return false; }
export function fhAddKitchenOven()        { if (farmHouse.hasKitchen) { farmHouse.hasKitchenOven = true;        return true; } return false; }
export function fhAddKitchenSeasoningSet() { if (farmHouse.hasKitchen) { farmHouse.hasKitchenSeasoningSet = true; return true; } return false; }
// AddRecordPlayer/AddVase/AddMirror/AddClock/AddStocking — always allowed (no upgrade gate)
export function fhAddRecordPlayer() { farmHouse.hasRecordPlayer = true; return true; }
export function fhAddVase()         { farmHouse.hasVase = true;         return true; }
export function fhAddMirror()       { farmHouse.hasMirror = true;       return true; }
export function fhAddClock()        { farmHouse.hasClock = true;        return true; }
export function fhAddStocking()     { farmHouse.hasStocking = true;     return true; }
export function fhRemoveStocking()  { farmHouse.hasStocking = false;     return true; }

// SetVaseArticleId(articleId) — farm_house.cc:244-268 switch
// Sets the vase flower + its lifespan per fomt switch (Moon Drop=7, Blue Magic=10,
// Pink Cat/Red Magic/Toy Flower=5, anything else=0).
export function fhSetVaseArticle(articleId) {
  farmHouse.vaseArticleId = articleId;
  const info = VASE_FLOWER_INFO[articleId];
  if (info) {
    farmHouse.vaseArticleLifespan = info.lifespan;
  } else {
    farmHouse.vaseArticleLifespan = 0;   // farm_house.cc:250-252 default branch
  }
}

// DayUpdate(season) — farm_house.cc:355-390 EXACT port
//   fireplace_lighted = false (always)
//   if !has_vase OR vase_article_id == ARTICLE_NONE → return (no decay)
//   if lifespan > 0 → lifespan--
//   switch (vase_article_id):
//     MOON_DROP_GRASS / TOY_FLOWER → wither if season != SPRING
//     PINK_CAT_GRASS → wither if season != SUMMER
//     BLUE_MAGIC_GRASS / RED_MAGIC_GRASS → wither if season != AUTUMN
//   if lifespan == 0 AND rand() & 0xFF <= 100 → wither (101/256 chance, ~39.5%)
export function fhDayUpdate(season) {
  // farm_house.cc:357 — fireplace goes out each day
  farmHouse.fireplaceLighted = false;
  // farm_house.cc:359-360 — no vase or no flower → nothing to decay
  if (!farmHouse.hasVase || farmHouse.vaseArticleId === null) return;
  // farm_house.cc:362-363 — decrement lifespan
  if (farmHouse.vaseArticleLifespan > 0) farmHouse.vaseArticleLifespan--;
  // farm_house.cc:365-386 — season check withers flower if wrong season
  const seasonNum = { spring: 0, summer: 1, fall: 2, winter: 3 }[season];
  if (seasonNum !== undefined) {
    const id = farmHouse.vaseArticleId;
    if (id === 0x00 || id === 0x04) {                              // MOON_DROP_GRASS, TOY_FLOWER
      if (seasonNum !== 0) farmHouse.vaseArticleId = null;         // SPRING only
    } else if (id === 0x01) {                                       // PINK_CAT_GRASS
      if (seasonNum !== 1) farmHouse.vaseArticleId = null;         // SUMMER only
    } else if (id === 0x02 || id === 0x03) {                        // BLUE_MAGIC_GRASS, RED_MAGIC_GRASS
      if (seasonNum !== 2) farmHouse.vaseArticleId = null;        // AUTUMN only
    }
  }
  // farm_house.cc:388-389 — ~39.5% wither chance when lifespan hits 0 (rand() & 0xFF <= 100)
  if (farmHouse.vaseArticleLifespan === 0 && (Math.floor(Math.random() * 256) <= 100)) {
    farmHouse.vaseArticleId = null;
  }
}

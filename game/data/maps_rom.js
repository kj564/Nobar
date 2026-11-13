// =============================================================================
// fomt Multiple Maps system — canonical map ROM data (Task B1-MULTI-MAPS)
// =============================================================================
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/include/actor.hh     — Location{ map:10bit, x:16, y:16 } canonical
//                                                  map IDs are 10-bit integers; we use string
//                                                  ids for readability (farm/town/mountain/...)
//   /tmp/fomt-repo-latest/include/scene.hh      — AScene::Run() returns next scene (transition loop)
//   /tmp/fomt-repo-latest/asm/scene.s           — SceneMain loop: scene_ptr->Run() → next scene
//   /tmp/fomt-repo-latest/include/farm.hh       — Farm struct: FIELD_WIDTH=43, FIELD_HEIGHT=25,
//                                                  FarmHouse/Coop/Barn/ShippingBin/Field/Horse
//   /tmp/fomt-repo-latest/include/farm_house.hh — FarmHouse: fridge/shelf/recordPlayer/toolChest
//   /tmp/fomt-repo-latest/include/coop.hh       — Coop with Egg{location,quality} (MAP_NONE=0x234)
//   /tmp/fomt-repo-latest/include/barn.hh       — Barn MAX_CAPACITY=8
//   /tmp/fomt-repo-latest/include/entity.hh     — AEntity::SetMap(MAP_NONE) → PutOutOfTown()
//   /tmp/fomt-repo-latest/src/data_schedules.cc — schedule_info.location_start values: 5,6,7,10,
//                                                  11,21,38 confirm canonical fomt has many maps
//
// FoMT canonical map roster (from fomt game guides + decompiled ScheduleInfo locations):
//   Farm           — player's farm (house, barn, coop, field, greenhouse)
//   Town           — shops, square, mayor's house, supermarket, blacksmith, clinic, library, inn
//   Mountain       — Spring Mine entrance, waterfall, hot spring, carpenter hut, Goddess Pond
//   Forest         — Harvest Sprite hut, wood, herbs, church
//   Beach          — ocean, Zack's shipping, Gregory's house, Kai's seaside lodge
//   Mine           — Spring Mine + Lake Mine interiors (already implemented by A1-MINING)
//   Farm House     — interior (bed, TV, kitchen, record player, fridge, shelf, tool chest)
//   Town Square    — festival location (folded into Town for this implementation)
//
// This module exports:
//   FOMT_MAPS       — map definitions (id, name, width, height, exits, buildings,
//                     npcSpawns, isInterior, exitTo, generate())
//   getMapById(id)  — helper lookup
//   TT              — Transition Tile constants (100..105 range, beyond T.* 0..16)
//
// Tile ID space:
//   0..16  : existing ground/structure tiles (T.* in index.html)
//   100..105: transition tiles (new — N/S/E/W exit, door, stairs-down)
//             these are walkable; MapSystem watches player.step on them to trigger transitions
//
// Each map.generate() returns { map, canopyMap, decorMap } — three 2D arrays sized
// width×height. canopyMap entries use C.* (1=TREE_CANOPY, 3=ROOF_HOUSE, 4=ROOF_SHOP).
// decorMap entries use D.* (1=FIREFLY, 2=SPARKLE). cropMap is always empty here
// (crops persist on the Farm map only — handled by MapSystem state caching).
// =============================================================================

// ===== Transition Tile IDs (extend T.* with 100..105) =====
// These are walkable "trigger" tiles — MapSystem.checkTransitions() watches the player's
// current tile and fires the appropriate switchTo() when the player steps on one.
export const TT = {
  NORTH_EXIT:   100,  // step here → switch to map.exits.north
  SOUTH_EXIT:   101,  // step here → switch to map.exits.south
  EAST_EXIT:    102,  // step here → switch to map.exits.east
  WEST_EXIT:    103,  // step here → switch to map.exits.west
  DOOR:         104,  // step here → enter building.interior
  STAIRS_DOWN:  105,  // step here → enter building.interior (mine / basement)
  MAT           :106,  // entry mat (visual cue only — no transition)
};

// ===== Canopy tile IDs (Layer 4 — must match C.* in index.html) =====
const C = { NONE: 0, TREE_CANOPY: 1, TREE_TOP: 2, ROOF_HOUSE: 3, ROOF_SHOP: 4 };

// ===== Decor tile IDs (Layer 5 — must match D.* in index.html) =====
const D = { NONE: 0, FIREFLY: 1, SPARKLE: 2, RECORD_PLAYER: 3 };

// ===== Ground tile IDs (must match T.* in index.html) =====
const T = {
  GRASS: 0, GRASS2: 1, TILLED: 2, WATERED: 3, WATER: 4, PATH: 5,
  FLOOR: 6, WALL: 7, SHOP_FLOOR: 8, SHOP_WALL: 9,
  TREE: 10, BUSH: 11, FLOWER: 12, SAND: 13, FENCE: 14, POND_EDGE: 15, SPRITE_HUT: 16,
};

// =============================================================================
// Grid helpers
// =============================================================================

function makeGrid(W, H, fill) {
  const g = new Array(H);
  for (let y = 0; y < H; y++) g[y] = new Array(W).fill(fill);
  return g;
}

function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function fillRect(grid, x, y, w, h, tile) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (inBounds(grid, xx, yy)) grid[yy][xx] = tile;
}

function fillBorder(grid, tile) {
  const H = grid.length, W = grid[0].length;
  for (let x = 0; x < W; x++) { grid[0][x] = tile; grid[H - 1][x] = tile; }
  for (let y = 0; y < H; y++) { grid[y][0] = tile; grid[y][W - 1] = tile; }
}

// Carve a building: walls + floor + door + roof overhang (canopy).
// doorOffset: 'top' | 'bottom' | 'left' | 'right' | null (no door)
// Returns the door tile { x, y } or null.
function carveBuilding(grid, canopy, x, y, w, h, wallTile, floorTile, roofTile, doorOffset) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (!inBounds(grid, xx, yy)) continue;
      const isBorder = (yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1);
      grid[yy][xx] = isBorder ? wallTile : floorTile;
    }
  }
  let door = null;
  if (doorOffset) {
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    if (doorOffset === 'top'    && y > 0)             { grid[y][cx]         = floorTile; door = { x: cx, y: y }; }
    else if (doorOffset === 'bottom' && y + h < grid.length)  { grid[y + h - 1][cx] = floorTile; door = { x: cx, y: y + h - 1 }; }
    else if (doorOffset === 'left'   && x > 0)        { grid[cy][x]         = floorTile; door = { x: x, y: cy }; }
    else if (doorOffset === 'right'  && x + w < grid[0].length) { grid[cy][x + w - 1] = floorTile; door = { x: x + w - 1, y: cy }; }
  }
  // Roof overhang (1-tile wide above the building)
  if (canopy && y > 0) {
    for (let xx = x - 1; xx <= x + w; xx++) {
      if (inBounds(canopy, xx, y - 1)) canopy[y - 1][xx] = roofTile;
    }
  }
  return door;
}

// Scatter N tiles of `tile` at random non-overwriting positions in the given rectangle.
function scatter(grid, count, tile, x0, y0, w, h, rng) {
  rng = rng || Math.random;
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 8) {
    tries++;
    const xx = x0 + Math.floor(rng() * w);
    const yy = y0 + Math.floor(rng() * h);
    if (!inBounds(grid, xx, yy)) continue;
    const cur = grid[yy][xx];
    if (cur === T.GRASS || cur === T.GRASS2 || cur === T.FLOWER) {
      grid[yy][xx] = tile;
      placed++;
    }
  }
}

// Add TREE at (x,y) plus a canopy tile above it (Layer 4 walk-behind).
function placeTree(grid, canopy, x, y) {
  if (!inBounds(grid, x, y)) return;
  grid[y][x] = T.TREE;
  if (inBounds(canopy, x, y)) canopy[y][x] = C.TREE_CANOPY;
}

// =============================================================================
// MAP: Farm (player's farm — fomt farm.hh)
// =============================================================================
// Layout (40×30):
//   NW: Farmhouse (6×5) at (2,2) — door south → Farm House interior
//   NE: Barn (6×5) at (32,2)
//   SE: Coop (4×3) at (34,22)
//   SW: Pond (5×3) at (3,4) — water for fishing + Kappa rituals
//   Center: tilled field (16×5) for planting, fenced
//   Paths: connecting buildings + exits
// Exits:
//   N → town     (walk off north edge)
//   S → forest   (walk off south edge)
//   E → mountain (walk off east edge)
//   W → null     (mountain border — blocked by trees)
const farm = {
  id: 'farm',
  name: 'Farm',
  width: 40, height: 30,
  isInterior: false,
  exits: { north: 'town', south: 'forest', east: 'mountain', west: null },
  buildings: [
    { type: 'farmhouse', tx: 2,  ty: 2,  w: 6, h: 5, interior: 'farm_house', door: 'bottom' },
    { type: 'barn',      tx: 32, ty: 2,  w: 6, h: 5, door: null },
    { type: 'coop',      tx: 34, ty: 22, w: 4, h: 3, door: null },
  ],
  // NPCs that canonically live on / visit the Farm (canonical fomt: player only — Basil visits fall)
  npcSpawns: [
    // Basil — botanist (visits in Fall per fomt schedule)
    { id: 'basil', tx: 22, ty: 14, dir: 'down', season: 'fall' },
  ],
  generate() {
    const W = 40, H = 30;
    const m = makeGrid(W, H, T.GRASS);
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // Grass variation + flowers
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 13) % 5 === 0) m[y][x] = T.GRASS2;
        if ((x * 3 + y * 5) % 17 === 0) m[y][x] = T.FLOWER;
      }
    }

    // West border — dense trees (mountain border; no exit west)
    for (let y = 0; y < H; y++) {
      placeTree(m, can, 0, y);
      if (y % 2 === 0) placeTree(m, can, 1, y);
    }
    // North border — light trees with a clear exit path in the middle
    for (let x = 0; x < W; x++) {
      if (x < 16 || x > 23) placeTree(m, can, x, 0);
    }
    // South border — light trees with a clear exit path in the middle
    for (let x = 0; x < W; x++) {
      if (x < 16 || x > 23) placeTree(m, can, x, H - 1);
    }
    // East border — light trees with a clear exit path
    for (let y = 0; y < H; y++) {
      if (y < 12 || y > 17) placeTree(m, can, W - 1, y);
    }

    // Exit tile markers (walkable transition tiles in the gaps)
    // North exit (gap 16..23) — tile row 0
    for (let x = 16; x <= 23; x++) m[0][x] = TT.NORTH_EXIT;
    // South exit (gap 16..23) — tile row H-1
    for (let x = 16; x <= 23; x++) m[H - 1][x] = TT.SOUTH_EXIT;
    // East exit (gap 12..17) — tile col W-1
    for (let y = 12; y <= 17; y++) m[y][W - 1] = TT.EAST_EXIT;

    // Pond (SW — fomt hot-spring-adjacent water; serves as fishing spot + Kappa ritual site)
    const pondX = 3, pondY = 14, pondW = 6, pondH = 4;
    fillRect(m, pondX, pondY, pondW, pondH, T.WATER);
    for (let yy = pondY - 1; yy <= pondY + pondH; yy++) {
      for (let xx = pondX - 1; xx <= pondX + pondW; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }

    // Paths — connecting farmhouse ↔ field ↔ barn/coop + to exit gaps
    // Horizontal main path (y=14, going E-W across farm) — except through pond
    for (let x = 12; x < W - 1; x++) {
      if (m[14][x] === T.GRASS || m[14][x] === T.GRASS2 || m[14][x] === T.FLOWER) m[14][x] = T.PATH;
      if (m[15][x] === T.GRASS || m[15][x] === T.GRASS2 || m[15][x] === T.FLOWER) m[15][x] = T.PATH;
    }
    // Vertical path (x=20, from north exit to south exit through farm)
    for (let y = 1; y < H - 1; y++) {
      if (m[y][20] === T.GRASS || m[y][20] === T.GRASS2 || m[y][20] === T.FLOWER) m[y][20] = T.PATH;
    }
    // Vertical path from farmhouse door (x=5) down to main path
    for (let y = 7; y < 14; y++) {
      if (m[y][5] === T.GRASS || m[y][5] === T.GRASS2 || m[y][5] === T.FLOWER) m[y][5] = T.PATH;
    }

    // Farmhouse (NW) — door south → Farm House interior
    const fhDoor = carveBuilding(m, can, 2, 2, 6, 5, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'bottom');
    if (fhDoor) m[fhDoor.y][fhDoor.x] = TT.DOOR;  // door tile triggers interior transition

    // Barn (NE) — fomt barn.hh MAX_CAPACITY=8
    carveBuilding(m, can, 32, 2, 6, 5, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');

    // Coop (SE) — fomt coop.hh MAX_CAPACITY=4
    carveBuilding(m, can, 34, 22, 4, 3, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'left');

    // Field — tilled rows + fence (fomt field.hh FIELD_WIDTH=43, FIELD_HEIGHT=25)
    const fieldX = 14, fieldY = 19, fieldW = 16, fieldH = 6;
    fillRect(m, fieldX, fieldY, fieldW, fieldH, T.TILLED);
    // Fence perimeter around field
    for (let x = fieldX - 1; x <= fieldX + fieldW; x++) {
      if (inBounds(m, x, fieldY - 1) && m[fieldY - 1][x] !== T.PATH) m[fieldY - 1][x] = T.FENCE;
      if (inBounds(m, x, fieldY + fieldH) && m[fieldY + fieldH][x] !== T.PATH) m[fieldY + fieldH][x] = T.FENCE;
    }
    for (let y = fieldY - 1; y <= fieldY + fieldH; y++) {
      if (inBounds(m, fieldX - 1, y) && m[y][fieldX - 1] !== T.PATH) m[y][fieldX - 1] = T.FENCE;
      if (inBounds(m, fieldX + fieldW, y) && m[y][fieldX + fieldW] !== T.PATH) m[y][fieldX + fieldW] = T.FENCE;
    }

    // Scattered bushes + trees (forest touch along edges)
    scatter(m, 8, T.BUSH, 1, 8, 12, 6);
    scatter(m, 6, T.BUSH, 24, 20, 14, 8);
    scatter(m, 5, T.TREE, 26, 8, 6, 6);
    // Make sure scattered trees also get canopy
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (m[y][x] === T.TREE && can[y][x] === C.NONE) can[y][x] = C.TREE_CANOPY;
      }
    }

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Town (shops, square, mayor — fomt Mineral Town main street)
// =============================================================================
// Layout (40×30):
//   Top row of shops: Supermarket(10,4 8×5), Blacksmith(2,4 5×4), Clinic(20,4 5×4),
//                    Library(28,4 5×4)
//   Middle: Town Square (open central plaza with flowers + fountain)
//   Bottom: Mayor's House(14,20 6×4), Inn(28,20 8×5 — Ann works here)
//   SW corner: Church(2,20 5×4 — Carter)
// Exits:
//   N → null     (blocked by shops + mountain border)
//   S → farm     (walk off south edge back to Farm)
//   E → beach
//   W → mountain
const town = {
  id: 'town',
  name: 'Mineral Town',  // fomt ROM: 'North/South Side of Mineral Town'
  width: 40, height: 30,
  isInterior: false,
  exits: { north: null, south: 'farm', east: 'beach', west: 'mountain' },
  buildings: [
    { type: 'supermarket', tx: 10, ty: 4, w: 8, h: 5, interior: 'shop',       door: 'bottom' },
    { type: 'blacksmith',  tx: 2,  ty: 4, w: 5, h: 4, interior: 'blacksmith', door: 'bottom' },
    { type: 'clinic',       tx: 20, ty: 4, w: 5, h: 4, interior: 'clinic',     door: 'bottom' },
    { type: 'library',      tx: 28, ty: 4, w: 5, h: 4, interior: 'library',    door: 'bottom' },
    { type: 'mayor_house',  tx: 14, ty: 20, w: 6, h: 4, interior: 'mayor_house', door: 'top' },
    { type: 'inn',          tx: 28, ty: 20, w: 8, h: 5, interior: 'inn',          door: 'top' },
    { type: 'church',       tx: 2,  ty: 20, w: 5, h: 4, interior: 'church',       door: 'top' },
  ],
  // Canonical fomt NPCs whose primary residence is Town:
  //   Ann (Inn), Jeff+Sasha (Supermarket), Doctor+Elli (Clinic), Mary (Library),
  //   Saibara+Gray (Blacksmith), Thomas (Mayor House), Carter (Church), Cliff (Inn)
  npcSpawns: [
    { id: 'ann',     tx: 31, ty: 22, dir: 'down' },  // Inn
    { id: 'cliff',   tx: 33, ty: 23, dir: 'down' },  // Inn (wanders)
    { id: 'jeff',    tx: 13, ty: 7,  dir: 'down' },  // Supermarket
    { id: 'sasha',   tx: 14, ty: 7,  dir: 'down' },  // Supermarket (Jeff's wife)
    { id: 'elli',    tx: 22, ty: 7,  dir: 'down' },  // Clinic
    { id: 'doctor',  tx: 22, ty: 6,  dir: 'down' },  // Clinic
    { id: 'mary',    tx: 30, ty: 6,  dir: 'down' },  // Library
    { id: 'saibara', tx: 4,  ty: 6,  dir: 'down' },  // Blacksmith
    { id: 'gray',    tx: 4,  ty: 7,  dir: 'down' },  // Blacksmith (Saibara's grandson)
    { id: 'thomas',  tx: 17, ty: 21, dir: 'down' },  // Mayor House
    { id: 'carter',  tx: 4,  ty: 22, dir: 'down' },  // Church
    { id: 'won',     tx: 24, ty: 14, dir: 'down' },  // Merchant (wandering)
    { id: 'manna',   tx: 18, ty: 15, dir: 'down' },  // Vineyard wife (visits Town)
  ],
  generate() {
    const W = 40, H = 30;
    const m = makeGrid(W, H, T.GRASS);
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // Grass variation
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 13) % 5 === 0) m[y][x] = T.GRASS2;
        if ((x * 3 + y * 5) % 17 === 0) m[y][x] = T.FLOWER;
      }
    }

    // North border — trees (blocks N exit; also acts as mountain backdrop)
    for (let x = 0; x < W; x++) {
      placeTree(m, can, x, 0);
      if (x % 3 === 0) placeTree(m, can, x, 1);
    }
    // South border — exit gap (cols 16..23) back to Farm
    for (let x = 0; x < W; x++) {
      if (x < 16 || x > 23) placeTree(m, can, x, H - 1);
    }
    for (let x = 16; x <= 23; x++) m[H - 1][x] = TT.SOUTH_EXIT;
    // East border — exit gap (rows 12..17) to Beach
    for (let y = 0; y < H; y++) {
      if (y < 12 || y > 17) placeTree(m, can, W - 1, y);
    }
    for (let y = 12; y <= 17; y++) m[y][W - 1] = TT.EAST_EXIT;
    // West border — exit gap (rows 12..17) to Mountain
    for (let y = 0; y < H; y++) {
      if (y < 12 || y > 17) placeTree(m, can, 0, y);
    }
    for (let y = 12; y <= 17; y++) m[y][0] = TT.WEST_EXIT;

    // ===== Shops along top =====
    const supermarketDoor = carveBuilding(m, can, 10, 4, 8, 5, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');
    if (supermarketDoor) m[supermarketDoor.y][supermarketDoor.x] = TT.DOOR;
    const blacksmithDoor = carveBuilding(m, can, 2, 4, 5, 4, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');
    if (blacksmithDoor) m[blacksmithDoor.y][blacksmithDoor.x] = TT.DOOR;
    const clinicDoor = carveBuilding(m, can, 20, 4, 5, 4, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');
    if (clinicDoor) m[clinicDoor.y][clinicDoor.x] = TT.DOOR;
    const libraryDoor = carveBuilding(m, can, 28, 4, 5, 4, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');
    if (libraryDoor) m[libraryDoor.y][libraryDoor.x] = TT.DOOR;

    // ===== Bottom-row civic buildings =====
    const mayorDoor = carveBuilding(m, can, 14, 20, 6, 4, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'top');
    if (mayorDoor) m[mayorDoor.y][mayorDoor.x] = TT.DOOR;
    const innDoor = carveBuilding(m, can, 28, 20, 8, 5, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'top');
    if (innDoor) m[innDoor.y][innDoor.x] = TT.DOOR;
    const churchDoor = carveBuilding(m, can, 2, 20, 5, 4, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'top');
    if (churchDoor) m[churchDoor.y][churchDoor.x] = TT.DOOR;

    // ===== Town Square (central plaza) — fountain + flower beds =====
    // Fountain at (18..21, 13..15)
    fillRect(m, 18, 13, 4, 3, T.WATER);
    for (let yy = 12; yy <= 16; yy++) {
      for (let xx = 17; xx <= 22; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }
    // Flower beds around the plaza
    scatter(m, 10, T.FLOWER, 8, 12, 8, 6);
    scatter(m, 10, T.FLOWER, 24, 12, 8, 6);

    // ===== Paths — main street grid =====
    // Horizontal main street (y=11) connecting all shop doors to exits
    for (let x = 1; x < W - 1; x++) {
      if (m[11][x] === T.GRASS || m[11][x] === T.GRASS2 || m[11][x] === T.FLOWER) m[11][x] = T.PATH;
      if (m[12][x] === T.GRASS || m[12][x] === T.GRASS2 || m[12][x] === T.FLOWER) m[12][x] = T.PATH;
    }
    // Vertical main street (x=18) connecting N (blocked) to S exit
    for (let y = 1; y < H - 1; y++) {
      if (m[y][18] === T.GRASS || m[y][18] === T.GRASS2 || m[y][18] === T.FLOWER) m[y][18] = T.PATH;
    }
    // Vertical street (x=26) connecting E exit area to Inn
    for (let y = 9; y < 21; y++) {
      if (m[y][26] === T.GRASS || m[y][26] === T.GRASS2 || m[y][26] === T.FLOWER) m[y][26] = T.PATH;
    }

    // Scattered bushes (decorative)
    scatter(m, 6, T.BUSH, 8, 16, 6, 4);
    scatter(m, 4, T.BUSH, 22, 16, 6, 4);

    // Decor sparkles on the fountain (night effect)
    dec[14][20] = D.SPARKLE;
    dec[13][19] = D.SPARKLE;
    dec[15][21] = D.SPARKLE;

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Mountain (Spring Mine entrance, waterfall, hot spring, carpenter, Goddess Pond)
// =============================================================================
// Layout (40×30):
//   NE: Carpenter's Hut (32,4 5×4 — Gotz)
//   NW: Spring Mine entrance (waterfall — tile (4,8) special marker)
//   Center-N: Hot Spring (10,6 4×3 — water, restores stamina)
//   Center: Goddess Pond (16,12 6×4 — water, fishing + Kappa ritual site)
//   SE: Goddess Pond spill / river
//   Mountain cliffs (sand + grass terraces)
// Exits:
//   N → null     (mountain peak — blocked)
//   S → town     (back to Town via mountain pass)
//   E → null     (blocked by peak)
//   W → farm     (back to Farm)
const mountain = {
  id: 'mountain',
  name: "Mother's Hill",  // fomt ROM: 'Mother's Hill'
  width: 40, height: 30,
  isInterior: false,
  exits: { north: null, south: 'town', east: null, west: 'farm' },
  buildings: [
    { type: 'carpenter',      tx: 32, ty: 4, w: 5, h: 4, interior: 'carpenter', door: 'bottom' },
    { type: 'mine_entrance', tx: 4,  ty: 8, mineType: 'spring' },  // waterfall — handled by MineSystem
    { type: 'pond',           tx: 16, ty: 12, w: 6, h: 4 },         // Goddess Pond
    { type: 'hot_spring',     tx: 10, ty: 6, w: 4, h: 3 },           // stamina-restoring bath
  ],
  npcSpawns: [
    { id: 'gotz',  tx: 34, ty: 7,  dir: 'down' },  // Carpenter
    { id: 'basil', tx: 12, ty: 16, dir: 'down' },  // Botanist (Spring/Summer — studies mountain flora)
  ],
  generate() {
    const W = 40, H = 30;
    const m = makeGrid(W, H, T.GRASS);
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // Grass variation
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 13) % 5 === 0) m[y][x] = T.GRASS2;
        if ((x * 3 + y * 5) % 17 === 0) m[y][x] = T.FLOWER;
      }
    }

    // ===== Mountain terraces (sand paths on slopes) =====
    // Top terrace (y=2..7) — sandstone plateau
    fillRect(m, 0, 2, W, 2, T.SAND);
    fillRect(m, 8, 4, 20, 2, T.SAND);

    // Borders
    // North border — dense trees (mountain peak — blocks N exit)
    for (let x = 0; x < W; x++) {
      placeTree(m, can, x, 0);
      placeTree(m, can, x, 1);
    }
    // South border — exit gap (cols 16..23) to Town
    for (let x = 0; x < W; x++) {
      if (x < 16 || x > 23) placeTree(m, can, x, H - 1);
    }
    for (let x = 16; x <= 23; x++) m[H - 1][x] = TT.SOUTH_EXIT;
    // East border — dense trees (peak continues — blocks E exit)
    for (let y = 0; y < H; y++) {
      if (y < 24) placeTree(m, can, W - 1, y);
      if (y % 2 === 0 && y < 24) placeTree(m, can, W - 2, y);
    }
    // West border — exit gap (rows 12..17) to Farm
    for (let y = 0; y < H; y++) {
      if (y < 12 || y > 17) placeTree(m, can, 0, y);
    }
    for (let y = 12; y <= 17; y++) m[y][0] = TT.WEST_EXIT;

    // ===== Spring Mine entrance (waterfall) — at (4,8) =====
    // Draw a 3-tile waterfall + rocks around the entrance.
    // This tile is the trigger that MineSystem.enterMine('spring') watches for.
    // (MineSystem entrance proximity check is at the player's distance, not tile ID —
    // we just place a visual marker. The integration snippet will tell MineSystem about
    // the new entrance coords when this map is active.)
    // Waterfall: 3-tile water column falling into a small pool
    for (let yy = 6; yy <= 9; yy++) {
      for (let xx = 3; xx <= 5; xx++) {
        m[yy][xx] = T.WATER;
      }
    }
    // Surrounding rocks (sand)
    for (let yy = 5; yy <= 10; yy++) {
      for (let xx = 2; xx <= 6; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }
    // Stairs-down marker tile (player walks onto this → MineSystem.enterMine)
    m[9][4] = TT.STAIRS_DOWN;

    // ===== Hot Spring (water — restores stamina on contact; handled by snippet) =====
    fillRect(m, 10, 6, 4, 3, T.WATER);
    for (let yy = 5; yy <= 10; yy++) {
      for (let xx = 9; xx <= 14; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }

    // ===== Goddess Pond (fishing + Kappa ritual site) — at (16,12) 6×4 =====
    fillRect(m, 16, 12, 6, 4, T.WATER);
    for (let yy = 11; yy <= 17; yy++) {
      for (let xx = 15; xx <= 22; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }
    // Sparkle effect on the pond (Goddess lives here — Power Berry #8 via fishing)
    dec[14][19] = D.SPARKLE;
    dec[13][18] = D.SPARKLE;

    // ===== Carpenter's Hut (Gotz) — door south → interior =====
    const carpDoor = carveBuilding(m, can, 32, 4, 5, 4, T.SHOP_WALL, T.SHOP_FLOOR, C.ROOF_SHOP, 'bottom');
    if (carpDoor) m[carpDoor.y][carpDoor.x] = TT.DOOR;

    // ===== Paths connecting features =====
    // Main mountain path (sand-stone) — from W exit to Goddess Pond to Carpenter
    for (let x = 1; x < W - 1; x++) {
      if (m[16][x] === T.GRASS || m[16][x] === T.GRASS2 || m[16][x] === T.FLOWER) m[16][x] = T.PATH;
      if (m[17][x] === T.GRASS || m[17][x] === T.GRASS2 || m[17][x] === T.FLOWER) m[17][x] = T.PATH;
    }
    // Vertical path from N (mine area) to main path
    for (let y = 10; y < 16; y++) {
      if (m[y][20] === T.GRASS || m[y][20] === T.GRASS2 || m[y][20] === T.FLOWER) m[y][20] = T.PATH;
    }
    // Vertical path from main path to S exit
    for (let y = 18; y < H - 1; y++) {
      if (m[y][20] === T.GRASS || m[y][20] === T.GRASS2 || m[y][20] === T.FLOWER) m[y][20] = T.PATH;
    }

    // Dense forest on the mountain slopes (decorative trees)
    scatter(m, 12, T.TREE, 1, 8, 6, 4);
    scatter(m, 10, T.TREE, 24, 12, 8, 6);
    scatter(m, 8, T.TREE, 1, 20, 14, 6);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (m[y][x] === T.TREE && can[y][x] === C.NONE) can[y][x] = C.TREE_CANOPY;
      }
    }

    // Scattered bushes (herbs)
    scatter(m, 10, T.BUSH, 1, 18, 14, 8);

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Forest (Harvest Sprite hut, wood, herbs)
// =============================================================================
// Layout (40×30):
//   Center: Sprite Hut (16,12 6×4 — Harvest Sprites live here)
//   Surrounding: dense trees (wood), herb bushes, scattered flowers
//   Small pond (NE corner — fishing spot)
// Exits:
//   N → farm     (back to Farm via forest trail)
//   S → null     (deep forest — blocked)
//   E → null     (blocked by dense trees)
//   W → null     (blocked by dense trees)
const forest = {
  id: 'forest',
  name: 'Forest',
  width: 40, height: 30,
  isInterior: false,
  exits: { north: 'farm', south: null, east: null, west: null },
  buildings: [
    { type: 'sprite_hut', tx: 16, ty: 12, w: 6, h: 4, interior: 'sprite_hut', door: 'bottom' },
  ],
  npcSpawns: [
    { id: 'won', tx: 8, ty: 16, dir: 'right' },  // Won — merchant (sometimes found in forest)
  ],
  generate() {
    const W = 40, H = 30;
    const m = makeGrid(W, H, T.GRASS);
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // Grass variation
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 13) % 5 === 0) m[y][x] = T.GRASS2;
        if ((x * 3 + y * 5) % 17 === 0) m[y][x] = T.FLOWER;
      }
    }

    // ===== Dense forest border — only N has an exit gap (back to Farm) =====
    // North border — exit gap (cols 16..23)
    for (let x = 0; x < W; x++) {
      if (x < 16 || x > 23) placeTree(m, can, x, 0);
    }
    for (let x = 16; x <= 23; x++) m[0][x] = TT.NORTH_EXIT;
    // South border — dense trees
    for (let x = 0; x < W; x++) {
      placeTree(m, can, x, H - 1);
      if (x % 2 === 0) placeTree(m, can, x, H - 2);
    }
    // East border — dense trees
    for (let y = 0; y < H; y++) {
      placeTree(m, can, W - 1, y);
      if (y % 2 === 0) placeTree(m, can, W - 2, y);
    }
    // West border — dense trees
    for (let y = 0; y < H; y++) {
      placeTree(m, can, 0, y);
      if (y % 2 === 1) placeTree(m, can, 1, y);
    }

    // ===== Sprite Hut (Harvest Sprites) — at (16,12) 6×4 =====
    // Use SPRITE_HUT tile for the structure (special-cased in tileRenderLayer)
    fillRect(m, 16, 12, 6, 4, T.SPRITE_HUT);
    // Door (south-center) → interior
    m[15][18] = TT.DOOR;

    // ===== Small pond (NE) — fishing spot =====
    fillRect(m, 30, 4, 5, 3, T.WATER);
    for (let yy = 3; yy <= 8; yy++) {
      for (let xx = 29; xx <= 36; xx++) {
        if (inBounds(m, xx, yy) && m[yy][xx] !== T.WATER) m[yy][xx] = T.SAND;
      }
    }

    // ===== Path — from N exit to Sprite Hut =====
    for (let y = 1; y < 12; y++) {
      if (m[y][18] === T.GRASS || m[y][18] === T.GRASS2 || m[y][18] === T.FLOWER) m[y][18] = T.PATH;
    }
    for (let y = 16; y < H - 2; y++) {
      if (m[y][18] === T.GRASS || m[y][18] === T.GRASS2 || m[y][18] === T.FLOWER) m[y][18] = T.PATH;
    }

    // ===== Dense trees (forest canopy) =====
    scatter(m, 30, T.TREE, 2, 2, 12, 10);
    scatter(m, 25, T.TREE, 24, 4, 12, 14);
    scatter(m, 30, T.TREE, 2, 16, 12, 12);
    scatter(m, 18, T.TREE, 22, 20, 12, 8);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (m[y][x] === T.TREE && can[y][x] === C.NONE) can[y][x] = C.TREE_CANOPY;
      }
    }

    // ===== Herb bushes (forageable) =====
    scatter(m, 15, T.BUSH, 2, 2, 36, 26);

    // Fireflies at night (decor)
    for (let i = 0; i < 8; i++) {
      const fy = 2 + Math.floor(Math.random() * 26);
      const fx = 2 + Math.floor(Math.random() * 36);
      if (inBounds(dec, fx, fy) && dec[fy][fx] === D.NONE) dec[fy][fx] = D.FIREFLY;
    }

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Beach (ocean, Zack's shipping, Kai's seaside lodge, Greg's pier)
// =============================================================================
// Layout (40×30):
//   N: grassy bluff with Zack's house(2,4 5×4) and Kai's lodge(28,4 6×4)
//   Middle: sand beach (rows 8..20)
//   S: ocean (rows 21..29) — fishing spot
//   SE corner: Greg's pier (wood planks extending into ocean)
// Exits:
//   N → null     (cliff — blocked)
//   S → null     (ocean — blocked)
//   E → null     (blocked)
//   W → town     (back to Town)
const beach = {
  id: 'beach',
  name: 'Mineral Beach',  // fomt ROM: 'Mineral Beach'
  width: 40, height: 30,
  isInterior: false,
  exits: { north: null, south: null, east: null, west: 'town' },
  buildings: [
    { type: 'zack_house',  tx: 2,  ty: 4, w: 5, h: 4, interior: 'zack_house', door: 'bottom' },
    { type: 'kai_lodge',   tx: 28, ty: 4, w: 6, h: 4, interior: 'kai_lodge',  door: 'bottom' },
  ],
  npcSpawns: [
    { id: 'zack', tx: 4,  ty: 8, dir: 'down' },   // Shipper (Beach House)
    { id: 'kai',  tx: 30, ty: 8, dir: 'down', season: 'summer' },  // Kai — summer-only visitor
  ],
  generate() {
    const W = 40, H = 30;
    const m = makeGrid(W, H, T.SAND);  // start with sand (beach!)
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // Grass bluff on top 4 rows (where buildings sit)
    fillRect(m, 0, 0, W, 4, T.GRASS);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < W; x++) {
        if ((x * 7 + y * 13) % 5 === 0) m[y][x] = T.GRASS2;
        if ((x * 3 + y * 5) % 17 === 0) m[y][x] = T.FLOWER;
      }
    }

    // North border — trees (cliff — blocks N exit)
    for (let x = 0; x < W; x++) {
      placeTree(m, can, x, 0);
    }
    // South border — ocean (extends to bottom — blocks S exit)
    fillRect(m, 0, 21, W, 9, T.WATER);
    // East border — trees + rocks (blocks E exit)
    for (let y = 4; y < H; y++) {
      placeTree(m, can, W - 1, y);
      if (y % 3 === 0) placeTree(m, can, W - 2, y);
    }
    // West border — exit gap (rows 6..11) back to Town
    for (let y = 0; y < H; y++) {
      if (y < 6 || y > 11) placeTree(m, can, 0, y);
    }
    for (let y = 6; y <= 11; y++) {
      m[y][0] = TT.WEST_EXIT;
      // Make sure sand connects the exit through the bluff
      if (m[y][1] === T.TREE) m[y][1] = T.SAND;
    }

    // ===== Ocean — already drawn; add pier (Greg's fishing pier) =====
    // Pier: wood path extending south into ocean at (35..36, 18..24)
    for (let yy = 18; yy <= 24; yy++) {
      m[yy][35] = T.PATH;
      m[yy][36] = T.PATH;
    }

    // ===== Buildings =====
    const zackDoor = carveBuilding(m, can, 2, 4, 5, 4, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'bottom');
    if (zackDoor) m[zackDoor.y][zackDoor.x] = TT.DOOR;
    const kaiDoor = carveBuilding(m, can, 28, 4, 6, 4, T.WALL, T.FLOOR, C.ROOF_HOUSE, 'bottom');
    if (kaiDoor) m[kaiDoor.y][kaiDoor.x] = TT.DOOR;

    // ===== Path — beach boardwalk =====
    // Connect Zack's door to Kai's door (horizontal)
    for (let x = 1; x < W - 1; x++) {
      if (m[9][x] === T.GRASS || m[9][x] === T.GRASS2 || m[9][x] === T.FLOWER || m[9][x] === T.SAND) {
        if (m[9][x] !== T.WATER) m[9][x] = T.PATH;
      }
    }
    // Connect W exit to boardwalk
    for (let y = 6; y <= 9; y++) {
      if (m[y][1] === T.SAND || m[y][1] === T.GRASS) m[y][1] = T.PATH;
    }
    // Connect boardwalk to pier
    for (let y = 9; y <= 18; y++) {
      if (m[y][35] === T.SAND || m[y][35] === T.GRASS) m[y][35] = T.PATH;
    }

    // Decorative shells / flowers on sand
    scatter(m, 6, T.FLOWER, 4, 12, 30, 8);
    scatter(m, 4, T.BUSH, 4, 14, 24, 6);

    // Sparkles on the ocean (sun glint)
    dec[24][15] = D.SPARKLE;
    dec[26][20] = D.SPARKLE;
    dec[23][10] = D.SPARKLE;

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Farm House (interior — bed, TV, kitchen, fridge, shelf, tool chest)
// =============================================================================
// Layout (20×15):
//   Border: WALL (impassable)
//   Floor: interior FLOOR
//   Bed (NW corner 2×3)
//   TV (NE corner)
//   Kitchen (S — countertop)
//   Fridge + Shelf + Tool Chest (E wall)
//   Record Player (center)
//   Door (S-center) → exit back to Farm
// isInterior: true — no exits; exit via TT.DOOR tile.
const farm_house = {
  id: 'farm_house',
  name: 'Farm House',
  width: 20, height: 15,
  isInterior: true,
  exitTo: 'farm',
  buildings: [],
  npcSpawns: [],  // no NPCs in player's home
  generate() {
    const W = 20, H = 15;
    const m = makeGrid(W, H, T.FLOOR);
    const can = makeGrid(W, H, C.NONE);
    const dec = makeGrid(W, H, D.NONE);

    // WALL border (impassable perimeter)
    fillBorder(m, T.WALL);

    // ===== Bed (NW corner — 2×3) — sleep restores stamina =====
    // fomt farm_house.hh hasLargeBed; bed at (1,1) to (2,3)
    fillRect(m, 1, 1, 2, 3, T.SHOP_WALL);  // SHOP_WALL = "furniture-like" tile
    // (Tile collision: SHOP_WALL is solid — player can't walk through bed)

    // ===== TV (NE corner — for TV Shopping events) =====
    // fomt: TV furniture in farm_house. We use SHOP_WALL as the TV cabinet.
    m[1][W - 2] = T.SHOP_WALL;
    m[2][W - 2] = T.SHOP_WALL;

    // ===== Kitchen (S wall — countertop) =====
    // fomt: kitchen with knife/frying pan/pot/mixer/whisk/oven (upgradeable)
    for (let x = 2; x <= 8; x++) m[H - 2][x] = T.SHOP_WALL;
    // Fridge (corner)
    m[H - 2][1] = T.SHOP_WALL;

    // ===== East wall — Shelf + Tool Chest =====
    // fomt: Shelf (188-byte storage) + ToolChest (208-byte) + Fridge (108-byte)
    for (let y = 4; y <= 9; y++) m[y][W - 2] = T.SHOP_WALL;

    // ===== Record Player (center — fomt RecordPlayer furniture) =====
    m[Math.floor(H / 2)][Math.floor(W / 2)] = T.SHOP_WALL;
    dec[Math.floor(H / 2)][Math.floor(W / 2)] = D.RECORD_PLAYER;

    // ===== Door (S-center) — exit back to Farm =====
    m[H - 1][Math.floor(W / 2)] = TT.DOOR;

    // ===== Rug / floor mat (visual cue for entry) =====
    m[H - 2][Math.floor(W / 2)] = T.PATH;
    m[H - 3][Math.floor(W / 2)] = T.PATH;

    // Decor sparkles on the record player + TV
    dec[1][W - 2] = D.SPARKLE;

    return { map: m, canopyMap: can, decorMap: dec };
  },
};

// =============================================================================
// MAP: Generic Shop Interior (used by supermarket/blacksmith/clinic/library/
// carpenter/church/inn/zack_house/kai_lodge/mayor_house — all share this layout)
// =============================================================================
// We provide ONE reusable interior generator that takes a `name` and produces
// a small shop room with a counter + door. Specific shops can override later.
function makeGenericInterior(name, exitToId, accentTile) {
  accentTile = accentTile || T.SHOP_FLOOR;
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name: name,
    width: 20, height: 15,
    isInterior: true,
    exitTo: exitToId,
    buildings: [],
    npcSpawns: [],
    generate() {
      const W = 20, H = 15;
      const m = makeGrid(W, H, T.SHOP_FLOOR);
      const can = makeGrid(W, H, C.NONE);
      const dec = makeGrid(W, H, D.NONE);

      // SHOP_WALL border (impassable perimeter — distinct from player's house)
      fillBorder(m, T.SHOP_WALL);

      // Counter (S half — long bar where shopkeeper stands)
      for (let x = 2; x <= W - 3; x++) m[10][x] = T.SHOP_WALL;
      // Door (S-center — exit)
      m[H - 1][Math.floor(W / 2)] = TT.DOOR;

      // Display shelves along N wall
      for (let x = 1; x <= W - 2; x++) {
        if (x !== Math.floor(W / 2)) m[1][x] = T.SHOP_WALL;
      }
      // Side shelves along E and W walls
      for (let y = 2; y <= 8; y++) {
        m[y][1] = T.SHOP_WALL;
        m[y][W - 2] = T.SHOP_WALL;
      }

      // Entry mat
      m[H - 2][Math.floor(W / 2)] = T.PATH;
      m[H - 3][Math.floor(W / 2)] = T.PATH;

      // Use accent tile for the floor center (visual variation per shop type)
      if (accentTile !== T.SHOP_FLOOR) {
        fillRect(m, 3, 3, W - 6, 6, accentTile);
      }

      return { map: m, canopyMap: can, decorMap: dec };
    },
  };
}

// Generic shop interiors for all Town/Mountain/Beach buildings.
// (These are simple shared layouts; the orchestrator can later swap them for
// per-shop custom interiors if desired.)
const shop          = makeGenericInterior('Shop',          'town');
const blacksmith    = makeGenericInterior('Blacksmith',    'town');
const clinic        = makeGenericInterior('Clinic',         'town');
const library       = makeGenericInterior('Library',       'town');
const mayor_house   = makeGenericInterior('Mayor House',   'town');
const inn           = makeGenericInterior('Inn',           'town');
const church        = makeGenericInterior('Church',         'town');
const carpenter     = makeGenericInterior('Carpenter',      'mountain');
const sprite_hut    = makeGenericInterior('Sprite Hut',    'forest');
const zack_house    = makeGenericInterior('Zack House',    'beach');
const kai_lodge     = makeGenericInterior('Kai Lodge',     'beach');

// =============================================================================
// FOMT_MAPS — top-level export (all map definitions)
// =============================================================================
export const FOMT_MAPS = {
  // Overworld maps
  farm,
  town,
  mountain,
  forest,
  beach,
  // Interior maps
  farm_house,
  shop,
  blacksmith,
  clinic,
  library,
  mayor_house,
  inn,
  church,
  carpenter,
  sprite_hut,
  zack_house,
  kai_lodge,
};

// Helper: get map definition by ID
export function getMapById(id) {
  return FOMT_MAPS[id] || null;
}

// Helper: list all map IDs (for debugging / save serialization)
export function listMapIds() {
  return Object.keys(FOMT_MAPS);
}

// Helper: is the given tile ID a transition tile (TT.*)?
export function isTransitionTile(tileId) {
  return tileId >= 100 && tileId <= 105;
}

// Helper: given a transition tile ID, return the direction it represents
// (for edge exits). Returns null for non-edge transitions (DOOR, STAIRS_DOWN).
export function transitionTileDirection(tileId) {
  switch (tileId) {
    case TT.NORTH_EXIT: return 'north';
    case TT.SOUTH_EXIT: return 'south';
    case TT.EAST_EXIT:  return 'east';
    case TT.WEST_EXIT:  return 'west';
    default: return null;
  }
}

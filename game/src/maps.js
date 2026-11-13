// =============================================================================
// fomt Multiple Maps system — MapSystem runtime (Task B1-MULTI-MAPS)
// =============================================================================
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/src/scene.cc          — AScene::Run() loop pattern (next scene returned)
//   /tmp/fomt-repo-latest/asm/scene.s           — SceneMain: scene_ptr->Run() → next scene holder
//   /tmp/fomt-repo-latest/include/actor.hh      — Location{ map:10bit, x:16, y:16 } — multi-map model
//   /tmp/fomt-repo-latest/include/entity.hh     — AEntity::SetLocation(map, x, y) + PutOutOfTown()
//   /tmp/fomt-repo-latest/include/farm.hh       — Farm struct (Field, Barn, Coop, FarmHouse, Horse)
//   /tmp/fomt-repo-latest/src/data_schedules.cc — schedule_info.location_start (10-bit map ID)
//
// MapSystem owns:
//   currentMapId / previousMapId — which FOMT_MAPS entry is active
//   mapCache                     — per-map generated state (map, canopyMap, decorMap, cropMap)
//                                  preserves crops + tilled tiles across transitions
//   playerEntrySide              — which side the player entered from (positions player)
//   buildingStack                — for nested interiors (interior of interior — not yet needed)
//   transitionCooldown           — frames to wait before re-checking transitions (prevents
//                                  edge-trigger oscillation when player spawns at map edge)
//
// Cross-module dependencies (all wired via window.* in index.html inline script):
//   window.FOMT_MAPS             — map ROM data (data/maps_rom.js)
//   window.TT                    — Transition tile IDs (100..105)
//   window.player                — player state (x, y, dir, walkFrame)
//   window.map, window.canopyMap, window.decorMap, window.cropMap — current map 2D arrays
//   window.MAP_W, window.MAP_H, window.TILE — current map dimensions
//   window.npcs                  — NPC array (mutated to set npc._hidden per map)
//   window.toast(msg, type)      — UI feedback
//   window.spawnParticles(x, y, color, count) — visual effect
//   window.updateHUD()           — refresh HUD (zone label etc.)
//   window.AudioManager         — playZone() / playInteract() for transition SFX
//
// Public API:
//   MapSystem.init()                            — set starting map (Farm); expose globals
//   MapSystem.switchTo(mapId, entryPoint)       — switch to a new map (entry side for player spawn)
//   MapSystem.checkTransitions()                — per-frame: edge transitions + door/stairs tiles
//   MapSystem.enterBuilding(buildingDef)        — enter a building interior (via door)
//   MapSystem.exitBuilding()                    — exit current interior → exitTo map
//   MapSystem.getCurrentMap()                   — get current map definition
//   MapSystem.getPreviousMapId()                — for "back" navigation
//   MapSystem.serialize() / deserialize()      — for save/load (just currentMapId + previousMapId)
//
// Integration is non-invasive: the integration snippet wires MapSystem.checkTransitions()
// into the game loop and replaces the zone label with the current map's name. The original
// generateMap() in index.html becomes a no-op for non-Farm maps (MapSystem owns state).
// =============================================================================

export const MapSystem = {
  // ===== State =====
  currentMapId: 'farm',
  previousMapId: null,
  mapCache: {},             // { farm: {map, canopyMap, decorMap, cropMap}, town: {...}, ... }
  buildingStack: [],         // for nested interiors (entering interior of interior)
  transitionCooldown: 0,    // frames to skip transition checks after a switch (debounce)

  // Default starting position on Farm (matches existing game spawn)
  DEFAULT_PLAYER: { x: 20 * 32, y: 20 * 32, dir: 'down' },

  // ===== init() — set starting map; expose FOMT_MAPS to window =====
  init(startMapId) {
    if (!window.FOMT_MAPS) {
      console.warn('[MapSystem] FOMT_MAPS not loaded yet — init deferred');
      return false;
    }
    this.currentMapId = startMapId || 'farm';
    this.previousMapId = null;
    this.mapCache = {};
    this.buildingStack = [];
    this.transitionCooldown = 0;

    // Generate the starting map (caches the result)
    this._loadMapIntoWorld(this.currentMapId, 'default');
    console.log('[MapSystem] initialized — starting map:', this.currentMapId);
    return true;
  },

  // ===== switchTo(mapId, entryPoint) — switch to a new map =====
  // entryPoint: 'north' | 'south' | 'east' | 'west' | 'default' | 'door'
  //   'north' → player entered from the north → appear at TOP of new map (south of N edge)
  //   'south' → player entered from the south → appear at BOTTOM of new map (north of S edge)
  //   'east'  → player entered from the east → appear at RIGHT side (west of E edge)
  //   'west'  → player entered from the west → appear at LEFT side (east of W edge)
  //   'default' → use map's default spawn (usually center)
  //   'door'    → entering an interior → spawn at door tile inside the interior
  switchTo(mapId, entryPoint) {
    const FOMT_MAPS = window.FOMT_MAPS;
    if (!FOMT_MAPS || !FOMT_MAPS[mapId]) {
      console.warn('[MapSystem] switchTo: unknown mapId', mapId);
      return false;
    }
    if (mapId === this.currentMapId && this.transitionCooldown > 0) return false;

    // Save current map state (crops, tilled tiles) before switching — preserves Farm field
    this._saveCurrentMapState();

    this.previousMapId = this.currentMapId;
    this.currentMapId = mapId;

    // Load (or generate+cache) the new map's 2D arrays
    this._loadMapIntoWorld(mapId, entryPoint);

    // Reposition player based on entryPoint
    this._positionPlayerAtEntry(mapId, entryPoint);

    // Update visible NPCs for this map (hide NPCs not on this map)
    this._updateNpcVisibility(mapId);

    // Cooldown: 30 frames (0.5s @ 60fps) before re-checking transitions (prevents oscillation)
    this.transitionCooldown = 30;

    // UI feedback
    const mapDef = FOMT_MAPS[mapId];
    if (window.toast) window.toast(`🗺️ Memasuki ${mapDef.name}`, 'info');
    if (window.AudioManager && typeof window.AudioManager.playZone === 'function') {
      try { window.AudioManager.playZone(); } catch (e) {}
    }
    if (window.spawnParticles && window.player) {
      window.spawnParticles(window.player.x, window.player.y, '#ffe04a', 12);
    }
    if (typeof window.updateHUD === 'function') window.updateHUD();

    console.log('[MapSystem] switched:', this.previousMapId, '→', this.currentMapId, '(entry:', entryPoint + ')');
    return true;
  },

  // ===== checkTransitions() — called every frame by the game loop =====
  // Checks:
  //   1. Did the player walk off a map edge? (transition via TT.NORTH/SOUTH/EAST/WEST_EXIT)
  //   2. Did the player step on a TT.DOOR tile? (enter building)
  //   3. Did the player step on a TT.STAIRS_DOWN tile? (enter mine via stairs)
  checkTransitions() {
    if (this.transitionCooldown > 0) {
      this.transitionCooldown--;
      return;
    }
    const FOMT_MAPS = window.FOMT_MAPS;
    const TT = window.TT;
    const player = window.player;
    if (!FOMT_MAPS || !TT || !player) return;

    const mapDef = FOMT_MAPS[this.currentMapId];
    if (!mapDef) return;

    const TILE = window.TILE || 32;
    const MAP_W = window.MAP_W || mapDef.width;
    const MAP_H = window.MAP_H || mapDef.height;
    const map = window.map;
    if (!map) return;

    const px = player.x;
    const py = player.y;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);

    // ----- 1. Edge transitions -----
    // North edge: player walked off top of map
    if (py < 0 && mapDef.exits.north) {
      this.switchTo(mapDef.exits.north, 'north');
      return;
    }
    // South edge
    if (py > MAP_H * TILE && mapDef.exits.south) {
      this.switchTo(mapDef.exits.south, 'south');
      return;
    }
    // West edge
    if (px < 0 && mapDef.exits.west) {
      this.switchTo(mapDef.exits.west, 'west');
      return;
    }
    // East edge
    if (px > MAP_W * TILE && mapDef.exits.east) {
      this.switchTo(mapDef.exits.east, 'east');
      return;
    }

    // ----- 2. Tile-based transitions (player standing on a TT.* tile) -----
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return;
    const tile = map[ty][tx];

    // Edge-exit transition tiles
    if (tile === TT.NORTH_EXIT && mapDef.exits.north) {
      this.switchTo(mapDef.exits.north, 'south');
      return;
    }
    if (tile === TT.SOUTH_EXIT && mapDef.exits.south) {
      this.switchTo(mapDef.exits.south, 'north');
      return;
    }
    if (tile === TT.EAST_EXIT && mapDef.exits.east) {
      this.switchTo(mapDef.exits.east, 'west');
      return;
    }
    if (tile === TT.WEST_EXIT && mapDef.exits.west) {
      this.switchTo(mapDef.exits.west, 'east');
      return;
    }

    // Door tile — find the building whose door this is
    if (tile === TT.DOOR) {
      this._enterDoorAt(tx, ty);
      return;
    }

    // Stairs-down tile (mine entrance — handled by MineSystem if present)
    if (tile === TT.STAIRS_DOWN) {
      const MS = window.MineSystem;
      if (MS && typeof MS.enterMine === 'function') {
        // Find which mine this entrance belongs to (search map buildings for mine_entrance)
        const mineBuilding = (mapDef.buildings || []).find(b => b.type === 'mine_entrance');
        if (mineBuilding && mineBuilding.mineType) {
          if (MS.enterMine(mineBuilding.mineType)) {
            if (typeof window.openMineUI === 'function') window.openMineUI();
          }
        }
      } else {
        if (window.toast) window.toast('🪜 Stairs lead down... (Mine system not loaded)', 'info');
      }
      return;
    }
  },

  // ===== enterBuilding(buildingDef) — programmatic entry (e.g. via interaction menu) =====
  enterBuilding(buildingDef) {
    if (!buildingDef || !buildingDef.interior) return false;
    return this.switchTo(buildingDef.interior, 'door');
  },

  // ===== exitBuilding() — return from interior to previous (overworld) map =====
  exitBuilding() {
    const FOMT_MAPS = window.FOMT_MAPS;
    const cur = FOMT_MAPS && FOMT_MAPS[this.currentMapId];
    if (!cur || !cur.isInterior) {
      console.warn('[MapSystem] exitBuilding: not currently inside an interior');
      return false;
    }
    const target = cur.exitTo || this.previousMapId || 'farm';
    return this.switchTo(target, 'door_exit');
  },

  // ===== getCurrentMap() — get the current map definition =====
  getCurrentMap() {
    const FOMT_MAPS = window.FOMT_MAPS;
    return FOMT_MAPS ? FOMT_MAPS[this.currentMapId] : null;
  },

  getPreviousMapId() {
    return this.previousMapId;
  },

  // ===== Internal: load (or generate+cache) the map's 2D arrays into the world =====
  _loadMapIntoWorld(mapId, entryPoint) {
    const FOMT_MAPS = window.FOMT_MAPS;
    const mapDef = FOMT_MAPS[mapId];
    if (!mapDef) return;

    // Generate or fetch from cache
    let cached = this.mapCache[mapId];
    if (!cached) {
      const gen = mapDef.generate();
      cached = {
        map: gen.map,
        canopyMap: gen.canopyMap,
        decorMap: gen.decorMap,
        cropMap: this._makeEmptyCropMap(mapDef.width, mapDef.height),
      };
      this.mapCache[mapId] = cached;
    }

    // Push the cached arrays into the world (window globals)
    window.map = cached.map;
    window.canopyMap = cached.canopyMap;
    window.decorMap = cached.decorMap;
    window.cropMap = cached.cropMap;
    window.MAP_W = mapDef.width;
    window.MAP_H = mapDef.height;

    // Also push into the module-scoped game variables via the integration snippet's
    // sync hook (window.__MapSystemSyncMap). The integration snippet installs this
    // hook to mirror window.map → module-scoped map, etc. (because index.html uses
    // module-scoped consts; we can't directly reassign them from this module).
    if (typeof window.__MapSystemSyncMap === 'function') {
      window.__MapSystemSyncMap(cached.map, cached.canopyMap, cached.decorMap, cached.cropMap,
                                 mapDef.width, mapDef.height);
    }
  },

  // ===== Internal: save the current map's mutated state back to the cache =====
  // This preserves crops + tilled tiles + decor between transitions.
  _saveCurrentMapState() {
    if (!window.map) return;
    const cached = this.mapCache[this.currentMapId];
    if (!cached) return;
    // The 2D arrays ARE the cached arrays (we passed by reference in _loadMapIntoWorld),
    // so mutations are already reflected in the cache. We just need to confirm cropMap is current.
    if (window.cropMap && window.cropMap !== cached.cropMap) {
      cached.cropMap = window.cropMap;
    }
  },

  // ===== Internal: position the player at the appropriate entry point =====
  _positionPlayerAtEntry(mapId, entryPoint) {
    const FOMT_MAPS = window.FOMT_MAPS;
    const mapDef = FOMT_MAPS[mapId];
    const player = window.player;
    const TILE = window.TILE || 32;
    if (!mapDef || !player) return;

    if (entryPoint === 'north') {
      // Player entered from the north edge → appear at TOP of new map (row 2, center col)
      player.x = Math.floor(mapDef.width / 2) * TILE;
      player.y = 2 * TILE;
      player.dir = 'down';
    } else if (entryPoint === 'south') {
      // Player entered from the south edge → appear at BOTTOM of new map
      player.x = Math.floor(mapDef.width / 2) * TILE;
      player.y = (mapDef.height - 3) * TILE;
      player.dir = 'up';
    } else if (entryPoint === 'east') {
      // Player entered from the east edge → appear at RIGHT side
      player.x = (mapDef.width - 3) * TILE;
      player.y = Math.floor(mapDef.height / 2) * TILE;
      player.dir = 'left';
    } else if (entryPoint === 'west') {
      // Player entered from the west edge → appear at LEFT side
      player.x = 2 * TILE;
      player.y = Math.floor(mapDef.height / 2) * TILE;
      player.dir = 'right';
    } else if (entryPoint === 'door') {
      // Entering an interior — spawn near the door (S-center of interior)
      player.x = Math.floor(mapDef.width / 2) * TILE;
      player.y = (mapDef.height - 3) * TILE;
      player.dir = 'up';
    } else if (entryPoint === 'door_exit') {
      // Exiting an interior back to overworld — spawn in front of the building's door.
      // The building we want is on the TARGET map (mapId = the overworld we're returning to),
      // and its `interior` property should match the interior map we just left (previousMapId).
      const interiorMapId = this.previousMapId;  // the interior we just exited from
      const targetMap = FOMT_MAPS[mapId];        // the overworld we're now entering
      if (targetMap && targetMap.buildings) {
        const building = targetMap.buildings.find(b => b.interior === interiorMapId);
        if (building) {
          // Spawn just outside the building's door (one tile below the building's south edge)
          player.x = (building.tx + Math.floor(building.w / 2)) * TILE;
          player.y = (building.ty + building.h + 1) * TILE;
          player.dir = 'up';
        } else {
          // Fallback: center of map
          player.x = Math.floor(mapDef.width / 2) * TILE;
          player.y = Math.floor(mapDef.height / 2) * TILE;
        }
      } else {
        player.x = Math.floor(mapDef.width / 2) * TILE;
        player.y = Math.floor(mapDef.height / 2) * TILE;
      }
    } else {
      // 'default' — keep current position (init case) or use map center
      if (entryPoint !== 'default') {
        player.x = Math.floor(mapDef.width / 2) * TILE;
        player.y = Math.floor(mapDef.height / 2) * TILE;
      }
    }

    // Clamp to map bounds
    player.x = Math.max(TILE, Math.min((mapDef.width - 2) * TILE, player.x));
    player.y = Math.max(TILE, Math.min((mapDef.height - 2) * TILE, player.y));
  },

  // ===== Internal: find the building whose door tile is at (tx, ty) and enter it =====
  _enterDoorAt(tx, ty) {
    const FOMT_MAPS = window.FOMT_MAPS;
    const mapDef = FOMT_MAPS && FOMT_MAPS[this.currentMapId];
    if (!mapDef || !mapDef.buildings) return;

    // For interiors: a door tile means "exit this interior"
    if (mapDef.isInterior) {
      this.exitBuilding();
      return;
    }

    // For overworld: find the building whose rectangle contains (tx, ty) and has an interior
    for (const b of mapDef.buildings) {
      if (b.interior &&
          tx >= b.tx && tx < b.tx + b.w &&
          ty >= b.ty && ty < b.ty + b.h) {
        this.enterBuilding(b);
        return;
      }
    }
    // No matching building found — could be a free-standing door tile (rare)
    console.warn('[MapSystem] door tile at', tx, ty, 'has no matching building on', this.currentMapId);
  },

  // ===== Internal: hide NPCs whose home isn't on this map; show those whose home is =====
  _updateNpcVisibility(mapId) {
    const FOMT_MAPS = window.FOMT_MAPS;
    const mapDef = FOMT_MAPS && FOMT_MAPS[mapId];
    if (!mapDef) return;
    const npcs = window.npcs;
    if (!npcs || !npcs.length) return;

    // Build a lookup of NPC spawns for this map: { npcId: spawn }
    const spawns = {};
    for (const s of (mapDef.npcSpawns || [])) {
      // Season filter: only show NPCs whose season matches the current season (if specified)
      if (s.season && window.season && s.season !== window.season) continue;
      spawns[s.id] = s;
    }

    // ===== Show ALL NPCs on ALL maps (1:1 visibility) =====
    // In fomt, NPCs are only on their current map per their schedule. But for our web port,
    // we show all NPCs on all maps so the player can interact with any NPC at any time.
    // (Schedule-driven map placement is a future enhancement.)
    for (const npc of npcs) {
      const spawn = spawns[npc.id];
      npc._hidden = false;  // always visible — don't hide NPCs based on map
      if (spawn && !npc.met) {
        // NPC has a spawn point on this map and hasn't been met → place at spawn
        npc.x = spawn.tx * 32;
        npc.y = spawn.ty * 32;
        npc.dir = spawn.dir || 'down';
      } else if (spawn && npc.met) {
        // Met — let schedule drive position, but clamp to map bounds
        if (npc.scheduleTargetX == null || npc.scheduleTargetY == null ||
            npc.scheduleTargetX < 0 || npc.scheduleTargetY < 0 ||
            npc.scheduleTargetX > mapDef.width * 32 ||
            npc.scheduleTargetY > mapDef.height * 32) {
          npc.x = spawn.tx * 32;
          npc.y = spawn.ty * 32;
          npc.dir = spawn.dir || 'down';
          npc.scheduleTargetX = npc.x;
          npc.scheduleTargetY = npc.y;
          npc.scheduleTargetDir = npc.dir;
        }
      }
      // If no spawn point for this map, NPC stays at current position (schedule-driven)
    }
  },

  // ===== Internal: make an empty cropMap (2D array of nulls) =====
  _makeEmptyCropMap(W, H) {
    const g = new Array(H);
    for (let y = 0; y < H; y++) g[y] = new Array(W).fill(null);
    return g;
  },

  // ===== Serialize / Deserialize (for save/load) =====
  serialize() {
    return {
      currentMapId: this.currentMapId,
      previousMapId: this.previousMapId,
      // We don't serialize the mapCache (crops persist via the existing game save system
      // which already serializes cropMap; the cache will regenerate when the map loads)
    };
  },

  deserialize(state) {
    if (!state) return;
    if (state.currentMapId && window.FOMT_MAPS && window.FOMT_MAPS[state.currentMapId]) {
      this.currentMapId = state.currentMapId;
      this.previousMapId = state.previousMapId || null;
      // Re-load the saved map into the world
      this._loadMapIntoWorld(this.currentMapId, 'default');
      this._updateNpcVisibility(this.currentMapId);
    }
  },

  // ===== Debug helpers =====
  getStatus() {
    const FOMT_MAPS = window.FOMT_MAPS;
    const cur = FOMT_MAPS && FOMT_MAPS[this.currentMapId];
    return {
      currentMapId: this.currentMapId,
      currentMapName: cur ? cur.name : 'Unknown',
      previousMapId: this.previousMapId,
      isInterior: cur ? !!cur.isInterior : false,
      width: cur ? cur.width : 0,
      height: cur ? cur.height : 0,
      cachedMaps: Object.keys(this.mapCache),
      transitionCooldown: this.transitionCooldown,
    };
  },
};

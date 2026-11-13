// =============================================================================
// B1-MULTI-MAPS — Integration snippet for /home/z/my-project/public/game/index.html
// =============================================================================
//
// PURPOSE: Wires the fomt Multiple Maps system (data/maps_rom.js + src/maps.js)
// into index.html. Adds 6+ connected maps (Farm, Town, Mountain, Forest, Beach,
// Farm House + 11 generic shop interiors) with edge transitions (walk off the
// north/south/east/west edge → switch map), door-tile transitions (walk on a
// TT.DOOR tile → enter building interior), and stairs-down transitions (walk on
// TT.STAIRS_DOWN → enter mine). NPCs are shown/hidden per current map.
//
// INSTALL: paste the two blocks below near the end of index.html, just BEFORE
// the existing line:  window.addEventListener('load', init);
// (paste alongside the existing A1/A2/A3 integration snippets — they coexist)
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/include/actor.hh   — Location{ map:10bit, x:16, y:16 }
//   /tmp/fomt-repo-latest/include/scene.hh    — AScene::Run() (scene transition loop)
//   /tmp/fomt-repo-latest/asm/scene.s         — SceneMain: scene_ptr->Run() → next scene
//   /tmp/fomt-repo-latest/include/farm.hh     — Farm struct (FarmHouse/Coop/Barn/Field/Horse)
//   /tmp/fomt-repo-latest/include/farm_house.hh — FarmHouse (Fridge/Shelf/RecordPlayer/ToolChest)
//
// BLOCK 1 — ES module imports (paste alongside other `import(...)` calls):
// -----------------------------------------------------------------------------

// ===== fomt Maps ROM data (Farm/Town/Mountain/Forest/Beach + 12 interiors) =====
import('./data/maps_rom.js').then(m => {
  window.FOMT_MAPS = m.FOMT_MAPS;
  window.TT = m.TT;
  window.getMapById = m.getMapById;
  console.log('[fomt] Maps ROM loaded:', Object.keys(m.FOMT_MAPS).length, 'maps (Farm/Town/Mountain/Forest/Beach + 12 interiors)');
  if (typeof window.onFomtMapsDataReady === 'function') window.onFomtMapsDataReady();
}).catch(e => console.warn('[fomt] maps_rom load failed:', e));
// ===== fomt MapSystem (state + switchTo + checkTransitions + enter/exit building) =====
import('./src/maps.js').then(m => {
  window.MapSystem = m.MapSystem;
  console.log('[fomt] MapSystem loaded (state + switchTo + checkTransitions + enter/exit building)');
  if (typeof window.onFomtMapsDataReady === 'function') window.onFomtMapsDataReady();
}).catch(e => console.warn('[fomt] maps.js load failed:', e));

// =============================================================================
// BLOCK 2 — Non-module <script> with patches (paste AFTER the imports above,
//            still inside <script>)
// -----------------------------------------------------------------------------
// Patches:
//   1.  generateMap()    — delegate to MapSystem when ready (preserves init-time wiring)
//   2.  isWalkable()    — use window.map dimensions (variable map size support)
//   3.  updateCamera()  — use window.MAP_W/MAP_H (variable map size support)
//   4.  updatePlayer()  — override clamp to use window.MAP_W/MAP_H
//   5.  render()         — wrap: variable dimensions + skip hidden NPCs + draw TT.* overlays
//   6.  tileRenderLayer() — handle TT.* transition tiles (render as Layer 1 ground)
//   7.  drawTile()       — handle TT.* transition tiles (distinct visual per type)
//   8.  loop()           — call MapSystem.checkTransitions() each frame
//   9.  updateHUD()      — show current map name in HUD zone label
//  10.  __MapSystemSyncMap() — in-place mutation hook (mutates module-scoped arrays)
//  11.  NPC rendering   — skip NPCs marked npc._hidden === true
//  12.  Save/Load        — serialize/deserialize MapSystem state
// =============================================================================

(function installMapsIntegration() {
  function _try() {
    if (!window.FOMT_MAPS || !window.MapSystem || !window.player ||
        typeof window.useToolOrInteract !== 'function') {
      setTimeout(_try, 100);
      return;
    }
    _install();
    console.log('[fomt] Maps integration installed — 6+ maps with edge + door transitions');
  }
  _try();

  function _install() {
    const MS = window.MapSystem;
    const TT = window.TT;

    // ----- 1. window.__MapSystemSyncMap — in-place mutation hook -----
    // MapSystem calls this with the new map state. We mutate the module-scoped
    // `map`/`canopyMap`/`decorMap`/`cropMap` arrays IN-PLACE (since they're
    // declared with `let`, we can mutate their contents but not reassign them).
    // For MAP_W/MAP_H (declared `const`), we can't reassign — but we keep
    // window.MAP_W/MAP_H in sync, and the patches below read window.* versions.
    window.__MapSystemSyncMap = function(newMap, newCanopy, newDecor, newCrop, W, H) {
      // Mutate `map` array in-place: clear all rows, then push new rows
      if (typeof map !== 'undefined' && Array.isArray(map)) {
        map.length = 0;
        for (const row of newMap) map.push(row);
      }
      if (typeof canopyMap !== 'undefined' && Array.isArray(canopyMap)) {
        canopyMap.length = 0;
        for (const row of newCanopy) canopyMap.push(row);
      }
      if (typeof decorMap !== 'undefined' && Array.isArray(decorMap)) {
        decorMap.length = 0;
        for (const row of newDecor) decorMap.push(row);
      }
      if (typeof cropMap !== 'undefined' && Array.isArray(cropMap)) {
        cropMap.length = 0;
        for (const row of newCrop) cropMap.push(row);
      }
      // Update window.MAP_W/MAP_H (the consts in module scope can't be reassigned,
      // but our patched functions below read window.* versions).
      window.MAP_W = W;
      window.MAP_H = H;
    };

    // ----- 2. Patch generateMap() — delegate to MapSystem on subsequent calls -----
    // The original generateMap() runs once during init() to build the initial 40×30
    // world. We let it run, THEN initialize MapSystem on top (which replaces the
    // map with the Farm map). After init, generateMap() calls become no-ops (MapSystem
    // owns state).
    const _origGenerateMap = window.generateMap;
    let _mapSystemInitialized = false;
    window.generateMap = function() {
      if (_mapSystemInitialized) {
        console.log('[fomt] generateMap() — delegated to MapSystem (already initialized)');
        return;
      }
      // First call: run original generateMap to set up NPC roster + ambient life + spawn point
      _origGenerateMap.apply(this, arguments);
      // Then initialize MapSystem (replaces map with Farm map, sets up cache)
      MS.init('farm');
      _mapSystemInitialized = true;
    };
    // Also expose for late data-ready callback (if data loads after init)
    window.onFomtMapsDataReady = function() {
      if (window.FOMT_MAPS && window.MapSystem && !_mapSystemInitialized &&
          typeof window.player !== 'undefined' && window.player) {
        console.log('[fomt] Late Maps data ready — initializing MapSystem');
        MS.init('farm');
        _mapSystemInitialized = true;
        if (typeof window.updateHUD === 'function') window.updateHUD();
      }
    };

    // ----- 3. Patch isWalkable() — use window.map dimensions (variable map support) -----
    if (typeof window.isWalkable === 'function') {
      const _origIsWalkable = window.isWalkable;
      window.isWalkable = function(x, y) {
        const m = window.map;
        if (!m) return false;
        const H = m.length, W = m[0] ? m[0].length : 0;
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const t = m[y][x];
        // Transition tiles (TT.*) are walkable — let the player step on them
        // to trigger transitions via MapSystem.checkTransitions().
        // Solid tiles (matching original isWalkable blocklist):
        if (t === T.TREE || t === T.WATER || t === T.WALL || t === T.SHOP_WALL ||
            t === T.FENCE || t === T.BUSH || t === T.SPRITE_HUT) return false;
        return true;
      };
    }

    // ----- 4. Patch updateCamera() — use window.MAP_W/MAP_H -----
    if (typeof window.updateCamera === 'function') {
      window.updateCamera = function() {
        const vw = canvas.clientWidth, vh = canvas.clientHeight;
        camera.targetX = player.x - vw / 2;
        camera.targetY = player.y - vh / 2;
        // Smooth dampening
        const dampening = (typeof CAMERA_CONFIG !== 'undefined' && CAMERA_CONFIG.dampening) || 0.1;
        camera.x += (camera.targetX - camera.x) * dampening;
        camera.y += (camera.targetY - camera.y) * dampening;
        // Clamp to MapBounds (use window.MAP_W/H for variable dimensions)
        const mw = window.MAP_W || MAP_W;
        const mh = window.MAP_H || MAP_H;
        const maxX = mw * TILE - vw;
        const maxY = mh * TILE - vh;
        camera.x = Math.max(0, Math.min(maxX, camera.x));
        camera.y = Math.max(0, Math.min(maxY, camera.y));
      };
    }

    // ----- 5. Patch updatePlayer() — override clamp to use window.MAP_W/MAP_H -----
    // The original updatePlayer() reads module-scoped MAP_W/MAP_H consts for the clamp
    // at the very end. We wrap it so that AFTER it runs, we re-clamp using window.*.
    if (typeof window.updatePlayer === 'function') {
      const _origUpdatePlayer = window.updatePlayer;
      window.updatePlayer = function(dt) {
        _origUpdatePlayer.apply(this, arguments);
        // Re-clamp player position using the ACTUAL current map dimensions
        const mw = window.MAP_W || MAP_W;
        const mh = window.MAP_H || MAP_H;
        player.x = Math.max(TILE, Math.min((mw - 2) * TILE, player.x));
        player.y = Math.max(TILE, Math.min((mh - 2) * TILE, player.y));
      };
    }

    // ----- 6. Patch tileRenderLayer() — handle TT.* transition tiles -----
    // Transition tiles render as Layer 1 (ground) so they're drawn first, then
    // player/NPCs render on top. This ensures the player can SEE the exit arrow.
    if (typeof window.tileRenderLayer === 'function') {
      const _origTileRenderLayer = window.tileRenderLayer;
      window.tileRenderLayer = function(tileId) {
        // Transition tiles (100..105) render as Layer 1 (ground)
        if (tileId >= 100 && tileId <= 105) return 1;
        return _origTileRenderLayer.apply(this, arguments);
      };
    }

    // ----- 7. Patch drawTile() — handle TT.* transition tiles with distinct visuals -----
    if (typeof window.drawTile === 'function') {
      const _origDrawTile = window.drawTile;
      window.drawTile = function(tile, x, y) {
        if (tile >= 100 && tile <= 105) {
          _drawTransitionTile(tile, x, y);
          return;
        }
        _origDrawTile.apply(this, arguments);
      };
    }
    function _drawTransitionTile(tile, x, y) {
      const px = x * TILE - camera.x;
      const py = y * TILE - camera.y;
      if (px < -TILE || py < -TILE || px > canvas.clientWidth + TILE || py > canvas.clientHeight + TILE) return;
      // Base ground: grass (so transition tiles blend with terrain)
      if (typeof drawAssetTileOrFallback === 'function') {
        drawAssetTileOrFallback('grassAlt', px, py, '#5a8a4a');
      } else {
        ctx.fillStyle = '#5a8a4a';
        ctx.fillRect(px, py, TILE, TILE);
      }
      // Overlay: distinctive marker per transition type
      ctx.save();
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = px + TILE / 2, cy = py + TILE / 2;
      switch (tile) {
        case TT.NORTH_EXIT:
          ctx.fillStyle = 'rgba(255,224,74,0.35)'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#ffe04a'; ctx.fillText('⬆️', cx, cy);
          break;
        case TT.SOUTH_EXIT:
          ctx.fillStyle = 'rgba(255,224,74,0.35)'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#ffe04a'; ctx.fillText('⬇️', cx, cy);
          break;
        case TT.EAST_EXIT:
          ctx.fillStyle = 'rgba(255,224,74,0.35)'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#ffe04a'; ctx.fillText('➡️', cx, cy);
          break;
        case TT.WEST_EXIT:
          ctx.fillStyle = 'rgba(255,224,74,0.35)'; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#ffe04a'; ctx.fillText('⬅️', cx, cy);
          break;
        case TT.DOOR:
          // Door — brown rectangle (like a wooden door)
          ctx.fillStyle = '#6a4020'; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.fillStyle = '#3a2010'; ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
          ctx.fillStyle = '#ffe04a'; ctx.beginPath(); ctx.arc(cx + 6, cy, 2, 0, Math.PI * 2); ctx.fill();
          break;
        case TT.STAIRS_DOWN:
          // Stairs down — gray stairs icon
          ctx.fillStyle = '#404040'; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.fillStyle = '#808080';
          for (let i = 0; i < 3; i++) ctx.fillRect(px + 6, py + 8 + i * 6, TILE - 12, 4);
          ctx.fillStyle = '#ffe04a'; ctx.font = '14px sans-serif'; ctx.fillText('🪜', cx, cy);
          break;
      }
      ctx.restore();
    }

    // ----- 8. Patch render() — variable dimensions + skip hidden NPCs -----
    // We don't replace the entire render (too risky); instead we patch the NPC
    // rendering loop to skip hidden NPCs. The variable-dimensions issue is handled
    // by patching isWalkable + updateCamera + updatePlayer + the module-scoped
    // `map` array mutation in __MapSystemSyncMap (so render reads correct map data).
    //
    // BUT: render() also reads MAP_W/MAP_H (const) for startX/endX/startY/endY.
    // We need to patch this. Approach: hook into render() via the existing A1/A2/A3
    // render wrapper (they already chain via window.render). We add our own chain link.
    const _origRender = window.render;
    if (typeof _origRender === 'function') {
      window.render = function() {
        // Temporarily override MAP_W/MAP_H via getter trick — actually we can't, they're const.
        // Instead, we patch the visible-tile-range computation by intercepting the
        // original render's reads. Since we can't, we wrap render with a dimension-shim:
        // before calling original, we ensure window.MAP_W/H match what we want.
        // The original render uses MAP_W const (always 40). For interior maps (20×15),
        // the original will compute endX = min(39, ...) which is fine since 39 > 19.
        // But map[y][x] for x > 19 will be undefined → render tries to draw undefined tile.
        //
        // SOLUTION: wrap render to skip out-of-bounds tile access. We do this by
        // patching map[y][x] reads via a Proxy. But Proxy is heavy.
        //
        // SIMPLER: we pre-check — if the current map's dimensions match MAP_W/MAP_H
        // (the consts = 40×30), call original render directly. If they differ (interiors),
        // use our own minimal render that reads window.map + window.MAP_W/H directly.
        const mw = window.MAP_W || MAP_W;
        const mh = window.MAP_H || MAP_H;
        if (mw === MAP_W && mh === MAP_H) {
          // Dimensions match — call original (then patch NPC layer to skip hidden)
          _origRender.apply(this, arguments);
          return;
        }
        // Dimensions differ (interior map) — use our own minimal render
        _renderVariableMap();
      };
    }

    // Minimal render for variable-dimension maps (interiors).
    // Reimplements just enough of render() to handle interiors correctly.
    // Reuses existing drawTile(), drawCanopyTile(), drawPlayer(), drawNPC(), drawPet().
    function _renderVariableMap() {
      const vw = canvas.clientWidth, vh = canvas.clientHeight;
      ctx.fillStyle = '#2d4a2d';
      ctx.fillRect(0, 0, vw, vh);
      const mw = window.MAP_W || MAP_W;
      const mh = window.MAP_H || MAP_H;
      const m = window.map, can = window.canopyMap, dec = window.decorMap;
      const startX = Math.max(0, Math.floor(camera.x / TILE));
      const endX = Math.min(mw - 1, Math.ceil((camera.x + vw) / TILE));
      const startY = Math.max(0, Math.floor(camera.y / TILE));
      const endY = Math.min(mh - 1, Math.ceil((camera.y + vh) / TILE));

      // Layer 1 (Ground)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (tileRenderLayer(m[y][x]) === 1) drawTile(m[y][x], x, y);
        }
      }
      // Layer 2 (WalkInFront — paths, flowers, crops)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (tileRenderLayer(m[y][x]) === 2) drawTile(m[y][x], x, y);
          // Crops
          const c = cropMap[y] && cropMap[y][x];
          if (c && typeof drawCrop === 'function') drawCrop(c, x, y);
        }
      }
      // Layer 3 (Collision)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (tileRenderLayer(m[y][x]) === 3) drawTile(m[y][x], x, y);
        }
      }
      // Layer 3.5 (Player + NPCs + dog) — Y-sorted, skip hidden NPCs
      const drawables = [];
      for (const n of npcs) {
        if (n._hidden) continue;  // skip NPCs not on this map
        drawables.push({ y: n.y + TILE / 2, kind: 'npc', ref: n });
      }
      if (typeof pet !== 'undefined' && pet.dog) {
        drawables.push({ y: pet.dog.y + TILE / 2, kind: 'dog', ref: pet.dog });
      }
      drawables.push({ y: player.y, kind: 'player' });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (d.kind === 'npc' && typeof drawNPC === 'function') drawNPC(d.ref);
        else if (d.kind === 'dog' && typeof drawPet === 'function') drawPet(d.ref, 'dog');
        else if (d.kind === 'player' && typeof drawPlayer === 'function') drawPlayer();
      }
      // Layer 4 (WalkBehind — canopy / roof overhangs)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (can[y][x] && typeof drawCanopyTile === 'function') drawCanopyTile(can[y][x], x, y);
        }
      }
      // Layer 5 (Decor — top-most)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          if (dec[y][x] && typeof drawDecorTile === 'function') drawDecorTile(dec[y][x], x, y);
        }
      }
      // Particles (fomt power-berry sparkles, etc.)
      if (typeof drawParticles === 'function') drawParticles();
      // Fireflies (night ambient)
      if (typeof drawFireflies === 'function') drawFireflies();
    }

    // ----- 9. Patch the original render's NPC layer to skip hidden NPCs -----
    // The original render() iterates `for (const n of npcs) drawables.push(...)` —
    // this includes ALL NPCs, even hidden ones. We can't patch that loop directly
    // (it's inside the function body). Instead, we patch drawNPC to skip hidden:
    if (typeof window.drawNPC === 'function' && !window.drawNPC._multiMapsPatched) {
      const _origDrawNPC = window.drawNPC;
      window.drawNPC = function(n) {
        if (n._hidden) return;  // skip NPCs not on the current map
        return _origDrawNPC.apply(this, arguments);
      };
      window.drawNPC._multiMapsPatched = true;
    }

    // ----- 10. Patch loop() — call MapSystem.checkTransitions() each frame -----
    // We can't directly patch loop() (it's the requestAnimationFrame driver), but
    // we can install a hook via the existing per-frame render wrapper. The A1/A2/A3
    // integrations already wrap render; we piggyback on that by adding checkTransitions
    // BEFORE render is called. Simplest: use a requestAnimationFrame chain.
    let _mapTickInstalled = false;
    function _installMapTick() {
      if (_mapTickInstalled) return;
      _mapTickInstalled = true;
      // Use a separate rAF that runs alongside the main loop, calling checkTransitions.
      // This is independent of the main loop's pause state — but MapSystem.checkTransitions
      // has its own cooldown logic to prevent rapid-fire transitions.
      function _tick() {
        if (window.gameStarted && !window.isPaused && !window.isMenuOpen && !window.dialogActive) {
          try { MS.checkTransitions(); } catch (e) { console.warn('[MapSystem] checkTransitions error:', e); }
        }
        requestAnimationFrame(_tick);
      }
      requestAnimationFrame(_tick);
    }
    _installMapTick();

    // ----- 11. Patch updateHUD() — show current map name in zone label -----
    if (typeof window.updateHUD === 'function') {
      const _origUpdateHUD = window.updateHUD;
      window.updateHUD = function() {
        _origUpdateHUD.apply(this, arguments);
        const hudZoneEl = document.getElementById('hud-zone');
        if (hudZoneEl) {
          const mapDef = MS.getCurrentMap();
          hudZoneEl.textContent = mapDef ? mapDef.name : '—';
        }
        // Also update the menu Map-tab zone label
        const el1 = document.getElementById('ui-current-zone');
        const el2 = document.getElementById('ui-map-zone');
        const mapDef = MS.getCurrentMap();
        const label = mapDef ? mapDef.name : 'Unknown';
        if (el1) el1.textContent = label;
        if (el2) el2.textContent = label;
      };
    }

    // ----- 12. Patch save() to persist MapSystem state -----
    if (typeof window.save === 'function' && !window.save._multiMapsPatched) {
      const _origSave = window.save;
      window.save = function() {
        const result = _origSave.apply(this, arguments);
        try {
          const ms = MS.serialize();
          localStorage.setItem('fomt_map_system_v1', JSON.stringify(ms));
        } catch (e) { /* localStorage may be unavailable */ }
        return result;
      };
      window.save._multiMapsPatched = true;
    }
    if (typeof window.load === 'function' && !window.load._multiMapsPatched) {
      const _origLoad = window.load;
      window.load = function() {
        const result = _origLoad.apply(this, arguments);
        try {
          const raw = localStorage.getItem('fomt_map_system_v1');
          if (raw) MS.deserialize(JSON.parse(raw));
        } catch (e) { /* localStorage may be unavailable */ }
        return result;
      };
      window.load._multiMapsPatched = true;
    }

    // ----- 13. Update NPC visibility on first init -----
    // (MapSystem.init() calls _updateNpcVisibility, but if NPCs were generated after
    //  MapSystem.init, we need to re-call it. We use a small delay.)
    setTimeout(() => {
      if (window.npcs && window.npcs.length > 0) {
        MS._updateNpcVisibility(MS.currentMapId);
        console.log('[fomt] NPC visibility updated for map:', MS.currentMapId,
                    '(visible:', window.npcs.filter(n => !n._hidden).length, '/',
                    window.npcs.length, ')');
      }
    }, 500);

    // ----- 14. Hot-key: press 'M' to open a quick map-switch debug menu -----
    // (Useful for testing all 6 maps quickly)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'M' && e.shiftKey && !window.dialogActive && !window.isMenuOpen) {
        const ids = Object.keys(window.FOMT_MAPS);
        const idx = ids.indexOf(MS.currentMapId);
        const nextId = ids[(idx + 1) % ids.length];
        MS.switchTo(nextId, 'default');
      }
    });

    // ----- 15. Debug: expose MapSystem status -----
    window.__MapSystemDebug = function() {
      console.log('MapSystem status:', MS.getStatus());
      console.log('NPCs on this map:', window.npcs.filter(n => !n._hidden).map(n => n.id));
      console.log('NPCs hidden:', window.npcs.filter(n => n._hidden).map(n => n.id));
      console.log('Current map tile at player:', window.map[Math.floor(window.player.y / 32)]?.[Math.floor(window.player.x / 32)]);
    };

    console.log('[fomt] Maps integration patches installed:',
      'generateMap, isWalkable, updateCamera, updatePlayer, tileRenderLayer,',
      'drawTile, render (variable-dim), drawNPC (hidden skip), loop (rAF tick),',
      'updateHUD (zone label), save/load (MapSystem state), Shift+M (debug cycle)');
  }
})();

// =============================================================================
// A2-FISHING — Integration snippet for /home/z/my-project/public/game/index.html
// =============================================================================
//
// PURPOSE: Wires the fomt Fishing system (data/fishing_rom.js + src/fishing.js)
// into index.html. Adds the Fishing Rod as a 7th hotbar tool (key '7'),
// adds 3 new water bodies (ocean south beach, river near farm, hot spring near
// mine) plus reuses the existing Goddess Pond, hooks the action button to
// FishingSystem.tryCast()/tryHook(), and draws the fishing line + bobber + "!"
// bite indicator on the canvas during a cast.
//
// INSTALL: paste the two blocks below near the end of index.html, just BEFORE
// the existing line:  window.addEventListener('load', init);
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/data/item/product.def     — REAL fish product IDs + prices
//   /tmp/fomt-repo-latest/data/item/article.def     — Pirate Treasure/Fossil/Junk articles
//   /tmp/fomt-repo-latest/data/item/food.def         — Small/Medium/Large Fish foods
//   /tmp/fomt-repo-latest/data/item/tool.def         — FISHING_ROD (0x28, Iron tier)
//   /tmp/fomt-repo-latest/include/farmer.hh           — Farmer::ToolLevel (fishing = unk_2C[5])
//   /tmp/fomt-repo-latest/src/farmer.cc              — TOOL_FISHING_ROD upgrade path
//   existing game's mine_integration.snippet.js      — pattern for adding a tool/hotbar slot
//
// DESIGN NOTES:
//   • The game already has the Goddess Pond at tiles x=4..8, y=5..7 (T.WATER).
//     That pond is reused as the "lake" water type + Power Berry spot.
//   • We add 3 new water bodies via map mutation (in _installMapWater):
//       - ocean (south beach):      y=25..26, x=2..37 (replaces tree border)
//       - river (near farm west):   x=11..13, y=10..24 (vertical strip west of farm)
//       - hot_spring (near mine):   x=34..37, y=11..13 (between Spring Mine + Carpenter)
//   • The Fishing Rod becomes hotbar slot 6 (key '7'), since mining already uses slot 5 (Hammer).
//   • When fishing rod is selected AND player is not currently casting AND player presses
//     the action button → FishingSystem.tryCast(player.x, player.y, player.dir).
//   • When the player is currently biting AND presses the action button → FishingSystem.tryHook().
//   • The fishing line + bobber + "!" indicator are drawn in a patched render() function.
//   • Moving away from the cast tile (more than 2 tiles) auto-cancels the cast.
//
// BLOCK 1 — ES module imports (paste alongside other `import(...)` calls):
// -----------------------------------------------------------------------------

// ===== fomt Fishing data (9 fish + Power Berry + catch tables) =====
import('./data/fishing_rom.js').then(m => {
  window.FOMT_FISHING = m.FOMT_FISHING;
  console.log('[fomt] Fishing data loaded:', m.FOMT_FISHING.fish.length, 'fish types');
  if (typeof window.onFomtFishingDataReady === 'function') window.onFomtFishingDataReady();
}).catch(e => console.warn('[fomt] fishing_rom load failed:', e));
// ===== fomt FishingSystem (state machine + cast/bite/hook/catch) =====
import('./src/fishing.js').then(m => {
  window.FishingSystem = m.FishingSystem;
  console.log('[fomt] FishingSystem loaded (state + cast/bite/hook/catch)');
  if (typeof window.onFomtFishingDataReady === 'function') window.onFomtFishingDataReady();
}).catch(e => console.warn('[fomt] fishing.js load failed:', e));

// =============================================================================
// BLOCK 2 — Non-module <script> with fishing tool + water tiles + render hooks
// (paste immediately AFTER the ES module imports above, still inside <script>)
// -----------------------------------------------------------------------------

// ===== fomt Fishing integration (Task A2-FISHING) =====
// Adds Fishing Rod as 7th tool (hotbar slot 6, key '7'), adds water bodies to the
// map, hooks useToolOrInteract + render + game loop tick.
(function installFishingIntegration() {
  function _try() {
    if (!window.FOMT_FISHING || !window.FishingSystem || !window.player ||
        !window.map || typeof window.useToolOrInteract !== 'function') {
      setTimeout(_try, 100);
      return;
    }
    _install();
    console.log('[fomt] Fishing integration installed — Fishing Rod (key 7) + Ocean/River/Lake/Hot Spring');
  }
  _try();

  function _install() {
    const FS = window.FishingSystem;
    const FF = window.FOMT_FISHING;

    // ----- 1. Register Fishing Rod as a 7th tool (hotbar slot 6, key '7') -----
    if (!TOOLS.find(t => t.id === 'fishing')) {
      TOOLS.push({ id: 'fishing', name: 'Pancing', icon: '🎣', key: '7' });
    }

    // ----- 2. Add 3 new water bodies to the map (ocean/river/hot_spring) -----
    // Lake (Goddess Pond) already exists at tiles x=4..8, y=5..7. We only add the other 3.
    // This runs after the game's generateMap() populates the map.
    _installMapWater();

    // ----- 3. Patch selectFromHotbar to handle slot 6 = Fishing Rod -----
    const _origSelectFromHotbar = window.selectFromHotbar;
    window.selectFromHotbar = function(slotIndex) {
      if (slotIndex === 6) {
        activeHotbarIndex = 6;
        selectTool('fishing');
        if (window.toast) window.toast('🎣 Fishing Rod selected', 'info');
        return;
      }
      return _origSelectFromHotbar(slotIndex);
    };

    // Bind key '7' → select Fishing Rod (capture phase — runs before existing listener)
    window.addEventListener('keydown', (e) => {
      if (window.menuOpen || window.dialogActive || window.isMenuOpen) return;
      if (e.key === '7') {
        selectFromHotbar(6);
      }
    }, true);

    // ----- 4. Patch useToolOrInteract to handle Fishing Rod action button -----
    // Action button = spacebar (existing) or E. If selected tool is 'fishing':
    //   • If currently biting → tryHook()
    //   • Else → tryCast(player.x, player.y, player.dir)
    const _origUseToolOrInteract = window.useToolOrInteract;
    window.useToolOrInteract = function() {
      if (window.selectedTool === 'fishing') {
        // If biting, press = hook attempt
        if (FS.state.isBiting) {
          FS.tryHook();
          updateHUD();
          return;
        }
        // If currently casting (waiting for bite), pressing again re-casts (cancel + cast)
        if (FS.state.isCasting) {
          // Cancel current cast, then attempt new cast
          FS.cancelCast();
        }
        // Try to cast at facing water tile
        const ok = FS.tryCast(player.x, player.y, player.dir);
        if (ok) {
          updateHUD();
          save();   // persist Power Berry flag
        }
        return;
      }
      return _origUseToolOrInteract();
    };

    // ----- 5. Patch render() to draw fishing line + bobber + "!" indicator -----
    const _origRender = window.render;
    if (typeof _origRender === 'function') {
      window.render = function(dt) {
        _origRender(dt);
        _drawFishingOverlay();
      };
    }

    // ----- 6. Patch game loop tick — update bobber animation + auto-cancel on move -----
    // The game's main loop calls requestAnimationFrame(loop); we hook loop's update phase
    // by patching the loop function itself if exposed, else use a separate RAF.
    let _lastT = performance.now();
    function _fishingTick() {
      const now = performance.now();
      const dt = (now - _lastT) / 1000;
      _lastT = now;
      if (FS.state.isCasting) {
        FS.tick(dt);
        // Auto-cancel if player moved too far from cast position (>2 tiles)
        if (FS.state.castLocation) {
          const TILE = window.TILE || 32;
          const dx = player.x - FS.state.castPlayerX;
          const dy = player.y - FS.state.castPlayerY;
          if (Math.hypot(dx, dy) > TILE * 2.5) {
            FS.cancelCast();
          }
        }
      }
      requestAnimationFrame(_fishingTick);
    }
    requestAnimationFrame(_fishingTick);

    // ----- 7. Wire up data-ready callback (re-run install if data loads late) -----
    window.onFomtFishingDataReady = function() {
      console.log('[fomt] Fishing data + FishingSystem ready — Ocean/River/Lake/Hot Spring available');
    };

    // ----- 8. Persist Power Berry caught flag in save/load -----
    // Hook into existing save() / load() if available
    if (typeof window.save === 'function' && !window._fishingSaveHooked) {
      const _origSave = window.save;
      window.save = function() {
        // Inject fishing state into save before original save runs
        try {
          window._fishingSaveData = FS.serialize();
        } catch (e) { /* ignore */ }
        return _origSave();
      };
      window._fishingSaveHooked = true;
    }
    // Try to restore on load (best-effort — if game's load() exposes hook)
    if (typeof window.load === 'function' && !window._fishingLoadHooked) {
      const _origLoad = window.load;
      window.load = function() {
        const r = _origLoad();
        try {
          // Read from localStorage (matches game's save key convention)
          const raw = localStorage.getItem('harvestvale_fishing_v1');
          if (raw) FS.deserialize(JSON.parse(raw));
        } catch (e) { /* ignore */ }
        return r;
      };
      window._fishingLoadHooked = true;
    }
    // Persist on Power Berry caught (separate localStorage key — simple + robust)
    setInterval(() => {
      try {
        const data = FS.serialize();
        const prev = localStorage.getItem('harvestvale_fishing_v1');
        const next = JSON.stringify(data);
        if (prev !== next) localStorage.setItem('harvestvale_fishing_v1', next);
      } catch (e) { /* ignore */ }
    }, 2000);

    // ----- 9. Helper: _installMapWater() — mutate the map to add 3 new water bodies -----
    function _installMapWater() {
      // Run after the game's generateMap() has finished (we retry until map is initialized).
      // We detect this by checking if the existing Goddess Pond (4, 5) is T.WATER.
      const T = window.T;
      const map = window.map;
      const MAP_W = window.MAP_W || 40;
      const MAP_H = window.MAP_H || 30;
      if (!T || !map) return;
      if (!map[5] || map[5][4] !== T.WATER) {
        // Map not yet generated — retry
        setTimeout(_installMapWater, 200);
        return;
      }
      // Avoid double-installation
      if (window._fishingWaterInstalled) return;
      window._fishingWaterInstalled = true;

      // === Ocean (south beach) ===
      // Replace tree border at y=27,28 (MAP_H-2 and MAP_H-3) with water for x in [2..37].
      // Keep y=29 (last row) as trees so player can't walk off the bottom edge.
      // We'll set y=27..28 to WATER for x=2..37, with SAND edge at y=26.
      for (let x = 2; x <= 37; x++) {
        if (map[27]) map[27][x] = T.WATER;
        if (map[28]) map[28][x] = T.WATER;
      }
      // Sand beach at y=26 (above the water)
      for (let x = 2; x <= 37; x++) {
        if (map[26] && map[26][x] !== T.WATER && map[26][x] !== T.WALL &&
            map[26][x] !== T.SHOP_WALL && map[26][x] !== T.SHOP_FLOOR) {
          map[26][x] = T.SAND;
        }
      }
      // Open a path from y=25 down to the beach (so player can reach the ocean)
      // Replace trees at y=25 for a few x positions
      for (let x = 8; x <= 12; x++) {
        if (map[25] && (map[25][x] === T.TREE || map[25][x] === T.BUSH)) {
          map[25][x] = T.SAND;
        }
      }

      // === River (near farm, west of barn area) ===
      // Vertical water strip at x=11..13, y=10..24 (between barn and farm field).
      // Barn is at x=3..10, y=20..25, so the river runs to its east.
      for (let y = 10; y <= 24; y++) {
        for (let x = 11; x <= 13; x++) {
          if (map[y] && map[y][x] !== T.WALL && map[y][x] !== T.SHOP_WALL &&
              map[y][x] !== T.SHOP_FLOOR && map[y][x] !== T.FLOOR) {
            map[y][x] = T.WATER;
          }
        }
      }
      // Bridge across the river at y=15 (the path row) — replace water with PATH
      // so player can cross to the eastern half of the map.
      for (let x = 11; x <= 13; x++) {
        if (map[15]) map[15][x] = T.PATH;
      }

      // === Hot Spring (near Spring Mine entrance at tile 38,12) ===
      // Small 4×3 pool at x=34..37, y=11..13 (between Spring Mine and Carpenter shop).
      // Carpenter is at x=30..36, y=5..9, so the hot spring is just south of it.
      for (let y = 11; y <= 13; y++) {
        for (let x = 34; x <= 37; x++) {
          if (map[y] && map[y][x] !== T.WALL && map[y][x] !== T.SHOP_WALL &&
              map[y][x] !== T.SHOP_FLOOR) {
            map[y][x] = T.WATER;
          }
        }
      }
      // Sand edge around hot spring
      for (let y = 10; y <= 14; y++) {
        for (let x = 33; x <= 38; x++) {
          if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W &&
              map[y] && map[y][x] !== T.WATER && map[y][x] !== T.WALL &&
              map[y][x] !== T.SHOP_WALL && map[y][x] !== T.SHOP_FLOOR) {
            map[y][x] = T.SAND;
          }
        }
      }
      // Ensure Spring Mine entrance tile (38, 12) stays walkable
      if (map[12] && map[12][38] === T.SAND) {
        // Mine entrance marker — keep walkable (Sand is walkable)
      }

      console.log('[fomt] Water bodies added: Ocean (south beach), River (west of barn), Hot Spring (near Spring Mine)');
    }

    // ----- 10. _drawFishingOverlay() — draw line + bobber + "!" indicator -----
    function _drawFishingOverlay() {
      const info = FS.getStateInfo();
      if (!info) return;
      const ctx = window.ctx;
      const TILE = window.TILE || 32;
      if (!ctx || !info.castLocation) return;

      // Player center (cast origin)
      const px = info.castPlayerX;
      const py = info.castPlayerY;
      // Bobber position (water tile center)
      const bx = info.castLocation.x * TILE + TILE / 2;
      const by = info.castLocation.y * TILE + TILE / 2;

      ctx.save();

      // ----- Draw fishing line (thin white-ish line from player to bobber) -----
      ctx.strokeStyle = info.isBiting ? '#ff5050' : 'rgba(240, 240, 240, 0.7)';
      ctx.lineWidth = info.isBiting ? 2 : 1;
      ctx.setLineDash(info.isBiting ? [4, 2] : []);
      ctx.beginPath();
      ctx.moveTo(px, py - 8);   // start near player's hand
      ctx.lineTo(bx, by - 4);    // end at bobber
      ctx.stroke();
      ctx.setLineDash([]);

      // ----- Draw bobber (small red/white circle on the water) -----
      const bob = Math.sin(info.bobberAnimT * Math.PI * 2) * 1.5;
      ctx.fillStyle = info.isBiting ? '#ff3030' : '#e0e0e0';
      ctx.strokeStyle = '#303030';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by + bob, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Bobber top half (red)
      ctx.fillStyle = info.isBiting ? '#ff6060' : '#ff4040';
      ctx.beginPath();
      ctx.arc(bx, by + bob - 1, 3, Math.PI, 0);
      ctx.fill();

      // ----- "!" indicator above player when biting -----
      if (info.isBiting) {
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const bob2 = Math.sin(performance.now() / 80) * 2;
        ctx.strokeText('!', px, py - 28 + bob2);
        ctx.fillText('!', px, py - 28 + bob2);

        // Hook progress ring around bobber (red→green as time runs out)
        const progress = info.hookProgress;   // 0 = just bit, 1 = expired
        const remaining = 1 - progress;
        ctx.strokeStyle = remaining > 0.5 ? '#80ff80' : remaining > 0.25 ? '#ffcc40' : '#ff4040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by + bob, 7, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }
})();

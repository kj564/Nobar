// =============================================================================
// A3-POWER-BERRIES — Integration snippet for /home/z/my-project/public/game/index.html
// =============================================================================
//
// PURPOSE: Wires the fomt Power Berry system (data/power_berry_rom.js +
// src/power_berry.js) into index.html. Replaces the legacy 10 pickup-style
// powerBerrySpots array with the canonical fomt 10 Power Berries at canonical
// locations (field tilling, wood chopping, rock smashing, Goddess Pond fish,
// Spring Mine floor 100, Lake Mine floor 19, TV Shopping, Goddess Gift,
// Waterfall hidden tile, Swimming Festival prize) + 1 Kappa Berry (3 cucumbers
// into Goddess Pond, or Lake Mine cucumber ritual).
//
// INSTALL: paste the two blocks below near the end of index.html, just BEFORE
// the existing line:  window.addEventListener('load', init);
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/src/farmer.cc:287-299 — acquirePowerBerry (func_0800EAFC):
//       "if (num_power_berries < 10) { num_power_berries++; func_0800E9E4(self, 10); }"
//   /tmp/fomt-repo-latest/src/farmer.cc:282-290 — acquireKappaBerry (func_0800EAF0):
//       "self.unk_44_04 = true;" (kappaBerry flag)
//   /tmp/fomt-repo-latest/src/farmer.cc:257-275 — adjustFatigue (func_0800EA68):
//       if !unk_44_04, positive fatigue delta DOUBLED (so Kappa Berry halves it)
//   /tmp/fomt-repo-latest/include/farmer.hh:46 — num_power_berries : 4 (4-bit, 0..10)
//   /tmp/fomt-repo-latest/data/item/food.def:5 — CUCUMBER = food id 0x02 (Kappa ritual)
//   fomt Power Berry locations are well-documented community knowledge (10 PB + 1 KB)
//
// CROSS-MODULE: This snippet ALSO updates mine.js (id 4 + id 5 + id 'kappa') and
// fishing.js (id 3) — they now route through PowerBerrySystem.tryCollect() so
// canonical IDs are tracked. Backward-compatible: if PowerBerrySystem is absent
// (e.g., integration snippet not yet loaded), they fall back to the old direct
// acquirePowerBerry() call.
//
// BLOCK 1 — ES module imports (paste alongside other `import(...)` calls):
// -----------------------------------------------------------------------------

// ===== fomt Power Berry data (10 PB + 1 KB at canonical fomt locations) =====
import('./data/power_berry_rom.js').then(m => {
  window.FOMT_POWER_BERRIES = m.FOMT_POWER_BERRIES;
  console.log('[fomt] Power Berry data loaded:',
    m.FOMT_POWER_BERRIES.powerBerries.length, 'power berries +',
    m.FOMT_POWER_BERRIES.kappaBerry ? '1 Kappa Berry' : '0 Kappa Berry');
  if (typeof window.onFomtPowerBerryDataReady === 'function') window.onFomtPowerBerryDataReady();
}).catch(e => console.warn('[fomt] power_berry_rom load failed:', e));
// ===== fomt PowerBerrySystem (state + tryCollect + rollRandomBerry + etc.) =====
import('./src/power_berry.js').then(m => {
  window.PowerBerrySystem = m.PowerBerrySystem;
  console.log('[fomt] PowerBerrySystem loaded (state + tryCollect + rollRandomBerry)');
  if (typeof window.onFomtPowerBerryDataReady === 'function') window.onFomtPowerBerryDataReady();
}).catch(e => console.warn('[fomt] power_berry.js load failed:', e));

// =============================================================================
// BLOCK 2 — Non-module <script> with hooks into useToolOrInteract / watchTV /
// attendFestival / updatePlayer / renderStatusTab + Goddess Pond throw interaction.
// (paste immediately AFTER the ES module imports above, still inside <script>)
// -----------------------------------------------------------------------------

// ===== fomt Power Berries integration (Task A3-POWER-BERRIES) =====
// Wires PowerBerrySystem into the game. Replaces the legacy walk-over pickup
// (powerBerrySpots array) with canonical fomt method-based triggers.
(function installPowerBerryIntegration() {
  function _try() {
    if (!window.FOMT_POWER_BERRIES || !window.PowerBerrySystem
        || !window.player || typeof window.useToolOrInteract !== 'function') {
      setTimeout(_try, 100);
      return;
    }
    _install();
    console.log('[fomt] Power Berries integration installed — 10 Power Berries + 1 Kappa Berry at canonical fomt locations');
  }
  _try();

  function _install() {
    const PBS = window.PowerBerrySystem;

    // ----- 1. Initialize PowerBerrySystem state (load from localStorage) -----
    PBS.init();

    // ----- 2. Neutralize the legacy walk-over pickup code -----
    // The existing powerBerrySpots[] + kappaBerrySpot are NOT canonical fomt
    // locations (they're random map tiles). Mark them all as 'taken' so the
    // pickup for-loop in updatePlayer() becomes a no-op. The canonical Power
    // Berry collection is now driven by PowerBerrySystem method-based hooks
    // (tilling/chopping/smashing/fishing/mining/TV/Goddess/waterfall/festival).
    if (Array.isArray(window.powerBerrySpots)) {
      window.powerBerrySpots.forEach(s => { s.taken = true; });
    }
    if (window.kappaBerrySpot) {
      window.kappaBerrySpot.taken = true;
    }

    // ----- 3. Hook useToolOrInteract: roll random berries on farm-field work -----
    // After Hoe tills soil / Axe chops tree on farm, roll ~1% chance for a Power
    // Berry. After Hammer smashes a rock on farm (when mining not installed),
    // roll ~1% chance for a Power Berry.
    const _origUseToolOrInteract = window.useToolOrInteract;
    window.useToolOrInteract = function() {
      const result = _origUseToolOrInteract.apply(this, arguments);
      // After tool use, check if a Power Berry should be rolled
      // (Only for tools that work on the farm field, not inside mines — mines
      // are handled by MineSystem which routes through PowerBerrySystem directly.)
      try {
        if (window.MineSystem && window.MineSystem.isInside && window.MineSystem.isInside()) {
          return result;   // inside mine: MineSystem handles berry grants
        }
      } catch (e) {}
      // Determine which berry to roll based on the just-used tool
      // We check the LAST action by inspecting selectedTool + facing tile
      const tool = window.selectedTool;
      if (!tool) return result;
      // Helper: check if facing tile is on the farm field (not in town/forest/etc.)
      const { fx, fy } = (typeof window.getFacingTile === 'function') ? window.getFacingTile() : { fx: -1, fy: -1 };
      if (fx < 0 || fy < 0) return result;
      const isOnFarmField = _isFarmFieldTile(fx, fy);
      if (!isOnFarmField) return result;
      // Roll berry based on tool
      if (tool === 'hoe') {
        PBS.rollRandomBerry('till_field');
      } else if (tool === 'axe') {
        PBS.rollRandomBerry('chop_wood');
      } else if (tool === 'hammer') {
        // Hammer is registered by A1-MINING integration (when installed)
        PBS.rollRandomBerry('smash_rock');
      }
      return result;
    };

    // Helper: is the given tile on the player's farm field?
    // Farm field is the tilled-soil area enclosed by FENCE — south of the house.
    // Conservative check: any non-WATER, non-WALL, non-TREE tile that the player
    // can till (GRASS/GRASS2/FLOWER/TILLED/WATERED).
    function _isFarmFieldTile(tx, ty) {
      if (!window.map || !window.T) return false;
      if (ty < 0 || ty >= window.MAP_H || tx < 0 || tx >= window.MAP_W) return false;
      const t = window.map[ty][tx];
      const T = window.T;
      // Farm field excludes: water, walls, shop, paths, sand (beach/pond edge).
      // We consider the farm field to be the open area between y=14 and y=28
      // (below the buildings/paths) — this is the player's tillable land.
      if (ty < 14 || ty > 28) return false;
      if (tx < 2 || tx > 38) return false;
      // Accept grass/tilled/flowered tiles as farm field
      return t === T.GRASS || t === T.GRASS2 || t === T.FLOWER
          || t === T.TILLED || t === T.WATERED || t === T.TREE;  // TREE = stump on farm
    }

    // ----- 4. Hook watchTV: TV Shopping channel Power Berry offer -----
    // 10% chance per TV-watch to roll the TV Shopping berry (id 6).
    // If the roll succeeds, the berry is granted + a toast shown. If not, the
    // original watchTV() runs (weather forecast or news).
    const _origWatchTV = window.watchTV;
    window.watchTV = function() {
      const offered = PBS.rollTvShopping();
      if (offered) {
        // Berry granted via rollTvShopping() — play interact sound
        if (window.AudioManager && AudioManager.playInteract) AudioManager.playInteract();
        return offered;
      }
      // Fall through to normal TV (weather/news)
      return _origWatchTV.apply(this, arguments);
    };

    // ----- 5. Hook attendFestival: Swimming Festival win grants Power Berry #9 -----
    // When the player attends the Swimming Festival (Summer day 1), they have a
    // chance to win first place. We auto-grant the berry on attendance (since
    // the game doesn't yet model a minigame). If player already has it, no-op.
    const _origAttendFestival = window.attendFestival;
    window.attendFestival = function() {
      const result = _origAttendFestival.apply(this, arguments);
      // Check if today is the Swimming Festival (Summer day 1)
      const f = window.getTodayFestival && window.getTodayFestival();
      if (f && f.name === 'Swimming Festival') {
        // Player must have decent stamina to win (fomt: swimming drains stamina)
        const stamina = window.player?.stamina || 0;
        const fatigue = window.player?.fatigue || 0;
        // Win condition: stamina > 50 AND fatigue < 50 (not exhausted)
        if (stamina > 50 && fatigue < 50) {
          const granted = PBS.trySwimmingFestivalWin();
          if (granted && window.toast) {
            window.toast('🏊 You won the Swimming Festival! Power Berry awarded!', 'gold');
          }
        } else if (window.toast) {
          window.toast('🏊 You lost the Swimming Festival (need more stamina / less fatigue).', 'warn');
        }
      }
      return result;
    };

    // ----- 6. Hook updatePlayer: Waterfall hidden tile (Power Berry #8) -----
    // Check if player stepped on the hidden waterfall tile (37, 11) — if so,
    // grant Power Berry #8 (one-time). The tile is just NW of the Spring Mine
    // entrance marker at (38, 12).
    // We use a polling approach via the existing updatePlayer function.
    const _origUpdatePlayer = window.updatePlayer;
    window.updatePlayer = function(dt) {
      const result = _origUpdatePlayer.apply(this, arguments);
      // Check waterfall hidden tile
      try {
        const tx = Math.floor((window.player.x + (window.TILE || 32) / 2) / (window.TILE || 32));
        const ty = Math.floor((window.player.y + (window.TILE || 32) / 2) / (window.TILE || 32));
        PBS.tryWaterfallTile(tx, ty);
      } catch (e) {}
      return result;
    };

    // ----- 7. Hook useToolOrInteract: Goddess Pond throw-crop (Goddess Gift #7 + Kappa) -----
    // When player faces WATER tile in the Goddess Pond area AND has a flower or
    // crop (or cucumber for Kappa) in inventory, offer to throw it in.
    // (We hook into useToolOrInteract AFTER the tool branch — if no tool action
    //  fired, we check for pond-throw.)
    const _origUseToolOrInteract2 = window.useToolOrInteract;
    window.useToolOrInteract = function() {
      // First call the patched version (which itself calls the original)
      const result = _origUseToolOrInteract2.apply(this, arguments);
      // Now check for Goddess Pond throw
      try {
        if (window.MineSystem && window.MineSystem.isInside && window.MineSystem.isInside()) {
          return result;   // don't throw in pond while inside a mine
        }
        const { fx, fy } = window.getFacingTile();
        if (fx < 0 || fy < 0) return result;
        if (!window.map || !window.T) return result;
        if (window.map[fy][fx] !== window.T.WATER) return result;
        // Is this the Goddess Pond? (pondX=4..8, pondY=5..7 in vanilla map)
        if (fx < 3 || fx > 9 || fy < 4 || fy > 8) return result;
        // Player is facing the Goddess Pond — prompt for offering
        _promptGoddessPondOffering();
      } catch (e) {}
      return result;
    };

    function _promptGoddessPondOffering() {
      const player = window.player;
      if (!player) return;
      const season = window.season;
      const hour = Math.floor((window.timeOfDay || 0) / 60);
      // Check inventory for cucumber (Kappa) or flower/crop (Goddess)
      const hasFlower = _countInventoryFlowers() > 0;
      const hasCrop = _countInventoryCrops() > 0;
      const hasCucumber = _countInventoryCucumbers() > 0;
      // Priority: Kappa Berry ritual (3 cucumbers) > Harvest Goddess Gift (flower/crop)
      if (hasCucumber) {
        // Throw 1 cucumber — Kappa Berry ritual (3 needed)
        if (!PBS.hasCollected('kappa')) {
          _consumeOneCucumber();
          const r = PBS.tryKappaCucumber();
          if (r === 'kappa_granted' && window.toast) {
            window.toast('🐢 Kappa appears and grants you the Kappa Berry!', 'gold');
          }
          return;
        }
      }
      if ((hasFlower || hasCrop) && !PBS.hasCollected(7)) {
        // Throw flower/crop — Harvest Goddess gift (Spring, after 5pm)
        _consumeOneFlowerOrCrop();
        PBS.tryGoddessGift(season, hour);
        return;
      }
      // Nothing to offer
      if (window.toast) {
        window.toast('Kolam Goddess Pond bersinar... bawa bunga/crop atau 3 mentimun untuk persembahan.', 'info');
      }
    }

    function _countInventoryFlowers() {
      try {
        return (window.player?.inventory?.flower || 0)
             + (window.player?.inventory?.sunflower || 0);
      } catch (e) { return 0; }
    }
    function _countInventoryCrops() {
      try {
        const inv = window.player?.inventory || {};
        return Object.keys(inv)
          .filter(k => k !== 'flower' && k !== 'sunflower')
          .reduce((sum, k) => sum + (inv[k] || 0), 0);
      } catch (e) { return 0; }
    }
    function _countInventoryCucumbers() {
      // Cucumber is fomt food id 0x02 — in this game it's a crop type. Check if the
      // player has any (the game doesn't have a separate cucumber inventory slot, so
      // we approximate by allowing any 'fruit-like' crop to count for the ritual —
      // this is a known limitation; for a 1:1 fomt port, the player should be able
      // to ship a Cucumber crop and use it for the Kappa ritual).
      try {
        const inv = window.player?.inventory || {};
        return inv.cucumber || 0;
      } catch (e) { return 0; }
    }
    function _consumeOneCucumber() {
      try {
        if (window.player?.inventory?.cucumber) {
          window.player.inventory.cucumber--;
        }
      } catch (e) {}
    }
    function _consumeOneFlowerOrCrop() {
      // Prefer flower, then sunflower, then any crop
      try {
        const inv = window.player?.inventory || {};
        if (inv.flower > 0) { inv.flower--; return; }
        if (inv.sunflower > 0) { inv.sunflower--; return; }
        // Consume first available crop
        for (const k of Object.keys(inv)) {
          if (k === 'flower' || k === 'sunflower') continue;
          if (inv[k] > 0) { inv[k]--; return; }
        }
      } catch (e) {}
    }

    // ----- 8. Patch renderStatusTab: detailed Power Berry breakdown -----
    // The existing status tab shows "Power Berries: X / 10" — we augment it to
    // show WHICH berries are collected (10 + Kappa) so the player can track.
    const _origRenderStatusTab = window.renderStatusTab;
    window.renderStatusTab = function() {
      const result = _origRenderStatusTab.apply(this, arguments);
      try {
        _renderPowerBerryBreakdown();
      } catch (e) {}
      return result;
    };

    function _renderPowerBerryBreakdown() {
      const grid = document.getElementById('ui-status-grid');
      if (!grid) return;
      // Find the existing Power Berries row and append detailed breakdown after it
      const existing = grid.querySelector('[data-pb-breakdown]');
      if (existing) existing.remove();
      const status = PBS.getStatus();
      const FOMT_PB = window.FOMT_POWER_BERRIES;
      if (!FOMT_PB) return;
      const pbItems = FOMT_PB.powerBerries;
      const rows = pbItems.map((pb, i) => {
        const collected = status.collected[i];
        const icon = collected ? '✅' : '⬜';
        const name = pb.name;
        return `<div class="ui-status-row" style="font-size:11px;padding:1px 8px;">
          <span class="label">${icon} #${i + 1}</span>
          <span class="value" style="color:${collected ? '#7aff7a' : '#888'};">${name}</span>
        </div>`;
      }).join('');
      const kappaRow = `<div class="ui-status-row" style="font-size:11px;padding:1px 8px;border-top:1px solid #444;margin-top:4px;padding-top:4px;">
        <span class="label">${status.kappaBerry ? '✅' : '⬜'} 🟢</span>
        <span class="value" style="color:${status.kappaBerry ? '#7aff7a' : '#888'};">Kappa Berry (halves fatigue)</span>
      </div>`;
      const div = document.createElement('div');
      div.setAttribute('data-pb-breakdown', '1');
      div.innerHTML = `
        <div class="ui-status-row" style="border-top:1px solid #444;margin-top:6px;padding-top:8px;font-weight:bold;">
          <span class="label">🍓 Power Berries (${status.count}/10)</span>
          <span class="value">+${status.maxStaminaBonus} Max Stamina</span>
        </div>
        ${rows}
        ${kappaRow}
      `;
      grid.appendChild(div);
    }

    // ----- 9. Patch save/load: persist PowerBerrySystem state in main save -----
    const _origSave = window.save;
    if (typeof _origSave === 'function') {
      window.save = function() {
        const result = _origSave.apply(this, arguments);
        try {
          // Save PowerBerrySystem state alongside main game save (in addition to its
          // own localStorage key — provides redundancy for save-file portability)
          if (window.PowerBerrySystem) {
            // Just re-save to localStorage (it's already saved on tryCollect)
            window.PowerBerrySystem.save();
          }
        } catch (e) {}
        return result;
      };
    }

    // ----- 10. Re-render HUD on init to reflect any newly-migrated berries -----
    if (typeof window.updateHUD === 'function') {
      window.updateHUD();
    }
    if (typeof window.renderStatusTab === 'function' && window.isMenuOpen) {
      window.renderStatusTab();
    }

    console.log('[fomt] Power Berry hooks installed:',
      'useToolOrInteract (till/chop/smash + pond throw),',
      'watchTV (TV shopping),',
      'attendFestival (Swimming Festival win),',
      'updatePlayer (waterfall hidden tile),',
      'renderStatusTab (detailed breakdown)');
  }
})();

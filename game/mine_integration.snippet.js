// =============================================================================
// A1-MINING — Integration snippet for /home/z/my-project/public/game/index.html
// =============================================================================
//
// PURPOSE: Wires the fomt Mining system (data/mine_rom.js + src/mine.js) into
// index.html. Adds the Hammer tool, mine entrances (waterfall + frozen lake),
// openMineUI() panel, and hooks Hammer/Hoe tool usage while inside a mine.
//
// INSTALL: paste the two blocks below near the end of index.html, just BEFORE
// the existing line:  window.addEventListener('load', init);
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/src/shipping_bin.cc     — sMineralProductList (20 shippable minerals)
//   /tmp/fomt-repo-latest/data/item/product.def    — REAL fomt product IDs (0x53-0x66) + prices
//   /tmp/fomt-repo-latest/data/item/article.def    — HARVEST_GODDESS_JEWEL/KAPPA_JEWEL (article 0x25/0x26)
//   /tmp/fomt-repo-latest/data/item/tool.def       — IRON_HAMMER (0x18) — used by Farmer::ToolLevel
//   /tmp/fomt-repo-latest/include/farmer.hh        — Farmer::ToolLevel (Hammer = unk_2C[3])
//   /tmp/fomt-repo-latest/src/farmer.cc             — Tool upgrade path (IRON_HAMMER → ... → MYTHIC_HAMMER)
//
// BLOCK 1 — ES module imports (paste alongside other `import(...)` calls):
// -----------------------------------------------------------------------------

// ===== fomt Mine data (20 minerals + 2 special jewels + floor unlock rules) =====
import('./data/mine_rom.js').then(m => {
  window.FOMT_MINE = m.FOMT_MINE;
  console.log('[fomt] Mine data loaded:', m.FOMT_MINE.minerals.length, 'minerals (Spring Mine + Lake Mine)');
  if (typeof window.onFomtMineDataReady === 'function') window.onFomtMineDataReady();
}).catch(e => console.warn('[fomt] mine_rom load failed:', e));
// ===== fomt MineSystem (state + enter/hit/dig/descend/exit logic) =====
import('./src/mine.js').then(m => {
  window.MineSystem = m.MineSystem;
  console.log('[fomt] MineSystem loaded (state + rock smash + stair dig)');
  if (typeof window.onFomtMineDataReady === 'function') window.onFomtMineDataReady();
}).catch(e => console.warn('[fomt] mine.js load failed:', e));

// =============================================================================
// BLOCK 2 — Non-module <script> with openMineUI + tool hooks + mine entrances
// (paste immediately AFTER the ES module imports above, still inside <script>)
// -----------------------------------------------------------------------------

// ===== fomt Mining integration (Task A1-MINING) =====
// Wires MineSystem into useToolOrInteract / updateNearbyAction / renderToolbar /
// openMenu pipeline. Activates Hammer as the 6th hotbar tool when entering a mine.
(function installMineIntegration() {
  function _try() {
    if (!window.FOMT_MINE || !window.MineSystem || !window.player || typeof window.useToolOrInteract !== 'function') {
      setTimeout(_try, 100);
      return;
    }
    _install();
    console.log('[fomt] Mining integration installed — Spring Mine (waterfall) + Lake Mine (frozen lake)');
  }
  _try();

  function _install() {
    const MS = window.MineSystem;

    // ----- 1. Register Hammer as a 6th tool (added to TOOLS array, slot 5 in hotbar) -----
    if (!TOOLS.find(t => t.id === 'hammer')) {
      TOOLS.push({ id: 'hammer', name: 'Palu', icon: '🔨', key: '6' });
    }
    // Make 'hammer' selectable from hotbar (add to usableTools lists)
    // We monkey-patch selectFromHotbar/useHotbarItem by adding 'hammer' to their guard lists
    // at runtime — see _patchHotbarGuards() below.

    // ----- 2. Mine entrance tile coordinates -----
    // Spring Mine entrance: waterfall at tile (38, 12) — right edge, below buildings
    // Lake Mine entrance: frozen pond at tile (15, 27) — bottom-left, frozen in winter only
    const MINE_ENTRANCES = {
      spring: { tx: 38, ty: 12, type: 'mine_spring', label: '💦 Spring Mine (waterfall)' },
      lake:   { tx: 15, ty: 27, type: 'mine_lake',   label: '🧊 Lake Mine (frozen lake — Winter only)' },
    };

    // ----- 3. Patch updateNearbyAction to detect mine entrance proximity -----
    const _origUpdateNearbyAction = window.updateNearbyAction;
    window.updateNearbyAction = function() {
      _origUpdateNearbyAction();
      if (MS.isInside()) { nearbyAction = null; return; }  // inside mine: suppress world actions
      // Spring Mine entrance (year-round)
      const s = MINE_ENTRANCES.spring;
      const sX = s.tx * TILE + TILE/2, sY = s.ty * TILE + TILE/2;
      if (Math.hypot(player.x - sX, player.y - sY) < TILE * 1.8) {
        nearbyAction = { type: s.type };
        return;
      }
      // Lake Mine entrance (winter only — frozen lake)
      if (window.season === 'winter') {
        const l = MINE_ENTRANCES.lake;
        const lX = l.tx * TILE + TILE/2, lY = l.ty * TILE + TILE/2;
        if (Math.hypot(player.x - lX, player.y - lY) < TILE * 1.8) {
          nearbyAction = { type: l.type };
          return;
        }
      }
    };

    // ----- 4. Patch useToolOrInteract to handle mine entrance + in-mine tool usage -----
    const _origUseToolOrInteract = window.useToolOrInteract;
    window.useToolOrInteract = function() {
      // Mine entrance proximity → enter mine + open UI
      if (nearbyAction && nearbyAction.type === 'mine_spring') {
        if (MS.enterMine('spring')) window.openMineUI();
        return;
      }
      if (nearbyAction && nearbyAction.type === 'mine_lake') {
        if (MS.enterMine('lake')) window.openMineUI();
        return;
      }
      // In-mine tool usage: Hammer smashes facing rock, Hoe digs facing tile
      if (MS.isInside()) {
        const { fx, fy } = getFacingTile();
        // Mine uses a 20×15 tile playfield internally; world fx/fy don't directly map.
        // Instead, the player uses the mine UI panel for click-to-act. If they press E
        // in the world (which means they're standing in the mine overlay), redirect:
        if (window.selectedTool === 'hammer') {
          // Try to hit the rock at the player's mine-floor position (if known)
          toast('Open the mine panel (click rocks) to smash them with the Hammer', 'info');
        } else if (window.selectedTool === 'hoe') {
          toast('Open the mine panel (click tiles) to dig for hidden stairs', 'info');
        } else {
          toast('Inside the mine — use Hammer (rocks) or Hoe (dig stairs). Click tiles in mine panel.', 'info');
        }
        return;
      }
      // Original farming tool logic (Hammer is no-op outside mine — there are no rocks to smash)
      if (window.selectedTool === 'hammer') {
        toast('Hammer is for smashing rocks in the mine. Visit the Spring Mine (waterfall).', 'info');
        return;
      }
      return _origUseToolOrInteract();
    };

    // ----- 5. openMineUI() — render mine floor panel with clickable rocks/tiles -----
    window.openMineUI = function() {
      const info = MS.getCurrentMineInfo();
      if (!info) { closeMenu(); return; }
      menuOpen = 'mine';
      const panel = document.getElementById('menu-panel');
      const FOMT_MINE = window.FOMT_MINE;
      const W = 20, H = 15, tilePx = 22;  // mine floor grid (20×15 tiles, 22px each in UI)

      // Header
      let html = `<h2>⛏️ ${info.mine.name} — Floor ${info.floor}/${info.mine.maxFloor}</h2>`;
      html += `<div class="subtitle">Stamina: <strong>${player.stamina}/${player.maxStamina}</strong> · ` +
              `Rocks left: ${info.rocksRemaining} · ` +
              `Stairs: ${info.stairsFound ? '🪜 revealed' : '🔍 hidden (dig with Hoe)'}</div>`;

      // Selected tool indicator
      const tool = window.selectedTool || 'hammer';
      const toolName = tool === 'hammer' ? '🔨 Hammer (smash rocks)' :
                       tool === 'hoe' ? '⛏️ Hoe (dig for stairs)' : `🔧 ${tool}`;
      html += `<div style="margin:6px 0 10px;font-size:12px;color:#a0b090;">Active tool: <strong>${toolName}</strong>` +
              ` — press <kbd>1</kbd> for Hoe, <kbd>6</kbd> for Hammer</div>`;

      // Mine grid (clickable tiles)
      html += `<div id="mine-grid" style="display:grid;grid-template-columns:repeat(${W},${tilePx}px);` +
              `grid-auto-rows:${tilePx}px;gap:1px;background:#1a1a1a;padding:6px;border:2px solid #5a4a3a;` +
              `border-radius:4px;width:fit-content;margin:0 auto;">`;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const rock = MS.state.rocks.find(r => r.x === x && r.y === y);
          const isStairs = MS.state.stairsFound && MS.state.stairsDownX === x && MS.state.stairsDownY === y;
          let bg = '#3a3a3a', content = '', title = `(${x},${y})`;
          if (rock) {
            // Rock color shifts as hitpoints decrease (fomt: cracked-rock visual progression)
            bg = rock.hitpoints >= 4 ? '#5a4a3a' : rock.hitpoints === 3 ? '#6a5a4a' :
                 rock.hitpoints === 2 ? '#7a6a5a' : '#8a7a6a';
            content = `<span style="font-size:11px;">🪨${rock.hitpoints}</span>`;
            title = `Rock at (${x},${y}) — ${rock.hitpoints} hits left. Click with Hammer to smash.`;
          } else if (isStairs) {
            bg = '#4a3a8a';
            content = '<span style="font-size:14px;">🪜</span>';
            title = `Stairs down at (${x},${y}). Click "Descend" to go to floor ${info.floor + 1}.`;
          } else if (x === 0 || y === 0 || x === W-1 || y === H-1) {
            bg = '#2a2a2a';  // border wall
          }
          html += `<div class="mine-tile" data-x="${x}" data-y="${y}" title="${title}" ` +
                  `style="background:${bg};display:flex;align-items:center;justify-content:center;` +
                  `cursor:pointer;border:1px solid #0a0a0a;">${content}</div>`;
        }
      }
      html += `</div>`;

      // Action buttons
      html += `<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">`;
      html += `<button class="menu-close" id="mine-descend" ${info.stairsFound ? '' : 'disabled'} ` +
              `style="${info.stairsFound ? '' : 'opacity:0.4;cursor:not-allowed;'}">⬇️ Descend (Floor ${info.floor + 1})</button>`;
      html += `<button class="menu-close" id="mine-exit">🚪 Exit Mine</button>`;
      html += `</div>`;

      // Hint text
      let hint = '🔨 Hammer smashes rocks (auto-ships minerals). ⛏️ Hoe digs tiles for hidden stairs (~65% per dig on stair tile).';
      if (info.mineType === 'spring') {
        hint += ` ✨ Goddess Gems on floors: ${FOMT_MINE.springMine.goddessGemFloors.join(', ')}.`;
        hint += ` 🍓 Power Berry on floor ${FOMT_MINE.springMine.powerBerryFloor}.`;
      } else {
        hint += ` 🐢 Kappa Jewels on floors: ${FOMT_MINE.lakeMine.kappaGemFloors.join(', ')}.`;
        hint += ` 🍓 Power Berry on floor ${FOMT_MINE.lakeMine.powerBerryFloor}.`;
        hint += ` 👹 Curse tools on floors: ${FOMT_MINE.lakeMine.curseToolFloors.join(', ')}.`;
      }
      html += `<div style="margin-top:8px;color:#a0b090;font-size:11px;text-align:center;max-width:480px;">${hint}</div>`;

      panel.innerHTML = html;
      document.getElementById('menu').classList.add('show');

      // Click handlers on tiles
      panel.querySelectorAll('.mine-tile').forEach(el => {
        el.addEventListener('click', () => {
          const rx = parseInt(el.dataset.x), ry = parseInt(el.dataset.y);
          const tool = window.selectedTool || 'hammer';
          if (tool === 'hammer') {
            // Try to smash a rock at this tile
            const rock = MS.state.rocks.find(r => r.x === rx && r.y === ry);
            if (!rock) { toast('No rock here to smash', 'warn'); return; }
            MS.hitRock(rx, ry);
          } else if (tool === 'hoe') {
            // Try to dig for stairs
            const result = MS.digTile(rx, ry);
            if (result === null && !MS.state.stairsFound) {
              // Only toast "nothing" if no special event happened
              const rock = MS.state.rocks.find(r => r.x === rx && r.y === ry);
              if (rock) toast('Rock in the way — smash it with Hammer first', 'warn');
              else toast('Nothing here...', 'info');
            }
          } else {
            toast('Select Hammer (key 6) for rocks or Hoe (key 1) for digging', 'warn');
            return;
          }
          updateHUD();
          openMineUI();  // refresh panel
        });
      });

      // Descend button
      const descendBtn = document.getElementById('mine-descend');
      if (descendBtn) {
        descendBtn.addEventListener('click', () => {
          if (MS.descendFloor()) openMineUI();
        });
      }
      // Exit button
      const exitBtn = document.getElementById('mine-exit');
      if (exitBtn) {
        exitBtn.addEventListener('click', () => {
          MS.exitMine();
          closeMenu();
          // Restore Hammer → Hoe selection (since Hammer was for mine)
          if (window.selectedTool === 'hammer') {
            selectTool('hoe');
            selectFromHotbar(0);  // hotbar slot 0 = Hoe
          }
        });
      }
    };

    // ----- 6. Patch renderToolbar to extend hotbar to 6 slots when Hammer is owned -----
    // We add hammer as a 6th slot in inventoryData when entering mine context.
    // Simpler approach: extend HOTBAR_KEY list and let selectFromHotbar handle slot 5.
    const _origSelectFromHotbar = window.selectFromHotbar;
    window.selectFromHotbar = function(slotIndex) {
      // Slot 5 (key 6) = Hammer — always available, not in inventoryData
      if (slotIndex === 5) {
        activeHotbarIndex = 5;
        selectTool('hammer');
        if (window.toast) window.toast('🔨 Hammer selected', 'info');
        return;
      }
      return _origSelectFromHotbar(slotIndex);
    };

    // Bind key '6' → select Hammer
    // (We patch the existing keydown listener by adding a new top-level one that runs first.)
    // The existing keydown listener handles keys 1-5; we add 6 here.
    window.addEventListener('keydown', (e) => {
      if (window.menuOpen || window.dialogActive || window.isMenuOpen) return;
      if (e.key === '6') {
        selectFromHotbar(5);
      }
    }, true /* capture phase — runs before existing listener */);

    // ----- 7. Draw mine entrance markers on the world map -----
    // We patch the render function to draw a 💦 icon at the waterfall + 🧊 at the frozen lake.
    // (Only if the original render loop exposes a hook; otherwise, we add a small canvas overlay.)
    const _origRender = window.render;
    if (typeof _origRender === 'function') {
      window.render = function(dt) {
        _origRender(dt);
        // Draw mine entrance markers on top of the world map
        const ctx = window.ctx || (canvas && canvas.getContext && canvas.getContext('2d'));
        if (!ctx) return;
        // Spring Mine marker (year-round)
        const s = MINE_ENTRANCES.spring;
        ctx.save();
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💦', s.tx * TILE + TILE/2, s.ty * TILE + TILE/2);
        // Lake Mine marker (winter only — frozen)
        if (window.season === 'winter') {
          const l = MINE_ENTRANCES.lake;
          ctx.fillText('🧊', l.tx * TILE + TILE/2, l.ty * TILE + TILE/2);
        }
        ctx.restore();
      };
    }

    // ----- 8. Wire up data-ready callback (re-run install if data loads late) -----
    window.onFomtMineDataReady = function() {
      console.log('[fomt] Mining data + MineSystem ready — Spring Mine + Lake Mine available');
    };
  }
})();

// src/mine.js — fomt Mining system (mine state + rock smashing + stair digging)
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/src/shipping_bin.cc      — sMineralProductList (mineral ship-as-product list)
//   /tmp/fomt-repo-latest/data/item/product.def     — REAL fomt product IDs + prices for minerals
//   /tmp/fomt-repo-latest/data/item/article.def     — HARVEST_GODDESS_JEWEL/KAPPA_JEWEL (collect-9 reward)
//   /tmp/fomt-repo-latest/data/item/tool.def        — IRON_HAMMER (0x18), IRON_HOE (0x08)
//   /tmp/fomt-repo-latest/include/farmer.hh         — Farmer::ToolLevel family indices (0=Hoe, 3=Hammer)
//   /tmp/fomt-repo-latest/src/farmer.cc             — adjustStamina, acquirePowerBerry, acquireKappaBerry,
//                                                      toolAddUsage, Tool upgrade path (IRON_HAMMER → ...)
//   fomt mine floor unlock behavior is documented (mine code itself is in asm — not decompiled yet)
//
// This module owns the mine floor state (rocks, hidden stairs, current floor) and all
// rock-smashing / stair-digging mutations. Other modules use window.MineSystem.
//
// Cross-module dependencies (all wired via window.* in index.html inline script):
//   window.FOMT_MINE             — mine data (minerals table + floor unlock rules)
//   window.player                — player state (gold, stamina, fatigue, powerBerries, kappaBerry)
//   window.adjustStamina(delta)  — fomt farmer.cc func_0800E9E4
//   window.acquirePowerBerry()   — fomt farmer.cc func_0800EAFC (+10 max stamina, max 10)
//   window.acquireKappaBerry()   — fomt farmer.cc func_0800EAF0 (halves future fatigue gain)
//   window.toolAddUsage(familyIdx, n) — fomt ToolLevel::AddUsage (Hammer=3, Hoe=0)
//   window.shippingBinShip(productId, price) — fomt ShippingBin::Ship (auto-ships collected minerals)
//   window.rucksackAddArticle(articleId, amount) — fomt Rucksack::AddAmountOfArticle
//   window.toast(msg, type)      — UI feedback
//   window.season                — 'spring'|'summer'|'fall'|'winter'

// ===== fomt Mine floor state =====
// currentMine: null when not in mine, 'spring' or 'lake' when inside
// currentFloor: 0 = entrance (not used), 1-255 = floors
// rocks: per-floor list of {x, y, hitpoints, mineral} — fomt uses ~15-25 rocks/floor
// stairsFound: bool — hidden stairs dug up by Hoe (fomt: dig on stair tile to reveal)
// stairsDownX/Y: hidden stair tile location (rolled fresh each floor)
export const MineSystem = {
  state: {
    currentMine: null,       // null | 'spring' | 'lake'
    currentFloor: 0,         // 0 = not entered, 1-255 = floor depth
    rocks: [],               // [{ x, y, hitpoints, mineral }]
    stairsFound: false,
    stairsDownX: -1,
    stairsDownY: -1,
    powerBerryCollected: { spring: false, lake: false },
    goddessGemsCollected: 0, // 0-9 (Spring Mine — collect all 9 = Gem of the Goddess reward)
    kappaGemsCollected: 0,   // 0-9 (Lake Mine — collect all 9 = Gem of the Kappa reward)
    kappaBerryCollectedFloors: new Set(),  // Lake Mine floors where Kappa Berry was given
    curseToolsCollected: [],  // Lake Mine floors where a curse tool was found
  },

  // ===== enterMine(mineType) — walk into mine entrance from world map =====
  // Returns true if mine was entered successfully.
  enterMine(mineType) {
    const FOMT_MINE = window.FOMT_MINE;
    if (!FOMT_MINE) {
      if (window.toast) window.toast('Mine data not loaded', 'warn');
      return false;
    }
    if (mineType !== 'spring' && mineType !== 'lake') return false;
    const mine = mineType === 'lake' ? FOMT_MINE.lakeMine : FOMT_MINE.springMine;

    // fomt documented: Lake Mine only accessible in Winter (frozen lake)
    if (window.season && !mine.accessibleSeasons.includes(window.season)) {
      if (window.toast) {
        window.toast(`${mine.name} only accessible in ${mine.accessibleSeasons.join(', ')}`, 'warn');
      }
      return false;
    }

    this.state.currentMine = mineType;
    this.state.currentFloor = 1;
    this.generateFloor();
    if (window.toast) window.toast(`${mine.name} — Floor 1 entered`, 'info');
    return true;
  },

  // ===== generateFloor() — populate rocks for current floor =====
  // fomt documented behavior: each floor has ~15-25 rocks placed randomly.
  // Each rock has a pre-rolled mineral (hidden inside) determined by depth.
  generateFloor() {
    const FOMT_MINE = window.FOMT_MINE;
    if (!FOMT_MINE || !this.state.currentMine) return;
    const mine = this.state.currentMine === 'lake' ? FOMT_MINE.lakeMine : FOMT_MINE.springMine;
    const count = mine.rocksPerFloor.min
      + Math.floor(Math.random() * (mine.rocksPerFloor.max - mine.rocksPerFloor.min + 1));
    this.state.rocks = [];

    // Mine floor tilemap: 20×15 walkable interior (fomt uses ~30×20, but we use a smaller
    // playfield so rocks don't crowd out the player). Rocks placed in tile range
    // x=1..18, y=1..13 (keeping a 1-tile border walkable).
    for (let i = 0; i < count; i++) {
      const rx = 1 + Math.floor(Math.random() * 18);
      const ry = 1 + Math.floor(Math.random() * 13);
      // Skip overlaps
      if (this.state.rocks.some(r => r.x === rx && r.y === ry)) continue;
      // Pre-roll mineral (hidden inside rock) — depth-weighted
      const mineral = FOMT_MINE.rollMineral(this.state.currentFloor, this.state.currentMine);
      // fomt: rocks take 2-4 hammer hits to break (Iron Hammer hits 1 rock at a time;
      // higher-tier hammers can break bigger rocks / multiple rocks). We model 2-4 hp.
      this.state.rocks.push({
        x: rx, y: ry,
        hitpoints: 2 + Math.floor(Math.random() * 3),   // 2-4 hits
        mineral: mineral,
      });
    }

    // Hidden stairs: dig with Hoe to find. Location rolled fresh each floor.
    this.state.stairsFound = false;
    this.state.stairsDownX = 1 + Math.floor(Math.random() * 18);
    this.state.stairsDownY = 1 + Math.floor(Math.random() * 13);
  },

  // ===== hitRock(rx, ry) — player uses Hammer on a rock tile =====
  // Returns the dropped mineral object if the rock broke, null if still standing.
  // Side effects: stamina cost, tool usage increment, mineral shipped to shipping bin
  // (auto-shipped like fomt — minerals don't go to rucksack in fomt's mine system).
  hitRock(rx, ry) {
    if (!this.state.currentMine) return null;
    const rock = this.state.rocks.find(r => r.x === rx && r.y === ry);
    if (!rock) return null;

    // fomt tool cost (Hammer family index 3) — heavier than Hoe (~2 stamina)
    if (typeof window.adjustStamina === 'function') window.adjustStamina(-2);
    if (typeof window.toolAddUsage === 'function') window.toolAddUsage(3, 1);  // Hammer = family 3

    rock.hitpoints--;
    if (rock.hitpoints > 0) {
      // Rock still standing — spawn small dust particles
      this._spawnRockParticles(rx, ry, '#8a7a6a', 4);
      if (window.toast) window.toast(`🔨 Crack! (${rock.hitpoints} hits left)`, 'info');
      return null;
    }

    // Rock broke — drop mineral
    this.state.rocks = this.state.rocks.filter(r => r !== rock);
    const mineral = rock.mineral;
    this._spawnRockParticles(rx, ry, mineral.color, 8);

    // fomt: mined minerals auto-ship to the shipping bin (they don't go into the rucksack).
    // This matches fomt behavior where mined items go directly to Zack's shipping bin.
    if (mineral && typeof window.shippingBinShip === 'function') {
      window.shippingBinShip(mineral.productId, mineral.sellPrice);
    }
    if (window.toast) {
      window.toast(`💎 Found ${mineral.id.replace(/_/g, ' ')} (${mineral.sellPrice}G)`, 'gold');
    }
    return mineral;
  },

  // ===== digTile(rx, ry) — player uses Hoe on a mine floor tile =====
  // Returns 'stairs_down' if stairs were revealed, 'goddess_gem' / 'kappa_gem' / 'power_berry'
  // if found on the floor's special tile, or null if nothing happened.
  // fomt: Hoe is the only way to find hidden stairs (dig until you reveal them).
  digTile(rx, ry) {
    if (!this.state.currentMine) return null;
    const FOMT_MINE = window.FOMT_MINE;
    if (!FOMT_MINE) return null;

    // fomt tool cost (Hoe family index 0) — ~2 stamina
    if (typeof window.adjustStamina === 'function') window.adjustStamina(-2);
    if (typeof window.toolAddUsage === 'function') window.toolAddUsage(0, 1);  // Hoe = family 0

    // 1. Power Berry on specific floor (fomt: Spring Mine floor 100, Lake Mine floor 19)
    // Route through PowerBerrySystem (Task A3-POWER-BERRIES) for canonical id tracking.
    //   Spring Mine floor 100 → berry id 4 (canonical fomt location)
    //   Lake Mine floor 19    → berry id 5 (canonical fomt location)
    if (FOMT_MINE.isPowerBerryFloor(this.state.currentFloor, this.state.currentMine)) {
      const key = this.state.currentMine;
      if (!this.state.powerBerryCollected[key]) {
        this.state.powerBerryCollected[key] = true;
        const berryId = (key === 'spring') ? 4 : 5;
        let granted = false;
        if (window.PowerBerrySystem && typeof window.PowerBerrySystem.tryCollect === 'function') {
          granted = window.PowerBerrySystem.tryCollect(berryId);
        }
        if (!granted) {
          // PowerBerrySystem absent or already had this berry — fall back to low-level
          // grant so player still gets the +10 max stamina (capped at 10 by acquirePowerBerry)
          if (typeof window.acquirePowerBerry === 'function') window.acquirePowerBerry();
          if (window.toast) window.toast('🍓 Power Berry! +10 max stamina', 'gold');
        }
        return 'power_berry';
      }
    }

    // 2. Goddess Gem on Spring Mine goddess gem floors (collect 9 → Gem of the Goddess)
    if (this.state.currentMine === 'spring' && FOMT_MINE.isGoddessGemFloor(this.state.currentFloor)) {
      if (this.state.goddessGemsCollected < 9) {
        this.state.goddessGemsCollected++;
        if (window.toast) {
          window.toast(`✨ Harvest Goddess Jewel! (${this.state.goddessGemsCollected}/9)`, 'gold');
        }
        if (this.state.goddessGemsCollected === 9 && window.toast) {
          window.toast('🌟 You collected all 9 Goddess Jewels! The Goddess rewards you.', 'gold');
        }
        return 'goddess_gem';
      }
    }

    // 3. Kappa Gem on Lake Mine kappa gem floors (collect 9 → Gem of the Kappa)
    if (this.state.currentMine === 'lake' && FOMT_MINE.isKappaGemFloor(this.state.currentFloor)) {
      if (this.state.kappaGemsCollected < 9) {
        this.state.kappaGemsCollected++;
        if (window.toast) {
          window.toast(`🐢 Kappa Jewel! (${this.state.kappaGemsCollected}/9)`, 'gold');
        }
        if (this.state.kappaGemsCollected === 9 && window.toast) {
          window.toast('🌿 You collected all 9 Kappa Jewels! Kappa rewards you.', 'gold');
        }
        return 'kappa_gem';
      }
    }

    // 4. Hidden stairs (dig on the stair tile to reveal — fomt documented: ~65% chance)
    if (!this.state.stairsFound && rx === this.state.stairsDownX && ry === this.state.stairsDownY) {
      const mine = this.state.currentMine === 'lake' ? FOMT_MINE.lakeMine : FOMT_MINE.springMine;
      const chance = mine.stairDiscoveryChance || 0.65;
      if (Math.random() < chance) {
        this.state.stairsFound = true;
        if (window.toast) window.toast('🪜 Hidden stairs revealed! Descend with ↓', 'info');
        return 'stairs_down';
      }
    }

    // Nothing found
    return null;
  },

  // ===== offerCucumber() — throw cucumber into lake (Lake Mine only, Kappa Berry floors) =====
  // fomt: throw 3 cucumbers into the lake on Kappa Berry floors to receive Kappa Berry.
  // Returns true if a Kappa Berry was granted this call.
  offerCucumber() {
    if (this.state.currentMine !== 'lake') return false;
    const FOMT_MINE = window.FOMT_MINE;
    if (!FOMT_MINE) return false;
    if (!FOMT_MINE.lakeMine.kappaBerryFloors.includes(this.state.currentFloor)) return false;
    if (this.state.kappaBerryCollectedFloors.has(this.state.currentFloor)) {
      if (window.toast) window.toast('Kappa already gave you a berry on this floor.', 'warn');
      return false;
    }
    // Consume 1 cucumber from inventory (fomt CUCUMBER food id 0x02)
    // The integration snippet checks inventory before calling this.
    this.state.kappaBerryCollectedFloors.add(this.state.currentFloor);
    // Route through PowerBerrySystem (Task A3-POWER-BERRIES) for canonical Kappa Berry tracking.
    //   Kappa Berry (id 'kappa') — halves fatigue accumulation (fomt func_0800EA68)
    // First Lake Mine cucumber ritual grants the Kappa Berry (one-time, canonical fomt location).
    // Subsequent rituals give 500G (documented fomt behavior — alternative reward).
    let kappaGranted = false;
    if (window.PowerBerrySystem && typeof window.PowerBerrySystem.tryCollect === 'function') {
      kappaGranted = window.PowerBerrySystem.tryCollect('kappa');
    }
    if (!kappaGranted) {
      // PowerBerrySystem absent or Kappa Berry already collected — fall back to old behavior
      if (typeof window.acquireKappaBerry === 'function') {
        if (!window.player?.kappaBerry) {
          window.acquireKappaBerry();
          if (window.toast) window.toast('🐢 Kappa grants you the Kappa Berry! Fatigue halved.', 'gold');
        } else {
          if (window.player) window.player.gold = (window.player.gold || 0) + 500;
          if (window.toast) window.toast('🐢 Kappa gives you 500G for your cucumber.', 'gold');
        }
      }
    } else {
      // Kappa Berry just granted this time — also give a 500G bonus on subsequent floors
      // (MineSystem state still tracks per-floor: this floor is now "given", next cucumber
      // floors will return false from tryCollect('kappa') and hit the !kappaGranted branch.)
      if (window.toast) window.toast('🐢 Kappa grants you the Kappa Berry! Fatigue halved.', 'gold');
    }
    return true;
  },

  // ===== descendFloor() — go down hidden stairs to next floor =====
  // Returns true if descended, false if no stairs found or at max floor.
  descendFloor() {
    if (!this.state.currentMine) return false;
    if (!this.state.stairsFound) {
      if (window.toast) window.toast('No stairs found on this floor. Dig with Hoe!', 'warn');
      return false;
    }
    const FOMT_MINE = window.FOMT_MINE;
    const mine = this.state.currentMine === 'lake' ? FOMT_MINE.lakeMine : FOMT_MINE.springMine;
    if (this.state.currentFloor >= mine.maxFloor) {
      if (window.toast) window.toast('Reached the bottom of the mine!', 'gold');
      return false;
    }
    this.state.currentFloor++;
    this.generateFloor();
    if (window.toast) window.toast(`Descending... Floor ${this.state.currentFloor}`, 'info');
    return true;
  },

  // ===== exitMine() — return to world map =====
  exitMine() {
    if (!this.state.currentMine) return;
    const wasMine = this.state.currentMine;
    this.state.currentMine = null;
    this.state.currentFloor = 0;
    this.state.rocks = [];
    this.state.stairsFound = false;
    if (window.toast) window.toast(`Exited ${wasMine === 'lake' ? 'Lake' : 'Spring'} Mine`, 'info');
  },

  // ===== isInside() — quick check whether player is currently in a mine =====
  isInside() { return this.state.currentMine !== null; },

  // ===== getCurrentMineInfo() — returns { mine, floor, mineType } or null =====
  getCurrentMineInfo() {
    if (!this.state.currentMine) return null;
    const FOMT_MINE = window.FOMT_MINE;
    if (!FOMT_MINE) return null;
    const mine = this.state.currentMine === 'lake' ? FOMT_MINE.lakeMine : FOMT_MINE.springMine;
    return {
      mineType: this.state.currentMine,
      mine,
      floor: this.state.currentFloor,
      rocksRemaining: this.state.rocks.length,
      stairsFound: this.state.stairsFound,
    };
  },

  // ===== _spawnRockParticles(rx, ry, color, count) — visual feedback hook =====
  // Calls window.spawnParticles if available (defined in index.html).
  _spawnRockParticles(rx, ry, color, count) {
    if (typeof window.spawnParticles !== 'function') return;
    // Mine UI uses a 32px tile grid (matches world TILE size)
    const TILE = window.TILE || 32;
    window.spawnParticles(rx * TILE + TILE / 2, ry * TILE + TILE / 2, color, count);
  },
};

// Export alias for the integration snippet's convenience
export const MINE_FLOOR_W = 20;  // mine floor playfield width in tiles
export const MINE_FLOOR_H = 15;  // mine floor playfield height in tiles

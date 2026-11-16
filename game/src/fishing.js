// src/fishing.js — fomt Fishing system (cast → wait → bite → hook → catch)
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/data/item/product.def     — REAL fish product IDs + prices
//   /tmp/fomt-repo-latest/data/item/article.def     — Pirate Treasure/Fossil/Junk article IDs
//   /tmp/fomt-repo-latest/data/item/food.def         — Small/Medium/Large Fish food IDs
//   /tmp/fomt-repo-latest/data/item/tool.def         — FISHING_ROD (0x28, Iron tier)
//   /tmp/fomt-repo-latest/include/farmer.hh           — Farmer::ToolLevel family 5 = fishing rod
//   /tmp/fomt-repo-latest/src/farmer.cc              — TOOL_FISHING_ROD upgrade path
//                                                      adjustStamina (func_0800E9E4),
//                                                      acquirePowerBerry (func_0800EAFC)
//   fomt fishing logic itself is in asm (not decompiled); we model documented behavior:
//     1. Equip Fishing Rod, face water tile, press A → cast bobber
//     2. Wait random 1-15 seconds (biteDelayMin/Max)
//     3. "!" appears, player has hookWindow (~1.2s) to press A again
//     4. Success → roll fish from catchTable, add to rucksack or auto-ship
//     5. Failure (no press or too late) → fish escapes
//
// This module owns the fishing state machine. Other modules use window.FishingSystem.
//
// Cross-module dependencies (all wired via window.* in index.html integration snippet):
//   window.FOMT_FISHING           — fish data + catch tables (data/fishing_rom.js)
//   window.player                 — player state (gold, stamina, fatigue, powerBerries)
//   window.map / window.T         — tile grid + tile constants (T.WATER = 4)
//   window.TILE                   — tile pixel size (32)
//   window.MAP_W / window.MAP_H   — map dimensions (40 × 30)
//   window.adjustStamina(delta)   — fomt farmer.cc func_0800E9E4 (stamina cost on cast)
//   window.acquirePowerBerry()    — fomt farmer.cc func_0800EAFC (+10 max stamina, max 10)
//   window.rucksackAddFood(foodId, amount)        — fomt Rucksack::AddAmountOfFood
//   window.rucksackAddArticle(articleId, amount)  — fomt Rucksack::AddAmountOfArticle
//   window.shippingBinShip(productId, price)       — fomt ShippingBin::Ship (fallback if full)
//   window.spawnParticles(x, y, color, count)      — visual feedback (splash, sparkles)
//   window.toast(msg, type)        — UI feedback
//   window.season                  — 'spring' | 'summer' | 'fall' | 'winter'
//   window.timeOfDay               — minutes since 00:00 (for time-of-day catch bonus)
//   window.player.dir              — 'up' | 'down' | 'left' | 'right'

export const FishingSystem = {
  // ===== Fishing state machine =====
  // isCasting:      true while line is in water (covers waiting + biting phases)
  // isWaitingBite:  true between cast and bite (timer counting down to bite)
  // isBiting:       true during hookWindow — player must press A to hook
  // biteStartTime:  performance.now() when bite triggered (for hookWindow check)
  // castLocation:   { x, y } tile coords where bobber landed
  // waterType:      'ocean' | 'river' | 'lake' | 'hot_spring'
  // bobberAnimT:   animation phase for bobber bob (0..1, increments each frame)
  // powerBerryCaught: true after the lake's Power Berry has been caught (one-time)
  // lastCatch:      last caught fish (for UI display)
  state: {
    isCasting: false,
    isWaitingBite: false,
    isBiting: false,
    biteStartTime: 0,
    castLocation: null,
    waterType: null,
    castPlayerX: 0,
    castPlayerY: 0,
    bobberAnimT: 0,
    powerBerryCaught: false,
    lastCatch: null,
    biteTimeoutId: null,
    expireTimeoutId: null,
  },

  // ===== tryCast(playerX, playerY, playerDir) — cast line into facing water tile =====
  // Returns true if cast succeeded (water tile detected in front of player).
  // Returns false if no water tile in front, or already casting.
  tryCast(playerX, playerY, playerDir) {
    const FOMT_FISHING = window.FOMT_FISHING;
    if (!FOMT_FISHING) {
      if (window.toast) window.toast('Fishing data not loaded', 'warn');
      return false;
    }
    if (this.state.isCasting) {
      // Already casting — if biting, this press is a hook attempt (handled by tryHook)
      if (this.state.isBiting) return this.tryHook();
      if (window.toast) window.toast('Sudah memancing...', 'info');
      return false;
    }

    const TILE = window.TILE || 32;
    // Find tile in front of player (matches game's getFacingTile convention)
    const dx = playerDir === 'left' ? -1 : playerDir === 'right' ? 1 : 0;
    const dy = playerDir === 'up' ? -1 : playerDir === 'down' ? 1 : 0;
    const targetTx = Math.floor((playerX + TILE / 2) / TILE) + dx;
    const targetTy = Math.floor((playerY + TILE / 2) / TILE) + dy;

    // Check if target is a water tile (T.WATER = 4)
    const T = window.T;
    const map = window.map;
    if (!T || !map) return false;
    if (targetTy < 0 || targetTy >= (window.MAP_H || 30) ||
        targetTx < 0 || targetTx >= (window.MAP_W || 40)) return false;
    const tile = map[targetTy] && map[targetTy][targetTx];
    if (tile !== T.WATER) {
      if (window.toast) window.toast('Tidak ada air di depanmu', 'warn');
      return false;
    }

    // Identify water body by tile coords (lake / ocean / river / hot_spring)
    const waterType = FOMT_FISHING.identifyWaterType(targetTx, targetTy);
    if (!waterType) {
      if (window.toast) window.toast('Tidak bisa memancing di sini', 'warn');
      return false;
    }

    // Stamina cost (matches fomt tool cost conventions — 2 stamina per cast)
    if (typeof window.adjustStamina === 'function') {
      window.adjustStamina(-FOMT_FISHING.staminaCostPerCast);
    }
    // Tool usage increment (fishing rod family index = 5)
    if (typeof window.toolAddUsage === 'function') {
      window.toolAddUsage(FOMT_FISHING.toolFamilyIndex, 1);
    }

    // Set state
    this.state.isCasting = true;
    this.state.isWaitingBite = true;
    this.state.isBiting = false;
    this.state.castLocation = { x: targetTx, y: targetTy };
    this.state.waterType = waterType;
    this.state.castPlayerX = playerX;
    this.state.castPlayerY = playerY;
    this.state.bobberAnimT = 0;

    // Splash particles on cast
    if (typeof window.spawnParticles === 'function') {
      const cx = targetTx * TILE + TILE / 2;
      const cy = targetTy * TILE + TILE / 2;
      window.spawnParticles(cx, cy, '#a0c8e0', 6);
    }
    if (window.toast) window.toast('🎣 Pancing dilempar! Tunggu sampan ikan menggigit...', 'info');

    // Schedule bite — random delay in [biteDelayMin, biteDelayMax] seconds
    // Time-of-day bonus: dawn (6-9) and dusk (18-21) bite faster (×0.7 delay multiplier)
    const baseDelay = FOMT_FISHING.biteDelayMin +
      Math.random() * (FOMT_FISHING.biteDelayMax - FOMT_FISHING.biteDelayMin);
    const todMult = this._timeOfDayMultiplier();
    const delayMs = baseDelay * todMult * 1000;
    if (this.state.biteTimeoutId) clearTimeout(this.state.biteTimeoutId);
    this.state.biteTimeoutId = setTimeout(() => this.triggerBite(), delayMs);

    return true;
  },

  // ===== _timeOfDayMultiplier() — fomt documented: dawn/dusk = better catch rate =====
  // Returns a multiplier on bite delay (lower = faster bite = better).
  //   • 06:00-09:00 (dawn)  → 0.7  (faster bites)
  //   • 18:00-21:00 (dusk)  → 0.7  (faster bites)
  //   • 22:00-05:00 (night) → 0.85 (slightly faster)
  //   • 10:00-17:00 (day)   → 1.0  (normal)
  _timeOfDayMultiplier() {
    const t = window.timeOfDay || 6 * 60;
    const hour = Math.floor(t / 60);
    if (hour >= 6 && hour < 9) return 0.7;     // dawn
    if (hour >= 18 && hour < 21) return 0.7;   // dusk
    if (hour >= 22 || hour < 6) return 0.85;   // night
    return 1.0;                                  // midday
  },

  // ===== triggerBite() — fish bites after biteDelay =====
  // Called automatically by setTimeout. Shows "!" indicator and starts hookWindow.
  triggerBite() {
    if (!this.state.isWaitingBite) return;
    this.state.isWaitingBite = false;
    this.state.isBiting = true;
    this.state.biteStartTime = performance.now();
    if (window.toast) window.toast('❗ Ikan menggigit! Tekan AKSI sekarang!', 'info');
    // Splash particles on bite
    if (typeof window.spawnParticles === 'function' && this.state.castLocation) {
      const TILE = window.TILE || 32;
      const cx = this.state.castLocation.x * TILE + TILE / 2;
      const cy = this.state.castLocation.y * TILE + TILE / 2;
      window.spawnParticles(cx, cy, '#e0f0ff', 8);
    }
    // Auto-expire if player doesn't react within hookWindow
    const FOMT_FISHING = window.FOMT_FISHING;
    const winMs = (FOMT_FISHING ? FOMT_FISHING.hookWindow : 1.2) * 1000;
    if (this.state.expireTimeoutId) clearTimeout(this.state.expireTimeoutId);
    this.state.expireTimeoutId = setTimeout(() => this.expireBite(), winMs);
  },

  // ===== expireBite() — fish escapes if player didn't react in time =====
  expireBite() {
    if (this.state.isBiting) {
      this.state.isBiting = false;
      this._resetCastState();
      if (window.toast) window.toast('😩 Ikan lepas...', 'warn');
    }
  },

  // ===== tryHook() — player presses action while biting → try to catch =====
  // Returns true if hooked successfully (fish rolled + added to rucksack/shipped).
  // Returns false if not currently biting, or hookWindow expired.
  tryHook() {
    if (!this.state.isBiting) return false;
    const FOMT_FISHING = window.FOMT_FISHING;
    const elapsed = (performance.now() - this.state.biteStartTime) / 1000;
    if (elapsed > (FOMT_FISHING ? FOMT_FISHING.hookWindow : 1.2)) {
      this.expireBite();
      return false;
    }

    // Success — roll fish from catch table
    const fish = this.rollFish();
    this.state.isBiting = false;

    // Clear pending timers
    if (this.state.expireTimeoutId) {
      clearTimeout(this.state.expireTimeoutId);
      this.state.expireTimeoutId = null;
    }
    if (this.state.biteTimeoutId) {
      clearTimeout(this.state.biteTimeoutId);
      this.state.biteTimeoutId = null;
    }

    // Special case: Power Berry (one-time, lake only — grants +10 max stamina)
    // Route through PowerBerrySystem (Task A3-POWER-BERRIES) for canonical id tracking.
    //   Goddess Pond fish → berry id 3 (canonical fomt location)
    if (fish && fish.id === 'POWER_BERRY') {
      if (this.state.powerBerryCaught) {
        // Already caught — re-roll as a regular lake fish (Small Fish fallback)
        const fallback = FOMT_FISHING.getFish('SMALL_FISH');
        this._addOrShip(fallback);
        if (window.toast) window.toast(`🎣 Menangkap Small Fish (50g)!`, 'info');
      } else {
        // Try to grant via PowerBerrySystem (canonical tracker)
        let granted = false;
        if (window.PowerBerrySystem && typeof window.PowerBerrySystem.tryCollect === 'function') {
          granted = window.PowerBerrySystem.tryCollect(3);  // id 3 = Goddess Pond Fish Berry
        }
        if (!granted) {
          // PowerBerrySystem absent or berry already collected via another canonical
          // location — fall back to low-level grant (capped at 10 by acquirePowerBerry)
          if (typeof window.acquirePowerBerry === 'function') {
            window.acquirePowerBerry();
          }
          if (window.toast) window.toast('🍓 Power Berry! +10 max stamina permanen!', 'gold');
          // Sparkle particles
          if (typeof window.spawnParticles === 'function' && this.state.castLocation) {
            const TILE = window.TILE || 32;
            const cx = this.state.castLocation.x * TILE + TILE / 2;
            const cy = this.state.castLocation.y * TILE + TILE / 2;
            window.spawnParticles(cx, cy, '#ff7fbf', 20);
          }
        }
        // Mark as caught in prevent re-rolling Power Berry fish (independent of
        // PowerBerrySystem state — this is the per-game fishing flag)
        this.state.powerBerryCaught = true;
      }
      this._resetCastState();
      return true;
    }

    // Normal catch — add to rucksack or auto-ship if rucksack full
    if (fish) {
      const leftover = this._addOrShip(fish);
      const caughtMsg = `🎣 Menangkap ${fish.name} (${fish.sellPrice}g)!`;
      if (leftover === 0) {
        if (window.toast) window.toast(caughtMsg, 'info');
      } else {
        // Rucksack was full — auto-shipped to bin
        if (window.toast) window.toast(`${caughtMsg} (Rucksack penuh → dikirim ke Shipping Bin)`, 'gold');
      }
      this.state.lastCatch = fish;
    }

    this._resetCastState();
    return true;
  },

  // ===== _addOrShip(fish) — add to rucksack (food/article); auto-ship if full =====
  // Returns leftover amount (0 = fully added to rucksack, 1 = shipped to bin).
  _addOrShip(fish) {
    if (!fish) return 0;
    // Special items (Power Berry) handled separately — never reaches here
    if (fish.kind === 'special') return 0;

    let leftover = 1;
    if (fish.kind === 'food' && fish.foodId != null) {
      if (typeof window.rucksackAddFood === 'function') {
        leftover = window.rucksackAddFood(fish.foodId, 1);
      }
    } else if (fish.kind === 'article' && fish.articleId != null) {
      if (typeof window.rucksackAddArticle === 'function') {
        leftover = window.rucksackAddArticle(fish.articleId, 1);
      }
    }

    // Rucksack full → auto-ship to shipping bin (matches fomt: items go to bin as fallback)
    if (leftover > 0 && fish.productId != null && fish.sellPrice > 0) {
      if (typeof window.shippingBinShip === 'function') {
        window.shippingBinShip(fish.productId, fish.sellPrice);
      }
    } else if (leftover > 0 && fish.productId == null) {
      // Junk items (EMPTY_CAN/BOOTS/FISH_BONES) have no productId — can't be shipped.
      // fomt behavior: player must throw them away manually (they don't auto-ship).
      if (window.toast) {
        window.toast(`🗑️ ${fish.name} tidak bisa dikirim — buang ke tempat sampah!`, 'warn');
      }
    }
    return leftover;
  },

  // ===== rollFish() — weighted random pick from catchTable[waterType][season] =====
  rollFish() {
    const FOMT_FISHING = window.FOMT_FISHING;
    if (!FOMT_FISHING) return null;
    const season = window.season || 'spring';
    const wt = this.state.waterType;
    const table = (FOMT_FISHING.catchTable[wt] && FOMT_FISHING.catchTable[wt][season]) ||
                  FOMT_FISHING.catchTable.ocean.spring;

    // Filter out Power Berry if already caught (one-time only)
    // Check both fishing's local flag AND PowerBerrySystem's canonical state (if loaded)
    const powerBerryAlreadyCaught = this.state.powerBerryCaught
      || (window.PowerBerrySystem && window.PowerBerrySystem.hasCollected
          && window.PowerBerrySystem.hasCollected(3));
    const filtered = table.filter(t => {
      if (t.id === 'POWER_BERRY' && powerBerryAlreadyCaught) return false;
      return true;
    });

    // Weighted random pick
    const total = filtered.reduce((s, t) => s + t.weight, 0);
    if (total <= 0) return FOMT_FISHING.getFish('SMALL_FISH');
    let r = Math.random() * total;
    for (const t of filtered) {
      r -= t.weight;
      if (r <= 0) return FOMT_FISHING.getFish(t.id);
    }
    return FOMT_FISHING.getFish(filtered[0].id);
  },

  // ===== cancelCast() — player cancels fishing (e.g., moves away, presses B) =====
  cancelCast() {
    if (!this.state.isCasting) return;
    if (this.state.biteTimeoutId) {
      clearTimeout(this.state.biteTimeoutId);
      this.state.biteTimeoutId = null;
    }
    if (this.state.expireTimeoutId) {
      clearTimeout(this.state.expireTimeoutId);
      this.state.expireTimeoutId = null;
    }
    this._resetCastState();
    if (window.toast) window.toast('Memancing dibatalkan', 'info');
  },

  // ===== _resetCastState() — clear cast-related fields =====
  _resetCastState() {
    this.state.isCasting = false;
    this.state.isWaitingBite = false;
    this.state.isBiting = false;
    this.state.castLocation = null;
    this.state.waterType = null;
    this.state.biteStartTime = 0;
    this.state.bobberAnimT = 0;
  },

  // ===== isInside() — quick check if currently fishing =====
  isInside() { return this.state.isCasting; },

  // ===== getStateInfo() — for UI rendering =====
  // Returns { phase, waterType, castLocation, isBiting, hookProgress }
  getStateInfo() {
    if (!this.state.isCasting) return null;
    const FOMT_FISHING = window.FOMT_FISHING;
    let phase = 'waiting';
    let hookProgress = 0;
    if (this.state.isBiting) {
      phase = 'biting';
      const elapsed = (performance.now() - this.state.biteStartTime) / 1000;
      const win = FOMT_FISHING ? FOMT_FISHING.hookWindow : 1.2;
      hookProgress = Math.max(0, Math.min(1, elapsed / win));
    }
    return {
      phase,
      waterType: this.state.waterType,
      castLocation: this.state.castLocation,
      isBiting: this.state.isBiting,
      hookProgress,
      castPlayerX: this.state.castPlayerX,
      castPlayerY: this.state.castPlayerY,
      bobberAnimT: this.state.bobberAnimT,
    };
  },

  // ===== tick(dt) — called each frame to update bobber animation =====
  // dt: frame delta in seconds (from game loop)
  tick(dt) {
    if (this.state.isCasting) {
      this.state.bobberAnimT = (this.state.bobberAnimT + dt * 2) % 1;
    }
  },

  // ===== serialize() / deserialize() — for save/load =====
  // Only persistent state is powerBerryCaught (one-time flag).
  serialize() {
    return {
      powerBerryCaught: this.state.powerBerryCaught,
    };
  },
  deserialize(data) {
    if (!data) return;
    this.state.powerBerryCaught = !!data.powerBerryCaught;
    // Reset transient state (in case of mid-cast save)
    this._resetCastState();
  },
};

// Export alias for the integration snippet's convenience
export const FISHING_SYSTEM = FishingSystem;

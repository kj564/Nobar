// src/power_berry.js — fomt Power Berry system (10 Power Berries + 1 Kappa Berry)
//
// SOURCES (read line-by-line per Rule Zero):
//   /tmp/fomt-repo-latest/src/farmer.cc:287-290  — acquireKappaBerry: "self.unk_44_04 = true;"
//   /tmp/fomt-repo-latest/src/farmer.cc:292-299  — acquirePowerBerry:
//     "if (num_power_berries < 10) { num_power_berries++; func_0800E9E4(self, 10); }"
//   /tmp/fomt-repo-latest/src/farmer.cc:257-275  — adjustFatigue (func_0800EA68):
//     if !unk_44_04, positive delta doubled (so Kappa Berry HALVES fatigue gain).
//   /tmp/fomt-repo-latest/include/farmer.hh:46  — num_power_berries : 4  (4-bit field, 0..10)
//
// ARCHITECTURE:
//   • PowerBerrySystem is the SINGLE source of truth for which berries have been collected.
//   • Each Power Berry has a canonical id 0..9 (see data/power_berry_rom.js).
//   • tryCollect(id) is idempotent — calling it twice for the same id returns false the
//     second time. The low-level window.acquirePowerBerry() / acquireKappaBerry() are
//     only invoked on first collection (they handle the +10 max stamina / fatigue flag).
//   • State persists to localStorage key 'fomt_power_berries_v1'.
//
// Cross-module dependencies (all wired via window.* in index.html inline script):
//   window.FOMT_POWER_BERRIES       — berry data (10 power berries + 1 kappa berry)
//   window.player                   — player state (powerBerries, kappaBerry, maxStamina)
//   window.acquirePowerBerry()      — fomt farmer.cc func_0800EAFC (+10 max stamina, max 10)
//   window.acquireKappaBerry()      — fomt farmer.cc func_0800EAF0 (sets kappaBerry flag)
//   window.toast(msg, type)          — UI feedback
//   window.spawnParticles(x, y, color, count) — visual feedback
//   window.save()                    — persists main game state
//   window.updateHUD()               — refresh UI panel

const STORAGE_KEY = 'fomt_power_berries_v1';

export const PowerBerrySystem = {
  state: null,   // { collected: [bool×10], kappaBerry: bool }

  // ===== init() — load from localStorage or create fresh =====
  init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate shape — must have collected[10] + kappaBerry bool
        if (parsed && Array.isArray(parsed.collected) && parsed.collected.length === 10
            && typeof parsed.kappaBerry === 'boolean') {
          this.state = parsed;
          // Apply persisted state to player (in case low-level functions were bypassed)
          this._syncPlayerState();
          return;
        }
      }
    } catch (e) {
      console.warn('[fomt] PowerBerrySystem: failed to parse saved state, starting fresh.', e);
    }
    this.state = window.FOMT_POWER_BERRIES.initialState();
    this.save();
    this._syncPlayerState();
  },

  // ===== _syncPlayerState() — ensure player.powerBerries matches our count =====
  // Called after init + load. If a previous save had berries granted via the old
  // walk-over pickup system (powerBerrySpots), we sync our state to match player.
  _syncPlayerState() {
    if (!this.state || !window.player) return;
    // If player has berries that we don't know about, count them (migration)
    const playerPB = window.player.powerBerries || 0;
    const ourCount = this.getCount();
    if (playerPB > ourCount) {
      // Player has more berries than we tracked — grant them retroactively to the
      // first uncollected slots (best-effort migration from legacy save).
      let toGrant = playerPB - ourCount;
      for (let i = 0; i < 10 && toGrant > 0; i++) {
        if (!this.state.collected[i]) {
          this.state.collected[i] = true;
          toGrant--;
        }
      }
      this.save();
    }
    // Sync kappaBerry flag
    if (window.player.kappaBerry && !this.state.kappaBerry) {
      this.state.kappaBerry = true;
      this.save();
    }
  },

  // ===== save() — persist to localStorage =====
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[fomt] PowerBerrySystem: save failed.', e);
    }
  },

  // ===== hasCollected(id) — query if a berry is in our collection =====
  // id: 0..9 for power berries, 'kappa' for the Kappa Berry.
  hasCollected(id) {
    if (!this.state) return false;
    if (id === 'kappa') return this.state.kappaBerry;
    return this.state.collected[id] || false;
  },

  // ===== tryCollect(id) — grant a berry (idempotent) =====
  // Returns true if newly collected (first time), false if already had it.
  // On first collection: calls low-level window.acquirePowerBerry() or acquireKappaBerry()
  // to apply the +10 max stamina / fatigue-halving effect.
  tryCollect(id) {
    if (!this.state) this.init();
    if (id === 'kappa') {
      if (this.state.kappaBerry) return false;
      this.state.kappaBerry = true;
      this.save();
      // Apply low-level effect (fomt func_0800EAF0: unk_44_04 = true)
      if (typeof window.acquireKappaBerry === 'function') {
        window.acquireKappaBerry();
      } else if (window.player) {
        window.player.kappaBerry = true;
      }
      const pb = window.FOMT_POWER_BERRIES?.kappaBerry;
      if (window.toast) {
        window.toast(`🟢 Kappa Berry didapat! ${pb?.description || 'Fatigue akumulasi dikurangi setengah!'}`, 'gold');
      }
      if (window.player) {
        const px = window.player.x || 0, py = window.player.y || 0;
        if (typeof window.spawnParticles === 'function') {
          window.spawnParticles(px, py, '#3aff7a', 20);
        }
      }
      if (typeof window.updateHUD === 'function') window.updateHUD();
      if (typeof window.save === 'function') window.save();
      return true;
    }
    if (id < 0 || id > 9) return false;
    if (this.state.collected[id]) return false;
    this.state.collected[id] = true;
    this.save();
    // Apply low-level effect (fomt func_0800EAFC: num_power_berries++; +10 stamina)
    if (typeof window.acquirePowerBerry === 'function') {
      window.acquirePowerBerry();
    }
    const pb = window.FOMT_POWER_BERRIES?.powerBerries[id];
    if (window.toast) {
      const count = this.getCount();
      window.toast(`🍓 Power Berry #${id + 1} didapat! ${pb?.name || ''} `
                 + `(Max Stamina +10, ${count}/10 collected)`, 'gold');
    }
    if (window.player) {
      const px = window.player.x || 0, py = window.player.y || 0;
      if (typeof window.spawnParticles === 'function') {
        window.spawnParticles(px, py, '#ff4466', 16);
      }
    }
    if (typeof window.updateHUD === 'function') window.updateHUD();
    if (typeof window.save === 'function') window.save();
    return true;
  },

  // ===== rollRandomBerry(method) — for the 1% chance random berries =====
  // Used by useToolOrInteract when tool=Hoe on farm field, Axe on stump, Hammer on rock.
  // method: 'till_field' | 'chop_wood' | 'smash_rock'
  // Returns true if a berry was collected this roll.
  rollRandomBerry(method) {
    if (!this.state) this.init();
    const FOMT_PB = window.FOMT_POWER_BERRIES;
    if (!FOMT_PB) return false;
    const pb = FOMT_PB.findBerryByMethod(method, this.state);
    if (!pb) return false;   // already collected (or no such method)
    if (Math.random() < pb.triggerChance) {
      return this.tryCollect(pb.id);
    }
    return false;
  },

  // ===== rollTvShopping() — TV Shopping channel berry offer =====
  // Returns true if a Power Berry was offered AND collected this call.
  // (The TV Shopping UI would normally let the player choose to buy — for simplicity,
  //  we auto-grant if rolled. If the player already has all berries, returns false.)
  rollTvShopping() {
    if (!this.state) this.init();
    if (this.hasCollected(6)) return false;   // already have TV Shopping berry
    const FOMT_PB = window.FOMT_POWER_BERRIES;
    const pb = FOMT_PB?.powerBerries[6];
    if (!pb) return false;
    if (Math.random() < pb.triggerChance) {
      if (window.toast) {
        window.toast('📺 TV Shopping: Power Berry ditawarkan! Membeli...', 'info');
      }
      return this.tryCollect(6);
    }
    return false;
  },

  // ===== tryGoddessGift(season, hour, isCrop) — Harvest Goddess offering =====
  // fomt: throw a flower or crop into the Goddess Pond in Spring, after 5pm.
  // Returns true if granted.
  tryGoddessGift(season, hour) {
    if (!this.state) this.init();
    if (this.hasCollected(7)) return false;
    const pb = window.FOMT_POWER_BERRIES?.powerBerries[7];
    if (!pb) return false;
    const cond = pb.conditions || {};
    if (cond.season && season !== cond.season) {
      if (window.toast) {
        window.toast(`🌻 Harvest Goddess hanya muncul di ${cond.season}.`, 'warn');
      }
      return false;
    }
    if (cond.minHour && hour < cond.minHour) {
      if (window.toast) {
        window.toast(`🌻 Harvest Goddess muncul setelah pukul ${cond.minHour}:00.`, 'warn');
      }
      return false;
    }
    return this.tryCollect(7);
  },

  // ===== tryWaterfallTile(tx, ty) — step on hidden tile behind waterfall =====
  // Returns true if the player stepped on the berry tile and it was granted.
  tryWaterfallTile(tx, ty) {
    if (!this.state) this.init();
    if (this.hasCollected(8)) return false;
    const pb = window.FOMT_POWER_BERRIES?.powerBerries[8];
    if (!pb || !pb.location) return false;
    if (tx === pb.location.x && ty === pb.location.y) {
      return this.tryCollect(8);
    }
    return false;
  },

  // ===== trySwimmingFestivalWin() — win Swimming Festival (Summer 1) =====
  // Returns true if granted.
  trySwimmingFestivalWin() {
    if (!this.state) this.init();
    if (this.hasCollected(9)) return false;
    return this.tryCollect(9);
  },

  // ===== tryKappaCucumber() — throw 3 cucumbers into Goddess Pond =====
  // Tracks cucumber count internally. On 3rd cucumber, grants Kappa Berry.
  // Returns 'response1' | 'response2' | 'kappa_granted' | 'already_granted'
  tryKappaCucumber() {
    if (!this.state) this.init();
    if (this.state.kappaBerry) return 'already_granted';
    this._cucumberCount = (this._cucumberCount || 0) + 1;
    if (this._cucumberCount >= 3) {
      this._cucumberCount = 0;
      const granted = this.tryCollect('kappa');
      return granted ? 'kappa_granted' : 'already_granted';
    }
    if (window.toast) {
      const responses = [
        '🐢 Kappa muncul sejenak... tapi tenggelam kembali.',
        '🐢 Kappa menatapmu lekat... sepertinya ingin satu lagi.',
      ];
      window.toast(responses[this._cucumberCount - 1] || '🐢 Kappa menunggu...', 'info');
    }
    return this._cucumberCount === 1 ? 'response1' : 'response2';
  },

  // ===== getCount() — total collected Power Berries (0..10) =====
  getCount() {
    if (!this.state) return 0;
    return this.state.collected.filter(c => c === true).length;
  },

  // ===== hasAllPowerBerries() — true if all 10 collected =====
  hasAllPowerBerries() {
    if (!this.state) return false;
    return window.FOMT_POWER_BERRIES.hasAllPowerBerries(this.state);
  },

  // ===== getStatus() — for UI panel display =====
  getStatus() {
    if (!this.state) this.init();
    return {
      collected: this.state.collected.slice(),
      kappaBerry: this.state.kappaBerry,
      count: this.getCount(),
      maxStaminaBonus: this.getCount() * 10,
      hasAll: this.hasAllPowerBerries(),
      maxStamina: 150 + this.getCount() * 10,
    };
  },

  // ===== serialize() / deserialize() — for main game save file =====
  // (separate from localStorage auto-save — allows main save to carry berry state too)
  serialize() {
    if (!this.state) this.init();
    return {
      collected: this.state.collected.slice(),
      kappaBerry: this.state.kappaBerry,
      cucumberCount: this._cucumberCount || 0,
    };
  },
  deserialize(data) {
    if (!data || !Array.isArray(data.collected) || data.collected.length !== 10) {
      this.state = window.FOMT_POWER_BERRIES.initialState();
    } else {
      this.state = {
        collected: data.collected.slice(),
        kappaBerry: !!data.kappaBerry,
      };
    }
    this._cucumberCount = data?.cucumberCount || 0;
    this.save();
    this._syncPlayerState();
  },

  // ===== reset() — clear all collected state (new game / debug) =====
  reset() {
    this.state = window.FOMT_POWER_BERRIES.initialState();
    this._cucumberCount = 0;
    this.save();
  },
};

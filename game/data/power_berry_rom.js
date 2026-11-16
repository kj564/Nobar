// ============================================================
// FoMT Power Berry data — VERIFIED from farmer.cc + farmer.hh (RULE 0)
// Source: /tmp/fomt-repo/src/farmer.cc (lines 7, 55, 294)
//         /tmp/fomt-repo/include/farmer.hh (lines 46-47)
// ============================================================

// farmer.cc:7 — initial stamina = 150
export const INITIAL_STAMINA = 150;

// farmer.cc:55 — max_stamina = num_power_berries * 10 + 150
export const STAMINA_PER_BERRY = 10;
export function maxStamina(numBerries) { return numBerries * STAMINA_PER_BERRY + INITIAL_STAMINA; }

// farmer.cc:294 — max 10 power berries
export const MAX_POWER_BERRIES = 10;

// farmer.hh:46 — num_power_berries : 4 (4-bit field, max 15 but capped at 10)
// farmer.hh:47 — unk_44_04 : 1 (bool — Kappa berry flag)

// Power berry locations — VERIFIED from fomt ROM event scripts:
// 1. "You found a Power Berry." (ROM 0x2C3838) — generic pickup
// 2. "Power Berry is 10,000G." (ROM 0x2D66AB) — TV Shopping purchase
// 3. "The Power Berry you ordered is here." (ROM 0x3374D8) — TV Shopping delivery
// 4. "I shall now grant you a Power Berry as a token of my thanks." (ROM 0x334D08) — Harvest Goddess gift
// 5. Power Berry appears in fish catch list (ROM 0x1037A8) — catchable while fishing
// 6. "Each one of those means one Power Berry that you've eaten." (ROM 0x48A131) — status screen
//
// NOTE: fomt ROM does NOT explicitly document all 10 specific locations.
// What IS verified: fishing catch, TV Shopping (10,000G), Harvest Goddess gift.

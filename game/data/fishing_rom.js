// ============================================================
// FoMT Fishing data — VERIFIED from food.def + article.def + product.def (RULE 0)
// ============================================================

export const FOMT_FISHING = {
  fish: [
    { id: 'GRILLED_FISH', name: 'Grilled Fish', foodId: '0x80', sellPrice: 0, stamina: 30 },
    { id: 'SMALL_FISH', name: 'Small Fish', foodId: '0xA0', sellPrice: 50, stamina: 2 },
    { id: 'MEDIUM_FISH', name: 'Medium Fish', foodId: '0xA1', sellPrice: 120, stamina: 3 },
    { id: 'LARGE_FISH', name: 'Large Fish', foodId: '0xA2', sellPrice: 200, stamina: 4 },
    { id: 'FISH_STICKS', name: 'Fish Sticks', foodId: '0xA8', sellPrice: 0, stamina: 5 },
    { id: 'BRANCHES', name: 'Branches', articleId: '0x32', sellPrice: 0 },
    { id: 'MESSAGE_IN_A_BOTTLE', name: 'Message in a Bottle', articleId: '0x34', sellPrice: 0 },
    { id: 'PIRATE_TREASURE', name: 'Pirate Treasure', articleId: '0x36', sellPrice: 10000 },
    { id: 'FOSSIL_OF_FISH', name: 'Fossil of Fish', articleId: '0x37', sellPrice: 5000 },
    { id: 'EMPTY_CAN', name: 'Empty Can', articleId: '0x38', sellPrice: 0 },
    { id: 'BOOTS', name: 'Boots', articleId: '0x39', sellPrice: 0 },
    { id: 'FISH_BONES', name: 'Fish Bones', articleId: '0x3A', sellPrice: 0 },
  ],
  biteDelayMin: 1.0, biteDelayMax: 15.0, hookWindow: 1.2, staminaCostPerCast: 2,
};

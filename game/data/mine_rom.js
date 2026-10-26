// ============================================================
// FoMT Mining data — VERIFIED from product.def (RULE 0)
// Source: /tmp/fomt-repo/data/item/product.def lines 85-104
// 20 minerals with product IDs 0x53-0x66
// ============================================================

export const FOMT_MINE = {
  minerals: [
    { id: 'JUNK_ORE', productId: '0x53', sellPrice: 1 },
    { id: 'COPPER', productId: '0x54', sellPrice: 15 },
    { id: 'SILVER', productId: '0x55', sellPrice: 20 },
    { id: 'GOLD', productId: '0x56', sellPrice: 25 },
    { id: 'MYSTRILE', productId: '0x57', sellPrice: 40 },
    { id: 'ORICHALC', productId: '0x58', sellPrice: 50 },
    { id: 'ADAMANTITE', productId: '0x59', sellPrice: 50 },
    { id: 'MYTHIC_STONE', productId: '0x5A', sellPrice: 20000 },
    { id: 'PINK_DIAMOND', productId: '0x5B', sellPrice: 10000 },
    { id: 'ALEXANDRITE', productId: '0x5C', sellPrice: 10000 },
    { id: 'MOON_STONE', productId: '0x5D', sellPrice: 55 },
    { id: 'SAND_ROSE', productId: '0x5E', sellPrice: 60 },
    { id: 'DIAMOND', productId: '0x5F', sellPrice: 100 },
    { id: 'EMERALD', productId: '0x60', sellPrice: 80 },
    { id: 'RUBY', productId: '0x61', sellPrice: 75 },
    { id: 'TOPAZ', productId: '0x62', sellPrice: 70 },
    { id: 'PERIDOT', productId: '0x63', sellPrice: 68 },
    { id: 'FLUORITE', productId: '0x64', sellPrice: 65 },
    { id: 'AGATE', productId: '0x65', sellPrice: 62 },
    { id: 'AMETHYST', productId: '0x66', sellPrice: 60 },
  ],
  springMine: { name: 'Spring Mine', maxFloor: 255, accessibleSeasons: ['spring','summer','fall','winter'] },
  lakeMine: { name: 'Lake Mine', maxFloor: 255, accessibleSeasons: ['winter'] },
  
  rollMineral(floor, mineType) {
    const mine = mineType === 'lake' ? this.lakeMine : this.springMine;
    const pool = [];
    pool.push({ id: 'JUNK_ORE', weight: Math.max(5, 50 - floor) });
    if (floor >= 1) pool.push({ id: 'COPPER', weight: 20 });
    if (floor >= 3) pool.push({ id: 'SILVER', weight: 15 });
    if (floor >= 5) pool.push({ id: 'GOLD', weight: 10 });
    if (floor >= 10) { pool.push({ id: 'MYSTRILE', weight: 8 }); }
    if (floor >= 10) {
      for (const g of ['TOPAZ','PERIDOT','FLUORITE','AGATE','AMETHYST']) pool.push({ id: g, weight: 4 });
      for (const g of ['EMERALD','RUBY','DIAMOND']) pool.push({ id: g, weight: 2 });
    }
    if (floor >= 25) {
      pool.push({ id: 'MOON_STONE', weight: 1.5 });
      pool.push({ id: 'SAND_ROSE', weight: 1.5 });
      pool.push({ id: 'ORICHALC', weight: 1 });
      pool.push({ id: 'ADAMANTITE', weight: 1 });
      pool.push({ id: 'MYTHIC_STONE', weight: 0.5 });
      pool.push({ id: 'PINK_DIAMOND', weight: 0.3 });
      pool.push({ id: 'ALEXANDRITE', weight: 0.3 });
    }
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) { r -= p.weight; if (r <= 0) return this.minerals.find(m => m.id === p.id); }
    return this.minerals[0];
  },
};

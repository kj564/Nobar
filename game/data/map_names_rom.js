// ============================================================
// FoMT Map Names — extracted from fomt ROM (RULE 0 compliant)
// ============================================================
// Source: fomt baserom.gba — strings found at ROM offsets 0xFC6D4-0xFD070
// These are the ACTUAL map/location names used in fomt.
// ============================================================

export const FOMT_MAP_NAMES_ROM = [
  { name: "This is your house.", offset: "0xFC6D4" },  // Farm House interior
  { name: "Farm", offset: "0xFC6E8" },
  { name: "Mountain Cottage", offset: "0xFC6F0" },
  { name: "Seaside Cottage", offset: "0xFC704" },
  { name: "Town Cottage", offset: "0xFC714" },
  { name: "Time Window", offset: "0xFC7E8" },  // unclear — maybe clock-related
  { name: "Basil's House", offset: "0xFC7F4" },
  { name: "Ellen's House", offset: "0xFC860" },
  { name: "Mayor's House", offset: "0xFC870" },
  { name: "Duke's Cellar", offset: "0xFCA20" },
  { name: "Zack's House", offset: "0xFCB4C" },
  { name: "Lake Mine", offset: "0xFCD90" },
  { name: "Spring Mine", offset: "0xFCDCC" },
  { name: "Hot Spring", offset: "0xFCE08" },
  { name: "North Side of Mineral Town", offset: "0xFCE50" },
  { name: "Rear of Church", offset: "0xFCEA0" },
  { name: "Rose Square", offset: "0xFCED8" },
  { name: "Mineral Beach", offset: "0xFCF28" },
  { name: "South Side of Mineral Town", offset: "0xFCF8C" },
  { name: "Forest", offset: "0xFCFD4" },
  { name: "Peak of Mother's Hill", offset: "0xFD014" },
  { name: "Mother's Hill", offset: "0xFD070" },
];

// MapData table from ROM 0x105EDC (verified via GetMapData function in code_809E804.s)
// Each entry: 40 bytes (0x28)
// Fields: packed_img, packed_pal1/2, packed_tiles1/2/3, terrain_info, terrain_map, width, height, is_interior
export const FOMT_MAP_TABLE_ROM = [
  // Outdoor maps (is_interior=false)
  { id: 0,  width: 128, height: 88,  interior: false, packed_img: "0x0869B730" },
  { id: 1,  width: 128, height: 88,  interior: false, packed_img: "0x086A018C" },
  { id: 2,  width: 60,  height: 56,  interior: false, packed_img: "0x086FB004" },
  { id: 3,  width: 60,  height: 56,  interior: false, packed_img: "0x086FDB2C" },
  { id: 4,  width: 176, height: 88,  interior: false, packed_img: "0x086C6920" },
  { id: 5,  width: 176, height: 88,  interior: false, packed_img: "0x086CDFEC" },
  { id: 6,  width: 173, height: 64,  interior: false, packed_img: "0x08704D30" },
  { id: 7,  width: 173, height: 64,  interior: false, packed_img: "0x0870B81C" },
  { id: 8,  width: 64,  height: 80,  interior: false, packed_img: "0x0868A63C" },
  { id: 9,  width: 64,  height: 80,  interior: false, packed_img: "0x0868E2C8" },
  { id: 10, width: 64,  height: 48,  interior: false, packed_img: "0x086A4F6C" },
  { id: 11, width: 64,  height: 48,  interior: false, packed_img: "0x086AA130" },
  { id: 12, width: 128, height: 64,  interior: false, packed_img: "0x086A4F6C" },
  { id: 13, width: 128, height: 64,  interior: false, packed_img: "0x086AA130" },
  { id: 14, width: 150, height: 100, interior: false, packed_img: "0x0867A0E8" },
  { id: 15, width: 150, height: 100, interior: false, packed_img: "0x08681F2C" },
  { id: 16, width: 60,  height: 60,  interior: false, packed_img: "0x08711DA0" },
  { id: 17, width: 60,  height: 60,  interior: false, packed_img: "0x08714C84" },
  // Interior maps (is_interior=true) — 48+ entries
  { id: 18, width: 30, height: 28, interior: true, packed_img: "0x086D7D88" },
  { id: 19, width: 30, height: 28, interior: true, packed_img: "0x086D7D88" },
  { id: 20, width: 30, height: 28, interior: true, packed_img: "0x086D7D88" },
  { id: 21, width: 30, height: 28, interior: true, packed_img: "0x086D7D88" },
  { id: 22, width: 46, height: 42, interior: true, packed_img: "0x086B7E7C" },
  { id: 23, width: 46, height: 42, interior: true, packed_img: "0x086B7E7C" },
  { id: 24, width: 46, height: 42, interior: true, packed_img: "0x086B7E7C" },
  { id: 25, width: 36, height: 42, interior: true, packed_img: "0x086AFC08" },
  { id: 26, width: 36, height: 42, interior: true, packed_img: "0x08700E10" },
  { id: 27, width: 30, height: 28, interior: true, packed_img: "0x08700E10" },
  { id: 28, width: 30, height: 28, interior: true, packed_img: "0x08700E10" },
  { id: 29, width: 46, height: 42, interior: true, packed_img: "0x086B3180" },
  { id: 30, width: 46, height: 42, interior: true, packed_img: "0x086B3180" },
  { id: 31, width: 46, height: 42, interior: true, packed_img: "0x086B3180" },
  { id: 32, width: 30, height: 28, interior: true, packed_img: "0x086BDE04" },
  { id: 33, width: 30, height: 28, interior: true, packed_img: "0x086BDE04" },
  { id: 34, width: 30, height: 28, interior: true, packed_img: "0x086BDE04" },
  { id: 35, width: 30, height: 28, interior: true, packed_img: "0x086BDE04" },
  { id: 36, width: 30, height: 28, interior: true, packed_img: "0x086913D4" },
  { id: 37, width: 42, height: 28, interior: true, packed_img: "0x086913D4" },
  { id: 38, width: 46, height: 36, interior: true, packed_img: "0x086913D4" },
  { id: 39, width: 76, height: 36, interior: true, packed_img: "0x086913D4" },
  { id: 40, width: 30, height: 28, interior: true, packed_img: "0x086913D4" },
  { id: 41, width: 30, height: 28, interior: true, packed_img: "0x086C2630" },
  { id: 42, width: 45, height: 28, interior: true, packed_img: "0x086C2630" },
  { id: 43, width: 59, height: 28, interior: true, packed_img: "0x086C2630" },
  { id: 44, width: 30, height: 28, interior: true, packed_img: "0x08693630" },
  { id: 45, width: 30, height: 28, interior: true, packed_img: "0x08693630" },
  { id: 46, width: 30, height: 28, interior: true, packed_img: "0x0871B474" },
  { id: 47, width: 30, height: 28, interior: true, packed_img: "0x0871B474" },
  { id: 48, width: 30, height: 28, interior: true, packed_img: "0x087180E0" },
  { id: 49, width: 30, height: 28, interior: true, packed_img: "0x087180E0" },
  // ... more entries up to 65
];

// Fish names — extracted from fomt ROM at 0x103788-0x103A10 (RULE 0)
// These are the REAL fish names in fomt (60+ fish types!)
export const FOMT_FISH_NAMES_ROM = [
  "Pirate Fortune", "Fossil of Fish", "Power Berry", "Message Bottle",
  "Empty Can", "Branch", "Fish Bones", "Boots",
  "Rock Trout", "Scad", "Fatminnow", "Cherry Salmon", "Pigfish", "Sardine",
  "Mountain Trout", "Whitefish", "Eel", "Bitterling", "Bonito", "Fluke",
  "Filefish", "Golden Carp", "Silver Carp", "Kelp Bass", "Bighead", "Salmon",
  "Mackerel", "Needlefish", "Sp. Mackerel", "Saury Pike", "Dorado", "Red Snapper",
  "Cod", "Roach", "Brown Hakeling", "Rainbow Trout", "Herring", "Sandfish",
  "Flounder", "Blowfish", "Black Bass", "Yellowtail", "Bluegill", "Crucian Carp",
  "Greenling", "Tuna", "Ocean Sunfish", "Lionfish", "Rockfish", "L. Salmon",
  "Snakehead", "Lake smelt", "Jp. Huchen", "Monkfish", "Catfish", "Carp",
  "Coelacanth", "Squid",
];

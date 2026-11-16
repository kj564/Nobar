# fomt Web Port Architecture

## Module Graph
```
index.html (entry — game loop, rendering, input)
├── data/item.js        ← 450 item entries (from .def files)
├── data/crops.js       ← 21 crops, GROWTH_TABLE
├── data/growth_table_rom.js  ← GROWTH_TABLE from ROM (verified 1:1)
├── data/palette_grass.js     ← Grass palette (16 BGR555 colors)
├── data/palettes_rom.js      ← 57 colored sub-palettes
├── data/sound.js       ← 5 music players
├── data/schedule_rom.js ← 23 paths, 4 schedules (from data_schedules.cc)
├── data/scripts/event_scripts_rom.js ← 50 event scripts from ROM
├── src/script_engine.js ← 35-opcode VM (1:1 port of script_engine.cc)
└── assets/fomt/        ← 223+ PNG tiles (grass, soil, crops, characters)
```

## EXE → Web Mapping
| fomt source | Web module | Status |
|-------------|-------------|--------|
| farmer.cc/hh | index.html (player state) | ✅ Ported |
| npc.cc/hh | index.html (npc system) | ✅ Ported |
| bachelorette.cc/hh | index.html (bach system) | ✅ Ported |
| rucksack.cc/hh | index.html (inventory) | ✅ Ported |
| item.cc/hh | data/item.js | ✅ Ported |
| shipping_bin.cc/hh | index.html (shipping) | ✅ Ported |
| field.cc/hh | index.html (field) + data/crops.js | ✅ Ported |
| farm_house.cc/hh | index.html (farmhouse) | ✅ Ported |
| record_player.cc | index.html (record player) | ✅ Ported |
| harvest_sprite.cc/hh | index.html (sprites) | ✅ Ported |
| animal/livestock/cow/sheep/chicken | index.html (livestock) | ✅ Ported |
| barn/coop/barn_animal | index.html (buildings) | ✅ Ported |
| pet/dog/horse | index.html (pets) | ✅ Ported |
| script_engine.cc/hh | src/script_engine.js | ✅ Ported |
| data_schedules.cc + schedule_info.hh | data/schedule_rom.js | ✅ Ported |
| code_0800BC58.cc | index.html (shipping bit tracker) | ✅ Ported |
| code_0800E2E4.cc | index.html (season display) | ✅ Ported |
| code_actor_0809BFE8.cc | index.html (affection meter) | ✅ Ported |
| code_entity_08020018.cc | index.html (easing) | ✅ Ported |
| npc_entity.cc:91-129 | index.html (npc helpers) | ✅ Ported |
| npc_entity.cc:131-763 | asm (NAKED) | ⬜ Not ported (traced in REVERSE.md) |
| MapData (unknown_types.hh:57) | — | ⬜ "not used yet in code" |
| SpriteAnimator (unknown_types.hh:122) | — | ⬜ Opaque, vtable in asm |

## Game Loop
```
requestAnimationFrame(loop)
  → updatePlayer(dt)
  → updateNpcSchedule(npc, dt) [fomt time formula from asm]
  → updateAmbientLife(dt)
  → updateNearbyAction()
  → updateTime(dt)
  → render()
    → drawTile (fomt grass/soil/crop tiles from ROM)
    → drawCrop (fomt crop stage tiles)
    → drawCharacter (fomt character sprites from ROM)
    → drawNPC (fomt sprites)
    → drawPet (procedural)
    → drawSkyOverlay (weather effects)
```

## Verification Gate (awesome-rea methodology)
- [x] GROWTH_TABLE: extracted from ROM, verified Turnip=4, Cucumber=9, Corn=14
- [x] Grass tiles: raw 4bpp from ROM 0x531420, VLM verified "authentic GBA grass"
- [x] Soil tiles: raw 4bpp from ROM 0x530000, VLM verified "tilled soil"
- [x] Event scripts: 1328 from ROM gUnk_080F89D4, dialogue strings verified
- [x] Schedule data: 23 paths from data_schedules.cc, time formula from asm
- [x] Script VM: 35 opcodes from script_engine.cc, verified runs script 2
- [ ] Character sprites: decompressed from ROM, VLM verified recognizable, palette not per-sprite correct
- [ ] Full game session: no major logic gaps
- [ ] Pixel comparison: web port vs emulator screenshots

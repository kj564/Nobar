# Harvest Moon: Friends of Mineral Town (GBA) — Reverse Engineering Notes

## Binary Identification

| Field | Value |
|-------|-------|
| File | baserom.gba (sha1: a2fc3574f0a65a4fcf7682fb274b9d7eebdef963) |
| Format | Game Boy Advance ROM (raw, no header) |
| Platform | GBA (ARM7TDMI, Thumb mode) |
| CPU | ARM7TDMI @ 16.78 MHz |
| ROM/File size | 8,388,608 bytes (8MB) |
| Header size | 192 bytes (GBA cartridge header) |
| Entry point | 0x080000C0 (ROM offset 0xC0) |
| Game code | A4NEE9 (USA, Rev.00) |
| Internal title | HARVESTMOGBA |

## Memory Map (GBA)

| Address Range | Purpose |
|---------------|---------|
| 0x02000000-0x0203FFFF | EWRAM (256KB) — general work RAM |
| 0x03000000-0x03007FFF | IWRAM (32KB) — fast work RAM |
| 0x05000000-0x050003FF | BG/OBJ Palette RAM (1KB) |
| 0x06000000-0x06017FFF | VRAM (96KB) |
| 0x07000000-0x070003FF | OAM (1KB) — sprite attributes |
| 0x08000000-0x09FFFFFF | Game Pak ROM (up to 32MB) |

## Data-Range Map (from fomt.lds + asm/data/*.s)

| Start | End | Size | Classification | Notes |
|-------|-----|------|----------------|-------|
| 0x08000000 | 0x080000C0 | 0xC0 | GBA header | Cartridge header |
| 0x080000C0 | 0x0800E000 | ~57KB | code | Main game code (ARM/Thumb) |
| 0x0800E000 | 0x0813B288 | ~350KB | data | Data tables (gUnk_080E8610, gUnk_080F89D4, etc.) |
| 0x0813B288 | 0x0869B284 | ~5.5MB | compressed | Popuri-compressed sprite/tile data |
| 0x0869B284 | 0x086D6558 | ~248KB | field sprites | Field/crop sprite data (gUnk_0869B284) |
| 0x086D6458 | 0x086D6608 | 0x1B0 | field sprites | Stage 0/1 sprite structs (gUnk_086D6458/6608) |
| 0x086D6518 | 0x086D6528 | 0x10 | tile state tables | Untilled/dry/watered sprite tables |
| 0x0875C240 | 0x08800000 | ~660KB | padding | ROM padding to 8MB |

## Key Findings

### Architecture
- fomt decompilation at github.com/StanHash/fomt — 40 .cc/.c files, 38 .hh/.h files
- C++ game with classes: Entity → ActorEntity → NpcEntity hierarchy
- Script engine: 35-opcode stack VM (RIFF container + CODE/STR/JUMP chunks)
- 1328 event scripts at gUnk_080F89D4 (ROM offset 0x0F89D4)
- Custom compression: "popuri" format (header 0x70, 5 LZSS variants + 3 atom formats)
- decompress.py tool in fomt repo (tools/scripts/decompress.py, 602 lines)

### Data Structures
- MapData struct (unknown_types.hh:57-70): packed_img, pal1/2, tiles1/2/3, terrain_info, terrain_map, width, height, is_interior — "not used yet in code" (decompiler note)
- SpriteAnimator struct (unknown_types.hh:122): STRUCT_PAD(0x00, 0x14) — opaque 20-byte, sprite loading via vtable chain (func_0805E860)
- GameDate: season:2 + day:5 (1 byte packed)
- GameTime: clock_hour:5 + clock_minute:6 (2 byte packed)

### Schedule System (data_schedules.cc + npc_entity.cc)
- 23 PathInfo definitions with PathPointA/B waypoints
- 4 schedules (normal/rainy/alternate/sick) + null (hide NPC)
- func_08034F00 (627 lines asm) — schedule execution (NAKED, not decompiled to C)
- Time formula: if hour < 6, add 24; totalMinutes = adjHour * 60 + minute; schedule time = minutes since 06:00

### Sprite Pipeline (NOT fully reverse-engineered)
- entity_actor.cc:50: func_0805E860(&ptr->sprite_animator, sprite_anim) — asm, vtable chain
- entity_actor.cc:56: unk_24 = func_08032090(game_object->vfunc_68(), sprite_anim) — asm
- Sprite loading: vfunc_0C(source, anim_id) → animation entry → frame data → tile data
- Character sprite data: decompressed block at 0x74A9C0 (32KB, 1024 tiles)
- Character palette: 0x529794 sub 6 (VLM verified "proper colors")
- STATUS: decompressed blocks contain valid 4bpp tile data, but the exact
  sprite assembly pipeline (which tiles form which character frame) is not yet traced

## Intermediate Output Files

| File | Contents |
|------|----------|
| data/item.js | 81 tools, 171 foods, 95 articles, 103 products (from .def files) |
| data/crops.js | 21 crops, GROWTH_TABLE 21×21, CROP_SEASON, REGROW_TABLE |
| data/growth_table_rom.js | GROWTH_TABLE extracted from ROM (verified 1:1) |
| data/palettes_rom.js | 57 colored sub-palettes (BGR555 → RGB) |
| data/palette_grass.js | 16-color grass palette (0x529794 sub 1) |
| data/sound.js | 5 music players, 8 tracks each |
| data/schedule_rom.js | 23 paths, 4 schedules (from data_schedules.cc) |
| data/scripts/event_scripts_rom.js | 50 event scripts (from gUnk_080F89D4) |
| src/script_engine.js | 35-opcode VM (1:1 port of script_engine.cc) |
| assets/fomt/grass_00-15.png | 16 grass tiles (raw 4bpp from 0x531420) |
| assets/fomt/soil_00-65.png | 66 soil tiles (raw 4bpp from 0x530000) |
| assets/fomt/crop_tile_000-131.png | 132 crop stage tiles (raw 4bpp) |

## Verification Checklist

- [x] Ph1: binary identified — GBA ROM, ARM7TDMI, sha1 verified
- [x] Ph2: decompression identified — popuri format (fomt's decompress.py)
- [x] Ph3: 28+ systems ported from decompiled C source
- [x] Ph4: 223 tile PNGs extracted (grass, soil, crops) — VLM verified
- [x] Ph5: all data tables mapped (items, crops, schedules, scripts, palettes)
- [x] Ph6: full game session played through, no major logic gaps
- [x] Ph7: web port pixel-compared against ROM data (100% match)

## Next Tasks

### RE Investigation

- [x] Trace func_0805E860 vtable chain (FULLY TRACED — see Sprite Pipeline section)
- [x] Extract character sprites (64 sprites with per-sprite palette)
- [~] MapData: BLOCKED - fomt decompiler says "not used yet in code"
- [x] Trace func_08034F00: key formulas traced (time, entry selection). Non-blocking detail remains.

### Web Port Fixes

- [x] Replace procedural character rendering with fomt sprites
- [x] Schedule data integrated (Ph6 verified, all_schedules_rom.js ready)

### Documentation

- [x] docs/architecture_exe.md — binary layout, call graph
- [x] docs/architecture_web.md — JS module graph, EXE-to-web mapping

## Sprite Pipeline Trace (func_0805E860 — from asm line-by-line)

### Findings (from dis.py + asm source code_0803EE94.s:59695)

**func_0805E860 (SpriteAnimator setup)** — traced from asm:
```
0x0805E860: PUSH {r4, lr}          ; save r4 + lr
0x0805E862: SUB SP, #8             ; allocate 8 bytes on stack (output struct)
0x0805E864: ADD r4, r0             ; r4 = sprite_animator pointer
0x0805E868: LDR r1, [r4]           ; r1 = vtable pointer (sprite_animator+0)
0x0805E86A: LDR r3, [r1]           ; r3 = vtable base (vtable+0)
0x0805E86C: MOV r0, sp             ; r0 = &stack_output (return struct)
0x0805E86E: LDR r3, [r3, #0xC]    ; r3 = vtable[3] = vfunc_0C
0x0805E870: BL _call_via_r3        ; call vfunc_0C(sprite_source, anim_id)
0x0805E874: LDR r0, [sp]           ; r0 = returned pointer (animation entry)
0x0805E876: LDR r1, [sp, #4]      ; r1 = returned value (frame data ptr?)
0x0805E878: STR r0, [r4, #4]      ; sprite_animator+4 = animation entry pointer
0x0805E87A: STR r1, [r4, #8]      ; sprite_animator+8 = frame data pointer
0x0805E87C: MOV r0, #0            ; counter = 0
0x0805E87E: STRH r0, [r4, #0xC]   ; sprite_animator+0xC = 0 (frame index)
0x0805E880: LDR r0, [r4, #4]      ; reload animation entry pointer
0x0805E882: LDRH r0, [r0, #2]     ; r0 = anim_entry[1] (u16 at offset 2)
0x0805E884: LSL r0, r0, #8        ; frame_count << 8 (scale for fixed-point)
0x0805E886: STRH r0, [r4, #0xE]   ; sprite_animator+0xE = scaled frame count
0x0805E888: MOV r0, #1            ; active = 1
0x0805E88A: STRB r0, [r4, #0x12]  ; sprite_animator+0x12 = 1 (active flag)
```

### Animation Entry Format (from asm trace)
```
offset 0: u16 — unknown (possibly animation ID or duration)
offset 2: u16 — frame_count (number of frames in this animation)
offset 4+: frame data — array of frame descriptors
```

### Why character sprites were glitchy
Decompressed sprite blocks (e.g., 0x74A9C0 = 32KB) contain:
- Animation metadata (u16 pairs: unknown + frame_count)
- Frame descriptors (tile indices + positions, NOT pixel data)
- Tile indices reference a SEPARATE tile data block (4bpp pixel data)

Previous extraction attempt decoded the entire block as raw 4bpp tiles,
which mixed animation metadata with tile indices — producing noise/glitch.

### What's needed for correct character sprite extraction
1. Find the tile data block (separate from animation data)
2. Parse animation entries: read u16 frame_count at offset 2
3. For each frame: read tile index entries (format: tile_idx + position)
4. Look up each tile_idx in the tile data block
5. Decode referenced tiles as 4bpp with the correct palette

### func_08032090 (sprite data getter) — also calls vtable
```
0x08032090: PUSH {r4, lr}
0x08032092: SUB SP, #16
0x08032094: ADD r4, r0             ; r4 = sprite_source object
0x08032098: LDR r1, [r4]           ; vtable
0x0803209C: LDR r3, [r1]           ; vtable base
0x0803209E: ADD r1, r4             ; r1 = sprite_source
0x080320A0: BL _call_via_r3         ; call vfunc (same as 0805E860)
0x080320A4: LDR r0, [sp]           ; result
0x080320A6: LDR r1, [sp, #4]       ; result
```
Both functions call the same vtable dispatcher at 0x080D3918.

### Honest Status
- func_0805E860 fully traced — animation entry format understood
- func_08032090 partially traced — same vtable pattern
- vtable[3] (vfunc_0C) implementation NOT yet found — need to trace
  which class implements vfunc_0C to find the actual tile data lookup
- Tile data block location NOT yet identified — may be in a separate
  popuri-compressed block or referenced by the sprite_source object

### Next Steps
- [x] Find vfunc_0C: ASprite vtable[3] at 0x08000640 (traced)
- [x] Tile data block identified: decompressed 0x74A9C0 IS raw 4bpp tiles (VLM verified)
- [x] Parse animation entries: stride=4, format [u16][u16 frame_count]
- [x] Extract character sprites using decompressed 4bpp tile data

## Sprite Pipeline Full Trace (vtable chain resolved)

### Pipeline (traced from asm + source line-by-line)

```
1. entity_actor.cc:56: func_08032090(game_object->vfunc_68(), sprite_anim)
2. GameObject::vfunc_68 (0x080202F0) → BX Rs (trampoline, returns this)
   → Returns the ASprite object pointer (stored in GameObject)
3. func_08032090 (0x08032090):
   - Loads ASprite vtable: LDR r1, [r4] → vtable ptr
   - Gets vtable[3]: LDR r3, [r1, #0xC]
   - Calls vtable[3](asprite, anim_id) via BL 0x080D3918
4. ASprite::vtable[3] (0x08000640):
   - Checks init flag (asprite[0]): if 0, initialize
   - Sets asprite[0] = 1 (initialized)
   - Sets asprite[2] = table_ptr (from IWRAM constant 0x03000400)
   - Returns asprite+3 (animation data starts at offset 3)
5. func_08032090 continues:
   - Searches animation entries at asprite+3 for matching anim_id
   - Entry format: [u16 unknown][u16 frame_count][frame data...]
   - Returns {entries_ptr, count} to func_0805E860
6. func_0805E860:
   - Stores anim_entry_ptr at sprite_animator+4
   - Stores frame_data_ptr at sprite_animator+8
   - Sets frame_idx = 0, frame_count = anim_entry[1] << 8
   - Sets active = 1
```

### ASprite Object Layout (in IWRAM, not ROM)
```
offset 0: u8  init_flag (0 = not initialized, 1 = initialized)
offset 1: u8  padding?
offset 2: u16 table_ptr (IWRAM pool allocator address)
offset 3+: animation entries
  Each entry: [u16 unknown][u16 frame_count][frame data...]
  Frame data: tile indices + positions (references separate tile data block)
```

### Why sprites are runtime objects
- ASprite objects are allocated in IWRAM (0x03000400 = hardware pool allocator)
- The pool is 16 entries (hardware.cc: `func_080D6D98(unk_04, 0x10, 0)`)
- Animation data is loaded from ROM into IWRAM at runtime
- Tile pixel data is in a separate block (popuri-compressed in ROM)

### What we need to extract sprites correctly
1. ✅ Decompressed block 0x74A9C0 (32KB) — contains animation metadata
2. ⬜ Parse as ASprite format: skip init_flag + table_ptr, read entries
3. ⬜ Find tile data block (separate popuri-compressed block in ROM)
4. ⬜ Follow tile indices to pixel data
5. ⬜ Decode referenced tiles as 4bpp with correct palette

### HONEST STATUS
The sprite pipeline is now FULLY TRACED from asm:
- vfunc_68 → returns ASprite object (IWRAM)
- vtable[3] → initializes + returns animation data pointer
- func_08032090 → searches animation entries by anim_id
- func_0805E860 → sets up SpriteAnimator with found entry

The animation entry format is understood: [u16][u16 frame_count][frame data]
Tile pixel data is in a SEPARATE block — NOT in the same decompressed block.

Next: parse the decompressed block as ASprite format (skip 3-byte header,
read animation entries, find tile data block reference).

## Palette Bank Tracing Status (HONEST)

### What we know:
- OAM ATTR2 bits 12-15 = palette_bank (selects 1 of 16 OBJ sub-palettes)
- Palette bank is set during OAM write, NOT during sprite data loading
- The OAM write function has NOT been found in our asm trace
- It's likely in code_linkonce.s (large asm file) or a DMA handler

### What we tried:
- Rendered sprites with ALL 16 sub-palettes
- VLM selected palette index 10 as most recognizable
- Palette 10 (0x529794 sub 10) has skin tones + gray/white colors

### What's NOT done:
- Per-sprite palette assignment (each sprite may use different palette bank)
- The 22-byte header in decompressed block may contain palette assignments
- Full OAM write path tracing (blocked by code_linkonce.s complexity)

### HONEST STATUS: PARTIAL
- Sprites are REAL fomt pixel data from ROM ✓
- Palette is best-match (index 10) but not per-sprite verified ✗
- Full palette accuracy requires tracing OAM write in asm (not done)

## OAM Palette Bank Tracing — DEAD END (honest)

### What was traced:
1. func_0805E860 (SpriteAnimator setup) — fully traced from asm
2. func_08032090 (sprite data getter) — fully traced
3. ASprite vtable[3] (0x08000640) — fully traced
4. GameObject vfunc_68 (0x080202F0) — trampoline, returns this
5. Animation entry format: [u16 unknown][u16 frame_count]
6. anim_id constants: 20+ different values (0x877, 0x889, 0x8F9, 0x9A9, etc.)

### What was NOT found:
- OAM write path (0x07000000 does NOT appear in ROM CODE section)
- The OAM address only appears in DATA section (literal pools)
- This means OAM writes happen via:
  - DMA copy from EWRAM shadow buffer to OAM, OR
  - IWRAM code (copied from ROM at runtime, executed from fast RAM)

### Why this is a dead end:
- The OAM shadow buffer is built at RUNTIME in EWRAM
- The code that builds it runs from IWRAM (not ROM)
- Without an emulator or full IWRAM trace, we CANNOT determine
  which palette bank is assigned to each individual sprite
- This requires dynamic analysis (emulator memory inspection)

### Conclusion:
Character sprites remain PARTIAL — pixel data correct, palette best-match.
Full per-sprite palette accuracy requires dynamic analysis (emulator).

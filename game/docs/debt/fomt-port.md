# fomt Web Port — Technical Debt

AnyPS5 methodology: "Every function at every stage either does exactly what
it's supposed to or throws an exception. Implement for every input, never
special-case a value seen in one title's trace."

## Silent stubs (functions that return without doing anything)

- None currently — all implemented functions perform their documented behavior.

## Unknown behavior (fomt source incomplete)

- **anim_id → sprite_index mapping**: Cannot be statically traced.
  The sprite block (gUnk_0874A9C0) is LZ77-compressed and decompressed
  to VRAM at runtime. Mapping requires dynamic analysis (emulator).
  Closes when: baserom.gba available for decompression + VRAM inspection.

- **Tool stamina costs**: Values (-2 for hoe/sickle/water, -3 for axe)
  are asm-derived, not from decompiled C++ source. The actual costs
  are passed as arguments to func_0800EA38 in asm.
  Closes when: func_0800EA38 callers fully traced in asm.

- **NPC schedule data**: ScheduleInfo addresses found (26 entries from asm),
  but actual schedule entry data (times, positions, paths) requires baserom.gba.
  NPCs use home positions as fallback.
  Closes when: baserom.gba available for ScheduleInfo data extraction.

- **Event script data**: 1328 event scripts exist in ROM (gUnk_080F89D4),
  but script bytecode cannot be extracted without baserom.gba.
  NPC dialogue uses heart-level-based generation instead.
  Closes when: baserom.gba available for script extraction.

## Partial implementations

- **Map system**: fomt has 66+ maps in MapData table (ROM 0x105EDC).
  Game uses single 40×30 map. Multiple maps not implemented.
  Closes when: Map transition system + MapData integration.

- **Livestock**: createCow/createSheep/createChicken exist but no barn/coop
  management UI or DayUpdate for animals.
  Closes when: Barn/Coop UI + Animal DayUpdate + ProductRank integration.

- **Sprite rendering**: NPC spriteId values are best-guess from extraction
  order, not verified from fomt source (anim_id → sprite mapping unknown).
  Closes when: Dynamic analysis with emulator.

- **Sound**: fomt m4a sound driver not ported (binary song data in ROM).
  Game uses .ogg files instead.
  Closes when: m4a driver ported or ROM song data extracted.

## Architecture (AnyPS5-style)

Unlike AnyPS5 (static relinking PS5→native), fomt port uses:
1. fomt decompiled C++ source → JavaScript (manual port, RULE 0)
2. GBA hardware layer → Canvas2D + WebAudio (native implementation)
3. No emulation — game logic runs directly in JS

Alternative approach (if baserom.gba available):
1. fomt ROM (ARM7TDMI) → C11 via gba-recomp static recompiler
2. C11 → WASM via emscripten
3. GBA hardware → JS library (PPU/Canvas, APU/WebAudio, input/keyboard)
4. No emulator — game runs as native WASM, calls JS for I/O

This approach would give 100% accuracy (same as AnyPS5 for PS5).

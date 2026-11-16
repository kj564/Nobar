# fomt Binary Architecture

## Binary
- File: baserom.gba
- SHA1: a2fc3574f0a65a4fcf7682fb274b9d7eebdef963
- Size: 8,388,608 bytes (8MB)
- Platform: Game Boy Advance (ARM7TDMI, Thumb mode)
- Game code: A4NEE9 (USA, Rev.00)

## Memory Map
| Address Range | Purpose |
|---------------|---------|
| 0x02000000-0x0203FFFF | EWRAM (256KB) |
| 0x03000000-0x03007FFF | IWRAM (32KB) |
| 0x05000000-0x050003FF | BG/OBJ Palette RAM |
| 0x06000000-0x06017FFF | VRAM (96KB) |
| 0x07000000-0x070003FF | OAM (1KB) |
| 0x08000000-0x09FFFFFF | Game Pak ROM |

## ROM Layout
| Start | End | Size | Classification |
|-------|-----|------|----------------|
| 0x08000000 | 0x080000C0 | 192B | GBA header |
| 0x080000C0 | 0x0800E000 | ~57KB | Game code (C++ + asm) |
| 0x0800E000 | 0x0813B288 | ~350KB | Data tables |
| 0x0813B288 | 0x0869B284 | ~5.5MB | Popuri-compressed data |
| 0x0869B284 | 0x086D6558 | ~248KB | Field/crop sprites |
| 0x0875C240 | 0x08800000 | ~660KB | ROM padding |

## Call Graph (key functions)
```
main → SceneMain → AScene::Run
  → AEntity::method_08032208 (physics tick)
    → func_080AC070 (collision check)
  → func_08034F00 (NPC schedule tick, NAKED asm)
    → func_080D7ECC (binary search schedule entries)
  → func_0805E860 (SpriteAnimator setup)
    → vtable[3] on ASprite (0x08000640)
  → func_08032090 (sprite data getter)
    → vtable[3] on ASprite
  → FieldPlot::DayUpdate (crop growth)
  → Npc::DayUpdate (friendship decay)
  → Bachelorette::DayUpdate (love decay)
```

## Data Structures (from decompiled source)
- GameDate: season:2 + day:5 (1 byte packed)
- GameTime: clock_hour:5 + clock_minute:6 (2 byte packed)
- MapData: packed_img, pal1/2, tiles1/2/3, terrain_info, terrain_map, width, height, is_interior
  NOTE: "not used yet in code" — decompiler hasn't reached map loading
- SpriteAnimator: STRUCT_PAD(0x00, 0x14) — opaque 20-byte, loads via vtable
- ASprite: init_flag(1B) + padding(1B) + table_ptr(2B) + animation_entries(variable)

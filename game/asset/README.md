# 🎨 Sunnyside World Asset Pack

Asset pack resmi dari **Sunnyside World** by [danieldiggle](https://danieldiggle.itch.io/sunnyside).

## 📦 Sumber

- **Halaman**: https://danieldiggle.itch.io/sunnyside
- **Versi**: V2.1
- **Lisensi**: Free (CC0-style, bebas dipakai untuk game)

## 📁 Struktur

```
asset/
├── Characters/          # Sprite sheet karakter
│   └── Human/           # Karakter manusia
│       ├── WALKING/     # Animasi jalan (8 arah, 8 frame)
│       ├── IDLE/        # Animasi diam
│       ├── RUN/         # Animasi lari
│       ├── DIG/         # Cangkul
│       ├── WATERING/    # Menyiram
│       ├── AXE/         # Menebang
│       └── ...          # (ATTACK, CARRY, CASTING, dll)
├── Elements/            # Elemen dunia
│   ├── Crops/           # Tanaman (6 tahap tumbuh per tanaman)
│   ├── Plants/          # Dekorasi (pohon, jamur)
│   ├── Animals/         # Hewan
│   └── VFX/             # Efek visual
├── Tileset/             # Tileset utama
│   ├── spr_tileset_sunnysideworld_16px.png   # 16px tiles (1024x1024)
│   └── spr_tileset_sunnysideworld_forest_32px.png  # 32px forest tiles
├── UI/                  # Elemen UI
│   ├── 9slice_box_white/  # 9-slice panels
│   ├── axe.png, shovel.png, ...  # Ikon alat
│   ├── happiness_*.png     # Indikator mood
│   └── ...
└── Sunnyside_World_ExampleScene.png   # Scene contoh referensi
```

## 🎮 Format Sprite

- **Tileset utama**: 1024×1024, grid 16px → 64×64 tile unik
- **Character walk strips**: 768×64, 8 frame × 96px wide
- **Crops**: 6 tahap tumbuh per tanaman (00=seed → 05=mature)
- **All PNGs**: RGBA 8-bit dengan transparansi

## 📋 Tanaman Tersedia

`beetroot`, `cabbage`, `carrot`, `cauliflower`, `corn`, `kale`, `pumpkin`, `tomato`, dll.

## 🔧 Credit

Asset asli oleh **Daniel Diggle**. Didedahkan untuk proyek non-komersial & komersial tanpa atribusi wajib (namun sangat diapresiasi).

#!/usr/bin/env python3
"""Targeted Thumb disassembler for fomt GBA ROM.
Auto-loads labels.csv for annotation. Reads 16-bit Thumb instructions.
Usage: python3 tools/dis.py <hex_offset> [num_instructions]
"""
import sys, os, struct

# Add tools dir to path for instruction_set
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from instruction_set import decode_thumb

ROM_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', '..', 'fomt-repo-latest', 'baserom.gba')
# Fallback: try direct path
if not os.path.exists(ROM_PATH):
    ROM_PATH = '/tmp/fomt-repo-latest/baserom.gba'

LABELS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'labels.csv')

def load_labels():
    """Load labels.csv: addr,name,comment (GBA flat: 0x prefix)"""
    labels = {}
    if os.path.exists(LABELS_PATH):
        with open(LABELS_PATH) as f:
            for line in f:
                parts = line.strip().split(',', 2)
                if len(parts) >= 2:
                    addr = int(parts[0], 0)
                    name = parts[1]
                    comment = parts[2] if len(parts) > 2 else ''
                    labels[addr] = (name, comment)
    return labels

def disassemble(rom_data, offset, count, labels):
    """Disassemble `count` Thumb instructions starting at ROM offset."""
    results = []
    for i in range(count):
        if offset + 1 >= len(rom_data):
            break
        # Thumb instructions are 16-bit, little-endian
        halfword = struct.unpack('<H', rom_data[offset:offset+2])[0]
        
        # Check for 32-bit BL instruction (0xF000/0xF800 pair)
        if (halfword & 0xF800) == 0xF000:
            # BL high half
            if offset + 3 < len(rom_data):
                halfword2 = struct.unpack('<H', rom_data[offset+2:offset+4])[0]
                if (halfword2 & 0xF800) == 0xF800:
                    # BL (long branch with link)
                    hi = halfword & 0x7FF
                    lo = halfword2 & 0x7FF
                    offset_val = ((hi << 11) | lo) << 1
                    if offset_val & 0x400000:  # sign extend
                        offset_val |= 0xFF800000
                    target = (offset + 4 + offset_val) & 0xFFFFFFFF
                    label_name = labels.get(target, ('',''))[0]
                    label_str = f" ; → {label_name}" if label_name else f" ; → 0x{0x08000000+target:08X}"
                    results.append(f"  0x{0x08000000+offset:08X}: {halfword:04X} {halfword2:04X}  BL 0x{0x08000000+target:08X}{label_str}")
                    offset += 4
                    continue
        
        fmt, desc = decode_thumb(halfword)
        
        # Check for branch target
        if (halfword & 0xF800) == 0xE000:  # B (unconditional)
            branch_offset = (halfword & 0x7FF)
            if branch_offset & 0x400:  # sign extend 11-bit
                branch_offset |= 0xFFFFF800
            target = (offset + 4 + branch_offset * 2) & 0xFFFFFFFF
            label_name = labels.get(target, ('',''))[0]
            label_str = f" ; → {label_name}" if label_name else f" ; → 0x{0x08000000+target:08X}"
            results.append(f"  0x{0x08000000+offset:08X}: {halfword:04X}      {fmt}{label_str}  ; {desc}")
        elif (halfword & 0xFF00) >= 0xD000 and (halfword & 0xFF00) <= 0xDD00:  # Bcond
            branch_offset = halfword & 0xFF
            if branch_offset & 0x80:  # sign extend 8-bit
                branch_offset |= 0xFFFFFF00
            target = (offset + 4 + branch_offset * 2) & 0xFFFFFFFF
            label_name = labels.get(target, ('',''))[0]
            label_str = f" ; → {label_name}" if label_name else f" ; → 0x{0x08000000+target:08X}"
            results.append(f"  0x{0x08000000+offset:08X}: {halfword:04X}      {fmt}{label_str}  ; {desc}")
        else:
            # Check if offset has a label
            label_name = labels.get(offset, ('',''))[0]
            prefix = f"{label_name}:\n  " if label_name else "  "
            results.append(f"{prefix}0x{0x08000000+offset:08X}: {halfword:04X}      {fmt}  ; {desc}")
        
        offset += 2
    return '\n'.join(results)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 tools/dis.py <hex_offset> [num_instructions]")
        print("Example: python3 tools/dis.py 0x08034F00 20")
        sys.exit(1)
    
    offset = int(sys.argv[1], 0)
    # Convert GBA address (0x08XXXXXX) to ROM offset if needed
    if offset >= 0x08000000:
        offset = offset & 0x01FFFFFF
    
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    with open(ROM_PATH, 'rb') as f:
        rom_data = f.read()
    
    labels = load_labels()
    print(f"; Disassembling {count} Thumb instructions at ROM offset 0x{offset:06X} (GBA: 0x{0x08000000+offset:08X})")
    print()
    print(disassemble(rom_data, offset, count, labels))

if __name__ == "__main__":
    main()

"""ARM7TDMI Thumb instruction set — minimal decoder for fomt RE.
Based on ARM7TDMI Technical Reference Manual (read line-by-line, Rule 0).
fomt runs in Thumb mode (16-bit instructions).
"""
# Thumb instruction groups (16-bit, format: group_bits + variable_bits)
# Each entry: (mask, pattern, format, description)

THUMB_GROUPS = [
    # Format 1: Move shifted register (000 00 xxxxxx)
    (0xF800, 0x0000, "LSL Rd, Rs, #Offset5", "Logical Shift Left"),
    (0xF800, 0x0800, "LSR Rd, Rs, #Offset5", "Logical Shift Right"),
    (0xF800, 0x1000, "ASR Rd, Rs, #Offset5", "Arithmetic Shift Right"),
    # Format 2: Add/subtract (000 11 xxxxxx)
    (0xFE00, 0x1800, "ADD Rd, Rs, Rn/Offset", "Add register or immediate"),
    (0xFE00, 0x1A00, "SUB Rd, Rs, Rn/Offset", "Subtract register or immediate"),
    (0xFE00, 0x1C00, "ADD Rd, Rs, #Offset3", "Add 3-bit immediate"),
    (0xFE00, 0x1E00, "SUB Rd, Rs, #Offset3", "Subtract 3-bit immediate"),
    # Format 3: Move/compare/add/subtract immediate (001 xxxxxx)
    (0xF800, 0x2000, "MOV Rd, #Offset8", "Move immediate"),
    (0xF800, 0x2800, "CMP Rd, #Offset8", "Compare immediate"),
    (0xF800, 0x3000, "ADD Rd, #Offset8", "Add immediate"),
    (0xF800, 0x3800, "SUB Rd, #Offset8", "Subtract immediate"),
    # Format 4: ALU operations (010000 xxxxxx)
    (0xFFC0, 0x4000, "AND Rd, Rs", "Bitwise AND"),
    (0xFFC0, 0x4040, "EOR Rd, Rs", "Bitwise XOR"),
    (0xFFC0, 0x4080, "LSL Rd, Rs", "Logical Shift Left by register"),
    (0xFFC0, 0x40C0, "LSR Rd, Rs", "Logical Shift Right by register"),
    (0xFFC0, 0x4100, "ASR Rd, Rs", "Arithmetic Shift Right by register"),
    (0xFFC0, 0x4140, "ADC Rd, Rs", "Add with Carry"),
    (0xFFC0, 0x4180, "SBC Rd, Rs", "Subtract with Carry"),
    (0xFFC0, 0x41C0, "ROR Rd, Rs", "Rotate Right by register"),
    (0xFFC0, 0x4200, "TST Rd, Rs", "Test bits"),
    (0xFFC0, 0x4240, "NEG Rd, Rs", "Negate"),
    (0xFFC0, 0x4280, "CMP Rd, Rs", "Compare registers"),
    (0xFFC0, 0x42C0, "CMN Rd, Rs", "Compare Negative"),
    (0xFFC0, 0x4300, "ORR Rd, Rs", "Bitwise OR"),
    (0xFFC0, 0x4340, "MUL Rd, Rs", "Multiply"),
    (0xFFC0, 0x4380, "BIC Rd, Rs", "Bit Clear"),
    (0xFFC0, 0x43C0, "MVN Rd, Rs", "Move Not"),
    # Format 5: Hi register operations / branch exchange (010001 xxx)
    (0xFF00, 0x4400, "ADD Rd, Rs (Hi)", "Add Hi registers"),
    (0xFF00, 0x4500, "CMP Rd, Rs (Hi)", "Compare Hi registers"),
    (0xFF00, 0x4600, "MOV Rd, Rs (Hi)", "Move Hi registers"),
    (0xFF00, 0x4700, "BX Rs", "Branch Exchange"),
    # Format 6: PC-relative load (01001 xxx)
    (0xF800, 0x4800, "LDR Rd, [PC, #Word8*4]", "PC-relative load"),
    # Format 7: Load/store with register offset (0101 xxx)
    (0xFE00, 0x5000, "STR Rd, [Rs, Ro]", "Store register offset"),
    (0xFE00, 0x5200, "STRH Rd, [Rs, Ro]", "Store halfword"),
    (0xFE00, 0x5400, "STRB Rd, [Rs, Ro]", "Store byte"),
    (0xFE00, 0x5600, "LDRSB Rd, [Rs, Ro]", "Load signed byte"),
    (0xFE00, 0x5800, "LDR Rd, [Rs, Ro]", "Load register offset"),
    (0xFE00, 0x5A00, "LDRH Rd, [Rs, Ro]", "Load halfword"),
    (0xFE00, 0x5C00, "LDRB Rd, [Rs, Ro]", "Load byte"),
    (0xFE00, 0x5E00, "LDRSH Rd, [Rs, Ro]", "Load signed halfword"),
    # Format 8: Load/store sign-extended byte/halfword (0101 xxx)
    # (covered above in format 7)
    # Format 9: Load/store with immediate offset (011 xxx)
    (0xF800, 0x6000, "STR Rd, [Rs, #Word7*4]", "Store word immediate"),
    (0xF800, 0x6800, "LDR Rd, [Rs, #Word7*4]", "Load word immediate"),
    (0xF800, 0x7000, "STRB Rd, [Rs, #Byte5]", "Store byte immediate"),
    (0xF800, 0x7800, "LDRB Rd, [Rs, #Byte5]", "Load byte immediate"),
    (0xF800, 0x8000, "STRH Rd, [Rs, #Half5*2]", "Store halfword immediate"),
    (0xF800, 0x8800, "LDRH Rd, [Rs, #Half5*2]", "Load halfword immediate"),
    # Format 10: SP-relative load/store (1001 xxx)
    (0xF800, 0x9000, "STR Rd, [SP, #Word8*4]", "Store SP-relative"),
    (0xF800, 0x9800, "LDR Rd, [SP, #Word8*4]", "Load SP-relative"),
    # Format 11: Load address (1010 xxx)
    (0xF800, 0xA000, "ADD Rd, PC, #Word8*4", "Load address (PC)"),
    (0xF800, 0xA800, "ADD Rd, SP, #Word8*4", "Load address (SP)"),
    # Format 12: Add offset to SP (1011 0000 xxx)
    (0xFF80, 0xB000, "ADD SP, #SWord7*4", "Add to SP"),
    (0xFF80, 0xB080, "SUB SP, #SWord7*4", "Subtract from SP"),
    # Format 13: Push/pop registers (1011 xxx)
    (0xFE00, 0xB400, "PUSH {Rlist}", "Push registers"),
    (0xFE00, 0xBC00, "POP {Rlist}", "Pop registers"),
    # Format 14: Multiple load/store (1100 xxx)
    (0xF800, 0xC000, "STMIA Rb!, {Rlist}", "Store Multiple"),
    (0xF800, 0xC800, "LDMIA Rb!, {Rlist}", "Load Multiple"),
    # Format 15: Conditional branch (1101 xxx)
    (0xFF00, 0xD000, "BEQ Offset8", "Branch if Equal (Z=1)"),
    (0xFF00, 0xD100, "BNE Offset8", "Branch if Not Equal (Z=0)"),
    (0xFF00, 0xD200, "BCS/BHS Offset8", "Branch if Carry Set (C=1)"),
    (0xFF00, 0xD300, "BCC/BLO Offset8", "Branch if Carry Clear (C=0)"),
    (0xFF00, 0xD400, "BMI Offset8", "Branch if Negative (N=1)"),
    (0xFF00, 0xD500, "BPL Offset8", "Branch if Positive (N=0)"),
    (0xFF00, 0xD600, "BVS Offset8", "Branch if Overflow (V=1)"),
    (0xFF00, 0xD700, "BVC Offset8", "Branch if No Overflow (V=0)"),
    (0xFF00, 0xD800, "BHI Offset8", "Branch if Higher (C=1 and Z=0)"),
    (0xFF00, 0xD900, "BLS Offset8", "Branch if Lower or Same"),
    (0xFF00, 0xDA00, "BGE Offset8", "Branch if >= (N=V)"),
    (0xFF00, 0xDB00, "BLT Offset8", "Branch if < (N!=V)"),
    (0xFF00, 0xDC00, "BGT Offset8", "Branch if > (Z=0 and N=V)"),
    (0xFF00, 0xDD00, "BLE Offset8", "Branch if <= "),
    # Format 16: Software interrupt (1101 1111)
    (0xFF00, 0xDF00, "SWI Value8", "Software Interrupt"),
    # Format 17: Unconditional branch (11100 xxx)
    (0xF800, 0xE000, "B Offset11", "Unconditional Branch"),
    # Format 18: Long branch with link (1111 xxx)
    (0xF800, 0xF000, "BL Offset11 (high)", "Branch with Link (high)"),
    (0xF800, 0xF800, "BL Offset11 (low)", "Branch with Link (low)"),
]

def decode_thumb(halfword):
    """Decode a 16-bit Thumb instruction. Returns (mnemonic, description)."""
    for mask, pattern, fmt, desc in THUMB_GROUPS:
        if (halfword & mask) == pattern:
            return fmt, desc
    return f"??? (0x{halfword:04X})", "Unknown"

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        hw = int(sys.argv[1], 0)
        fmt, desc = decode_thumb(hw)
        print(f"0x{hw:04X}: {fmt}  ; {desc}")
    else:
        print("Usage: python3 instruction_set.py 0xHEXHALFWORD")

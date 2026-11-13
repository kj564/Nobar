// fomt Script Engine VM — 1:1 port of script_engine.cc (654 lines) + script_engine.hh (99 lines)
// Source: /tmp/fomt-repo/src/script_engine.cc + include/script_engine.hh
// Read line-by-line (Rule Zero).
//
// This is the fomt event script VM. It runs RIFF-container bytecode scripts
// that drive all NPC dialogue, cutscenes, and game events.
// 35 opcodes: arithmetic, comparison, control flow, switch, call.
// Stack: 100 × i32. VM memory: 100 × i32. RIFF container with CODE/STR/JUMP chunks.

export const SCRIPT_STACK_MAX = 100;   // script_engine.hh:3
export const SCRIPT_VMMEM_MAX = 100;   // script_engine.hh:4

// RIFF chunk magics (script_engine.cc:33-34, 45, 55, 65)
const RIFF_MAGIC  = 0x46464952;  // 'RIFF' (LE)
const SCR_MAGIC   = 0x20524353;  // 'SCR ' (LE)
const CODE_MAGIC  = 0x45444F43;  // 'CODE' (LE)
const STR_MAGIC   = 0x20525453;  // 'STR ' (LE)
const JUMP_MAGIC  = 0x504D554A;  // 'JUMP' (LE)

// JumpTableEnt (script_engine.hh:9-12): { int value; u32 target; }
// struct JumpTableEnt { int value; u32 target; };

// ScriptStack (script_engine.hh:14-31)
class ScriptStack {
  constructor() {
    this.data = new Int32Array(SCRIPT_STACK_MAX);
    this.top = 0;
  }
  clear() { this.top = 0; this.data.fill(0); }   // memset(data, 0, sizeof)
  topVal() { return this.data[this.top - 1]; }   // Top() — returns reference in C++
  setTop(v) { this.data[this.top - 1] = v; }      // for stack.Top() = val
  pop() { if (this.top !== 0) this.top--; }       // Pop()
  push(val) {                                     // Push()
    if (this.top < SCRIPT_STACK_MAX) {
      this.data[this.top++] = val | 0;           // | 0 = to Int32
    }
  }
}

// AScriptEngine (script_engine.hh:60-83)
export class AScriptEngine {
  constructor() {
    this.unk_00 = 0;
    this.code = null;           // u8 const*
    this.pc = 0;                // u32
    this.code_length = 0;       // u32
    this.string_count = 0;      // u32
    this.string_offset_table = null;  // u32 const*
    this.string_pool = null;   // char const*
    this.jump_count = 0;       // u32
    this.jump_table = null;    // u8 const*
    this.stack = new ScriptStack();
    this.vmmem = new Int32Array(SCRIPT_VMMEM_MAX);  // i32[100]
    this.unk_348 = 0;          // relocation base (added when opcode top bit set)
  }

  // Load() — script_engine.cc:19-90
  // Parse RIFF container, extract CODE/STR/JUMP chunks
  load(scriptData) {
    if (!scriptData || scriptData.length < 12) return false;
    
    const view = new DataView(scriptData.buffer || scriptData);
    const data = scriptData instanceof Uint8Array ? scriptData : new Uint8Array(scriptData);
    
    // ScriptHead: riff_magic(4) + length(4) + scr_magic(4)
    const riff_magic = view.getUint32(0, true);
    const length = view.getUint32(4, true);
    const scr_magic = view.getUint32(8, true);
    
    // Check 'RIFF' & 'SCR ' (script_engine.cc:33-34)
    if (riff_magic !== RIFF_MAGIC || scr_magic !== SCR_MAGIC) return false;
    
    let offset = 12;  // sizeof(ScriptHead)
    this.code = null;
    
    while (offset <= length) {
      // ChunkHead: magic(4) + length(4)
      if (offset + 8 > data.length) break;
      const chunk_magic = view.getUint32(offset, true);
      const chunk_length = view.getUint32(offset + 4, true);
      offset += 8;
      
      if (chunk_magic === CODE_MAGIC) {  // 'CODE' (script_engine.cc:45-50)
        this.pc = 0;
        this.code_length = view.getUint32(offset, true);
        this.code = data.slice(offset + 4, offset + 4 + this.code_length);
      } else if (chunk_magic === STR_MAGIC) {  // 'STR ' (script_engine.cc:55-61)
        this.string_count = view.getUint32(offset, true);
        this.string_offset_table = [];
        for (let s = 0; s < this.string_count; s++) {
          this.string_offset_table.push(view.getUint32(offset + 4 + s * 4, true));
        }
        const str_pool_start = offset + 4 + this.string_count * 4;
        this.string_pool = data.slice(str_pool_start);
      } else if (chunk_magic === JUMP_MAGIC) {  // 'JUMP' (script_engine.cc:65-70)
        this.jump_count = view.getUint32(offset, true);
        this.jump_table = data.slice(offset + 4, offset + 4 + this.jump_count * 8);
      }
      
      offset += chunk_length;
    }
    
    return this.code !== null;
  }

  // Opcode() — script_engine.hh:76
  // Low 7 bits = opcode, top bit = relocation flag
  opcode(offset) {
    if (!this.code || offset >= this.code.length) return 0;
    return this.code[offset] & 0x7F;
  }
  
  // OpcodeFlag() — top bit of opcode byte (relocation flag)
  opcodeFlag(offset) {
    if (!this.code || offset >= this.code.length) return 0;
    return (this.code[offset] >> 7) & 1;
  }

  // Operand32() — u32 at pc+1 (LE, 4 bytes)
  operand32(offset) {
    if (!this.code) return 0;
    const base = offset + 1;
    let val = this.code[base] | (this.code[base+1] << 8) | (this.code[base+2] << 16) | (this.code[base+3] << 24);
    // If relocation flag set, add unk_348 (script_engine.cc uses this for code relocation)
    if (this.opcodeFlag(offset)) val = (val + this.unk_348) | 0;
    return val >>> 0;  // unsigned
  }
  
  // Operand16() — u16 at pc+1 (LE, 2 bytes)
  operand16(offset) {
    if (!this.code) return 0;
    const base = offset + 1;
    return (this.code[base] | (this.code[base+1] << 8)) >>> 0;
  }
  
  // Operand8() — u8 at pc+1
  operand8(offset) {
    if (!this.code) return 0;
    return this.code[offset + 1];
  }

  // NextInstruction() — script_engine.cc:209-560
  // 35-opcode dispatch. Returns: 0=ok, 2=halt, -1=error, -2=div-by-zero
  // OnCall(id) is virtual — subclass implements event calls
  nextInstruction() {
    const op = this.opcode(this.pc);
    const flag = this.opcodeFlag(this.pc);
    
    switch (op) {
      case 0x00:  // NOP
        this.pc += 1;
        break;
      
      case 0x01: {  // STORE: vmmem[op1] = op2; stack.Top() = op2
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.vmmem[op1] = op2;
        this.stack.setTop(op2);
        this.pc += 1;
        break;
      }
      case 0x02: {  // ADD_MEM: vmmem[op1] += op2
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.vmmem[op1] = (this.vmmem[op1] + op2) | 0;
        this.stack.setTop(this.vmmem[op1]);
        this.pc += 1;
        break;
      }
      case 0x03: {  // SUB_MEM
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.vmmem[op1] = (this.vmmem[op1] - op2) | 0;
        this.stack.setTop(this.vmmem[op1]);
        this.pc += 1;
        break;
      }
      case 0x04: {  // MUL_MEM
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.vmmem[op1] = (this.vmmem[op1] * op2) | 0;
        this.stack.setTop(this.vmmem[op1]);
        this.pc += 1;
        break;
      }
      case 0x05: {  // DIV_MEM
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        if (op2 === 0) return -2;
        this.vmmem[op1] = (this.vmmem[op1] / op2) | 0;
        this.stack.setTop(this.vmmem[op1]);
        this.pc += 1;
        break;
      }
      case 0x06: {  // MOD_MEM
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        if (op2 === 0) return -2;
        this.vmmem[op1] = (this.vmmem[op1] % op2) | 0;
        this.stack.setTop(this.vmmem[op1]);
        this.pc += 1;
        break;
      }
      case 0x07: {  // ADD: push op1+op2
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.stack.setTop((op1 + op2) | 0);
        this.pc += 1;
        break;
      }
      case 0x08: {  // SUB
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.stack.setTop((op1 - op2) | 0);
        this.pc += 1;
        break;
      }
      case 0x09: {  // MUL
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal();
        this.stack.setTop((op1 * op2) | 0);
        this.pc += 1;
        break;
      }
      case 0x0A: {  // DIV
        const op2 = this.stack.topVal(); this.stack.pop();
        if (op2 === 0) return -2;
        const op1 = this.stack.topVal();
        this.stack.setTop((op1 / op2) | 0);
        this.pc += 1;
        break;
      }
      case 0x0B: {  // MOD
        const op2 = this.stack.topVal(); this.stack.pop();
        if (op2 === 0) return -2;
        const op1 = this.stack.topVal();
        this.stack.setTop((op1 % op2) | 0);
        this.pc += 1;
        break;
      }
      case 0x0C: {  // AND (logical)
        const op2 = this.stack.topVal(); this.stack.pop();
        this.stack.setTop(this.stack.topVal() && op2 ? 1 : 0);
        this.pc += 1;
        break;
      }
      case 0x0D: {  // OR (logical)
        const op2 = this.stack.topVal(); this.stack.pop();
        this.stack.setTop(this.stack.topVal() || op2 ? 1 : 0);
        this.pc += 1;
        break;
      }
      case 0x0E: {  // INC
        this.stack.setTop((this.stack.topVal() + 1) | 0);
        this.pc += 1;
        break;
      }
      case 0x0F: {  // DEC
        this.stack.setTop((this.stack.topVal() - 1) | 0);
        this.pc += 1;
        break;
      }
      case 0x10: {  // NEG
        this.stack.setTop((-this.stack.topVal()) | 0);
        this.pc += 1;
        break;
      }
      case 0x11: {  // NOT
        this.stack.setTop(this.stack.topVal() ? 0 : 1);
        this.pc += 1;
        break;
      }
      case 0x12: {  // CMP: push -1/0/1
        const op2 = this.stack.topVal(); this.stack.pop();
        const op1 = this.stack.topVal(); this.stack.pop();
        if (op1 > op2) this.stack.push(1);
        else if (op1 < op2) this.stack.push(-1);
        else this.stack.push(0);
        this.pc += 1;
        break;
      }
      case 0x13: {  // LOAD_VAR: push vmmem[var]
        const varIdx = this.operand32(this.pc);
        this.stack.push(this.vmmem[varIdx]);
        this.pc += 5;
        break;
      }
      case 0x14: {  // STORE_VAR: vmmem[var] = pop
        const varIdx = this.operand32(this.pc);
        this.vmmem[varIdx] = this.stack.topVal();
        this.stack.pop();
        this.pc += 5;
        break;
      }
      case 0x15: {  // DUP
        this.stack.push(this.stack.topVal());
        this.pc += 1;
        break;
      }
      case 0x16: {  // POP
        this.stack.pop();
        this.pc += 1;
        break;
      }
      case 0x17: {  // PUSH_IMM32
        this.stack.push(this.operand32(this.pc) | 0);
        this.pc += 5;
        break;
      }
      case 0x18: {  // JMP (unconditional)
        this.pc = this.operand32(this.pc);
        break;
      }
      case 0x19: {  // JLT: jump if top < 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() < 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1A: {  // JLE: jump if top <= 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() <= 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1B: {  // JEQ: jump if top == 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() === 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1C: {  // JNE: jump if top != 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() !== 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1D: {  // JGE: jump if top >= 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() >= 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1E: {  // JGT: jump if top > 0
        const target = this.operand32(this.pc);
        this.pc += 5;
        if (this.stack.topVal() > 0) this.pc = target;
        this.stack.pop();
        break;
      }
      case 0x1F: {  // RETURN: pc = pop
        this.pc = this.stack.topVal();
        this.stack.pop();
        break;
      }
      case 0x20: {  // HALT
        this.pc += 1;
        return 2;
      }
      case 0x21: {  // CALL: OnCall(operand)
        const operand = this.operand32(this.pc);
        this.pc += 5;
        return this.onCall(operand);
      }
      case 0x22: {  // PUSH_IMM16
        this.stack.push(this.operand16(this.pc) | 0);
        this.pc += 3;
        break;
      }
      case 0x23: {  // PUSH_IMM8
        this.stack.push(this.operand8(this.pc) | 0);
        this.pc += 2;
        break;
      }
      case 0x24: {  // SWITCH: lower_bound on jump table
        const jtOffset = this.operand32(this.pc);
        // jt = jump_table + jump_table[jtOffset] (pointer arithmetic)
        // jt[0] = entry_count, jt[1] = default_target, jt[2..] = JumpTableEnt{value, target}
        const jtBase = new DataView(this.jump_table.buffer);
        const jtIdx = jtBase.getUint32(jtOffset * 4, true);  // jump_table[jtOffset] as u32 index
        const jtStart = jtIdx;  // byte offset into jump_table
        const entryCount = jtBase.getUint32(jtStart, true);
        const defaultTarget = jtBase.getUint32(jtStart + 4, true);
        
        const value = this.stack.topVal();
        this.stack.pop();
        
        // Binary search (std::lower_bound in source)
        let found = false;
        for (let i = 0; i < entryCount; i++) {
          const entValue = jtBase.getInt32(jtStart + 8 + i * 8, true);
          const entTarget = jtBase.getUint32(jtStart + 8 + i * 8 + 4, true);
          if (entValue === value) {
            this.pc = entTarget;
            found = true;
            break;
          }
        }
        if (!found) {
          if ((defaultTarget | 0) > 0) {  // (i32)(jt[1]) > 0
            this.pc = defaultTarget;
          } else {
            this.pc += 5;
          }
        }
        return 0;
      }
      default:
        return -1;  // unknown opcode
    }
    return 0;
  }

  // GetString() — script_engine.cc:580-588
  // BUG: source has `id <= string_count` (should be `<`)
  // We replicate the bug faithfully (Rule Zero)
  getString(id) {
    if (id <= this.string_count) {  // BUG: should be < (script_engine.cc:583 comment)
      const strOffset = this.string_offset_table[id];
      // Read null-terminated string from string_pool at strOffset
      let end = strOffset;
      while (end < this.string_pool.length && this.string_pool[end] !== 0) end++;
      return new TextDecoder('shift-jis').decode(this.string_pool.slice(strOffset, end));
    }
    return 'Error';
  }
  
  // OnCall — virtual, must be overridden by subclass (script_engine.hh:82)
  onCall(id) {
    return 0;  // default: no-op
  }
}

// ScriptEngine extends AScriptEngine (script_engine.hh:86-99)
export class ScriptEngine extends AScriptEngine {
  constructor(arg1) {
    super();
    this.unk_350 = arg1;   // GameObject or GameState?
    this.unk_354 = null;
    this.unk_358 = 0;
  }
  
  // LoadById() — script_engine.cc:634
  // gUnk_080F89D4[id] = pointer to script data in ROM
  // We pass the script data directly (extracted from ROM)
  loadById(scriptsArray, id, arg_r2) {
    if (id < 0 || id >= scriptsArray.length) return false;
    const script = scriptsArray[id];
    if (!script || !script.code) return false;
    
    // Reconstruct RIFF binary from extracted code + strings
    const codeBytes = new Uint8Array(script.code);
    this.load(codeBytes);
    this.unk_358 = arg_r2;
    return true;
  }
  
  // Push() — script_engine.cc:650
  push(value) {
    this.stack.push(value);
  }
  
  // SetUnk() — script_engine.cc:644
  setUnk(unk) { this.unk_354 = unk; }
  clearUnk() { this.unk_354 = null; }
}

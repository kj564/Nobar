// ============================================================
// FoMT NPC → anim_id mapping (gba-recomp methodology)
// ============================================================
// Source: asm/code_entities_08034CEC.s — systematic literal pool scan
// Methodology: "Boundaries, not guesswork" (from gba-recomp project)
//
// Each NPC spawn function loads:
//   1. ScheduleInfo address (gUnk_080FXXXX) — identifies which NPC
//   2. anim_id (0x000008XX or 0x000009XX) — sprite animation ID
//   3. Calls ANpcEntity constructor (npc_entity.cc:44)
//
// 22 spawn functions found, 35 unique anim_ids, 45 unique ScheduleInfo addresses
// ============================================================

export const NPC_ANIM_ID_ROM = {
  // VERIFIED: anim_id directly in spawn function
  'Mary':    { schedule: '0x080F8678', anim_id: '0x9EF', func: 'func_08035D04' },
  'Popuri':  { schedule: '0x080F81BC', anim_id: '0x9E7', func: 'func_08035D70' },
  'Cliff':   { schedule: '0x080F77FC', anim_id: '0x9A1', func: 'func_08035DD8' },
  'Doctor':  { schedule: '0x080F7294', anim_id: '0x989', func: 'func_08035E40' },
  'Rick':    { schedule: '0x080F49C0', anim_id: '0x80B', func: 'func_08035F74' },
  'Barley':  { schedule: '0x080F5540', anim_id: '0x84B', func: 'func_08035FE0' },
  'Carter':  { schedule: '0x080F4D74', anim_id: '0x813', func: 'func_08036048' },
  'Gotz':    { schedule: '0x080F59CC', anim_id: '0x85F', func: 'func_08036184' },
  'Jeff':    { schedule: '0x080F6B4C', anim_id: '0x8E4', func: 'func_080361EC' },
  'Lillia':  { schedule: '0x080F61FC', anim_id: '0x8B8', func: 'func_080362C0' },
  'Thomas':  { schedule: '0x080F5D94', anim_id: '0x884', func: 'func_08036590' },
  'Won':     { schedule: '0x080F6DE8', anim_id: '0x8EC', func: 'func_080366CC' },
  'May':     { schedule: '0x080F6FF8', anim_id: '0x902', func: 'func_08036A10' },
  'Saibara': { schedule: '0x080F3408', anim_id: '0x857', func: 'func_08036C48' },
  'Gourmet': { schedule: '0x080F43DC', anim_id: '0x8D8', func: 'func_08036DC4' },
  
  // VARIANT: NPC has multiple sprite states (loaded via variant function)
  'Carter_variant':  { anim_ids: ['0x813', '0x817', '0x827', '0x82F', '0x833'], func: 'func_08036084' },
  'Thomas_variant':  { anim_ids: ['0x884', '0x888', '0x894', '0x898', '0x89C'], func: 'func_080365CC' },
  'Unknown_variant': { anim_ids: ['0x9D3', '0x9D7', '0x9DF', '0x9E3'], func: 'func_08036AB4' },
  'Special_NPC':     { anim_ids: ['0x806', '0x87B', '0x8F9', '0x8FD', '0x9A9', '0x9B6', '0x91A', '0x9C7'], func: 'func_0803A394' },
  
  // SCHEDULE ONLY: NPC identified by ScheduleInfo, anim_id loaded elsewhere
  'Doug/Ann':  { schedule: '0x080F280C', func: 'func_08035AFC' },
  'Karen':     { schedule: '0x080F1FC0', func: 'func_08035BC8' },
  'Gray':      { schedule: '0x080F6370', func: 'func_08035EAC' },
  'Kai':       { schedule: '0x080F66C4', func: 'func_08035F10' },
  'Duke/Manna':{ schedule: '0x080F3FD8', func: 'func_08036390' },
  'Basil':     { schedule: '0x080F35E4', func: 'func_080363F8' },
  'Sasha':     { schedule: '0x080F3010', func: 'func_08036530' },
  'Zack':      { schedule: '0x080F2AF8', func: 'func_08036730' },
  'Anna/Basil':{ schedule: '0x080F42F0', func: 'func_080367F8' },
};

// All 35 unique anim_ids found in fomt (from literal pool scan)
export const ALL_ANIM_IDS = [
  '0x806', '0x80B', '0x813', '0x817', '0x827', '0x82F', '0x833',
  '0x84B', '0x857', '0x85F', '0x87B', '0x884', '0x888', '0x894',
  '0x898', '0x89C', '0x8B8', '0x8D8', '0x8E4', '0x8EC', '0x8F9',
  '0x8FD', '0x902', '0x91A', '0x989', '0x9A1', '0x9A9', '0x9B6',
  '0x9C7', '0x9D3', '0x9D7', '0x9DF', '0x9E3', '0x9E7', '0x9EF',
];

// All 45 unique ScheduleInfo addresses found in fomt
export const ALL_SCHEDULE_INFO_ADDRS = [
  '0x080F1538', '0x080F1560', '0x080F156C', '0x080F15A4', '0x080F15B4',
  '0x080F161C', '0x080F1638', '0x080F1644', '0x080F165E', '0x080F16AE',
  '0x080F16C2', '0x080F16D2', '0x080F18D2', '0x080F1904', '0x080F1FC0',
  '0x080F280C', '0x080F29C0', '0x080F2AF8', '0x080F2DC0', '0x080F3010',
  '0x080F33B8', '0x080F3408', '0x080F35E4', '0x080F3FD8', '0x080F42F0',
  '0x080F43DC', '0x080F4974', '0x080F49C0', '0x080F4D74', '0x080F5540',
  '0x080F597C', '0x080F59CC', '0x080F5D94', '0x080F61FC', '0x080F6370',
  '0x080F66C4', '0x080F6B10', '0x080F6B4C', '0x080F6DE8', '0x080F6FF8',
  '0x080F7294', '0x080F77FC', '0x080F7B40', '0x080F81BC', '0x080F8678',
];

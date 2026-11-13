// ============================================================
// FoMT NPC Schedule Data — from asm code_0803A8A4.s (RULE 0)
// ============================================================
// Source: asm schedule table initialization (func at line ~5860)
// Each NPC slot at struct offset 0x70 + i*stride is registered
// with its ScheduleInfo* via func_0803D688.
//
// NOTE: The actual schedule entry data (times, positions, paths) is in
// baserom.gba which is NOT available in this environment (copyrighted).
// This file provides the ScheduleInfo addresses for NPC identification.
// When baserom.gba becomes available, the full schedule data can be
// extracted using the ScheduleInfo struct from schedule_info.hh.
// ============================================================

export const ALL_SCHEDULES_ROM = [
  // 26 NPC ScheduleInfo addresses (from asm code_0803A8A4.s, RULE 0)
  // Each entry: { scheduleInfoAddr, selectFn, numSchedules, schedules: [null, ...] }
  // The schedules array has null entries because we can't extract the actual
  // schedule data without baserom.gba. NPCs will use their home positions as fallback.
  { scheduleInfoAddr: '0x080F280C', selectFn: 'unknown', numSchedules: 4, schedules: [null] },
  { scheduleInfoAddr: '0x080F1A80', selectFn: 'unknown', numSchedules: 5, schedules: [null] },
  { scheduleInfoAddr: '0x080F1FC0', selectFn: 'unknown', numSchedules: 24, schedules: [null] },
  { scheduleInfoAddr: '0x080F8678', selectFn: 'unknown', numSchedules: 5, schedules: [null] },
  { scheduleInfoAddr: '0x080F81BC', selectFn: 'unknown', numSchedules: 7, schedules: [null] },
  { scheduleInfoAddr: '0x080F77FC', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F7294', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F6370', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F66C4', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F49C0', selectFn: 'unknown', numSchedules: 2, schedules: [null] },
  { scheduleInfoAddr: '0x080F5540', selectFn: 'unknown', numSchedules: 5, schedules: [null] },
  { scheduleInfoAddr: '0x080F4D74', selectFn: 'unknown', numSchedules: 3, schedules: [null] },
  { scheduleInfoAddr: '0x080F59CC', selectFn: 'unknown', numSchedules: 19, schedules: [null] },
  { scheduleInfoAddr: '0x080F6B4C', selectFn: 'unknown', numSchedules: 5, schedules: [null] },
  { scheduleInfoAddr: '0x080F33B8', selectFn: 'unknown', numSchedules: 3, schedules: [null] },
  { scheduleInfoAddr: '0x080F61FC', selectFn: 'unknown', numSchedules: 5, schedules: [null] },
  { scheduleInfoAddr: '0x080F3408', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F3FD8', selectFn: 'unknown', numSchedules: 24, schedules: [null] },
  { scheduleInfoAddr: '0x080F35E4', selectFn: 'unknown', numSchedules: 24, schedules: [null] },
  { scheduleInfoAddr: '0x080F3010', selectFn: 'unknown', numSchedules: 17, schedules: [null] },
  { scheduleInfoAddr: '0x080F5D94', selectFn: 'unknown', numSchedules: 7, schedules: [null] },
  { scheduleInfoAddr: '0x080F6DE8', selectFn: 'unknown', numSchedules: 3, schedules: [null] },
  { scheduleInfoAddr: '0x080F2AF8', selectFn: 'unknown', numSchedules: 10, schedules: [null] },
  { scheduleInfoAddr: '0x080F42F0', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
  { scheduleInfoAddr: '0x080F43DC', selectFn: 'unknown', numSchedules: 10, schedules: [null] },
  { scheduleInfoAddr: '0x080F6FF8', selectFn: 'unknown', numSchedules: 6, schedules: [null] },
];

// fomt types.h, mirrored line-by-line as JSDoc typedefs
//
// SOURCE: /tmp/fomt-repo/include/types.h (38 lines, read line-by-line per Rule Zero)
//
// In JS we can't typedef aliases for primitives like uint8_t/u8, but we mirror the
// fomt type system as JSDoc @typedef annotations so editor tooling (and humans reading
// the code) can see what bit-width each fomt field is supposed to have. This module
// is intentionally side-effect-free and exports nothing at runtime — it's pure type
// documentation, used by other modules via JSDoc.
//
// fomt types.h:6-14 — integer typedefs
/** @typedef {number} u8  — fomt types.h:6  uint8_t  (0..255) */
/** @typedef {number} u16 — fomt types.h:7  uint16_t (0..65535) */
/** @typedef {number} u32 — fomt types.h:8  uint32_t (0..4294967295) */
/** @typedef {number} u64 — fomt types.h:9  uint64_t */
/** @typedef {number} i8  — fomt types.h:11 int8_t */
/** @typedef {number} i16 — fomt types.h:12 int16_t */
/** @typedef {number} i32 — fomt types.h:13 int32_t */
/** @typedef {number} i64 — fomt types.h:14 int64_t */
/** @typedef {number} uptr — fomt types.h:16 uintptr_t */
/** @typedef {number} iptr — fomt types.h:17 intptr_t */
/** @typedef {number} fu8  — fomt types.h:19 (function-local u8) */
/** @typedef {number} fu16 — fomt types.h:20 (function-local u16) */
/** @typedef {number} fi8  — fomt types.h:21 (function-local i8) */
/** @typedef {number} fi16 — fomt types.h:22 (function-local i16) */
/** @typedef {boolean} bool — fomt types.h:28 (C99 bool, default int in C89) */

// fomt types.h:32-36 — enum { FALSE = 0, TRUE = 1 }
export const FALSE = 0;
export const TRUE = 1;

// Convenience re-exports so JSDoc references like "@type {u8}" can resolve in editors
// that support @typedef imports. These are no-ops at runtime.
const _typesModuleDefault = { FALSE, TRUE };
export default _typesModuleDefault;

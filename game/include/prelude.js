// fomt prelude.h, mirrored line-by-line as JS constants
//
// SOURCE: /tmp/fomt-repo/include/prelude.h (55 lines, read line-by-line per Rule Zero)
//
// fomt's prelude.h is a C-preprocessor header — it defines macros (ARRAY_COUNT,
// CONST_MIN, CONST_MAX, STRUCT_PAD, etc.) that get expanded at compile time. In JS we
// don't have a preprocessor, but we mirror these as plain functions and constants so
// that other modules can use the same vocabulary.

// fomt prelude.h:22 — `#define nullptr 0` (C++11 nullptr polyfill)
// In JS we have a real `null`, but fomt code uses 0 as nullptr in some bit-packed
// contexts. We keep the alias for documentation fidelity.
export const nullptr = null;

// fomt prelude.h:41 — `#define ARRAY_COUNT(array) (size_t)(sizeof(array) / sizeof((array)[0]))`
// JS equivalent: Array.isArray(x) ? x.length : Object.keys(x).length
export function ARRAY_COUNT(array) {
  if (Array.isArray(array)) return array.length;
  if (array && typeof array === 'object') return Object.keys(array).length;
  return 0;
}

// fomt prelude.h:43 — `#define CONST_MIN(a, b) (((a) < (b)) ? (a) : (b))`
export function CONST_MIN(a, b) { return a < b ? a : b; }

// fomt prelude.h:44 — `#define CONST_MAX(a, b) (((a) > (b)) ? (a) : (b))`
export function CONST_MAX(a, b) { return a > b ? a : b; }

// fomt prelude.h:46 — `#define STRUCT_PAD(from, to) unsigned char pad_##from[(to)-(from)]`
// In JS we don't have struct padding, but fomt relies on it for bit-exact struct layout.
// We mirror it as a documentation helper that returns the padding byte count.
export function STRUCT_PAD(from, to) { return Math.max(0, to - from); }

// fomt prelude.h:7-13 — EXTERN_C / EXTERN_C_END (C++ name mangling guards)
// No JS equivalent — these are documentation-only markers.
export const EXTERN_C = 'extern "C" {';
export const EXTERN_C_END = '}';

// fomt prelude.h:24-30 — compiler attribute macros (NAKED, ALIAS, SECTION, PACKED, ALIGN)
// No JS equivalents — preserved as documentation-only strings.
export const NAKED = '__attribute__((naked))';
export const ALIAS = (n) => `__attribute__((alias("${n}")))`;
export const SECTION = (n) => `__attribute__((section(${n})))`;
export const PACKED = '__attribute__((packed))';
export const ALIGN = (n) => `__attribute__((aligned(${n})))`;

// fomt prelude.h:33-39 — SHOULD_BE / SHOULD_NOT_BE (matching helper macros)
// In MODERN builds SHOULD_BE expands to its argument, SHOULD_NOT_BE expands to nothing.
// We default to MODERN behaviour so both helpers pass through their argument (no-op).
export function SHOULD_BE(term) { return term; }
export function SHOULD_NOT_BE(_term) { return undefined; }

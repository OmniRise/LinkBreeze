/**
 * Probe-only stub for `next/cache` (BURN-BACKLOG-4 3.2). revalidatePath
 * throws "Invariant: static generation store missing" outside a real Next
 * server; cache revalidation is framework runtime behavior, not API logic
 * (and is exercised in dev/prod boots). The probe intercepts the specifier
 * with this file: every OTHER export is the real module, only revalidatePath
 * / revalidateTag become no-ops so the handlers run to completion.
 */
globalThis.__LB_PROBE_REAL_CACHE = true;
let real;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- probe stub: CJS require of the real module is the point
  real = require("next/cache");
} finally {
  globalThis.__LB_PROBE_REAL_CACHE = false;
}

module.exports = {
  ...real,
  revalidatePath: () => {},
  revalidateTag: () => {},
};

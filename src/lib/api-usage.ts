/**
 * #4 E.4 — in-process API usage counters for the admin API key card.
 *
 * Follows the repo's in-memory precedent (src/lib/rate-limit.ts): zero DB
 * writes on the hot path, honest process-lifetime semantics ("today, since
 * server start"). Counters roll over on the local calendar-day change.
 *
 * Counted at the v1 gate:
 *   calls      every /api/v1 request the gate evaluated
 *   accepted   passed bearer auth (a real API call)
 *   authFails  missing/malformed/unknown/expired key (401)
 *   rateLimited refused by per-key or per-IP limits (429)
 *   demoBlocked accepted auth but demo mode blocked the mutation (403)
 * Server-side 5xx from handlers are not tracked here — they live in the
 * structured log stream (logError), which is the right home for them.
 */

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export interface ApiUsageSnapshot {
  date: string;
  calls: number;
  accepted: number;
  authFails: number;
  rateLimited: number;
  demoBlocked: number;
}

let bucket: ApiUsageSnapshot = fresh();

function fresh(): ApiUsageSnapshot {
  return {
    date: dayKey(new Date()),
    calls: 0,
    accepted: 0,
    authFails: 0,
    rateLimited: 0,
    demoBlocked: 0,
  };
}

export type ApiUsageOutcome =
  | "accepted"
  | "authFails"
  | "rateLimited"
  | "demoBlocked";

/** Record one gate decision. Rolls the day bucket over transparently. */
export function recordApiUsage(outcome: ApiUsageOutcome): void {
  const today = dayKey(new Date());
  if (bucket.date !== today) bucket = fresh();
  bucket.calls += 1;
  bucket[outcome] += 1;
}

/** Current day's counters (rollover applied). */
export function getApiUsage(): ApiUsageSnapshot {
  const today = dayKey(new Date());
  if (bucket.date !== today) bucket = fresh();
  return { ...bucket };
}

/** Test hook: reset counters (process-local, like rate-limit's map). */
export function resetApiUsage(): void {
  bucket = fresh();
}

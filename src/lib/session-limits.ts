/**
 * Session lifetime resolution (#124 follow-up). Three layers, most specific
 * wins: per-user override → per-role columns → global KV defaults → built-in
 * defaults. Values must be positive integers to count; anything else (null,
 * 0, negative, NaN) is treated as "not set" at that layer.
 */

/** Built-in defaults: idle 7 days, absolute 90 days. */
export const DEFAULT_IDLE_MINUTES = 60 * 24 * 7;
export const DEFAULT_MAX_HOURS = 24 * 90;

export interface SessionLimitSources {
  userIdleMinutes?: number | null;
  userMaxHours?: number | null;
  roleIdleMinutes?: number | null;
  roleMaxHours?: number | null;
  globalIdleMinutes?: number | null;
  globalMaxHours?: number | null;
}

export interface SessionLimits {
  idleMinutes: number;
  maxHours: number;
}

function valid(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export function resolveSessionLimits(s: SessionLimitSources): SessionLimits {
  const idleMinutes = valid(s.userIdleMinutes)
    ? s.userIdleMinutes
    : valid(s.roleIdleMinutes)
      ? s.roleIdleMinutes
      : valid(s.globalIdleMinutes)
        ? s.globalIdleMinutes
        : DEFAULT_IDLE_MINUTES;
  const maxHours = valid(s.userMaxHours)
    ? s.userMaxHours
    : valid(s.roleMaxHours)
      ? s.roleMaxHours
      : valid(s.globalMaxHours)
        ? s.globalMaxHours
        : DEFAULT_MAX_HOURS;
  return { idleMinutes, maxHours };
}

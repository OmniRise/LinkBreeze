import { describe, expect, it } from "vitest";

import {
  DEFAULT_IDLE_MINUTES,
  DEFAULT_MAX_HOURS,
  resolveSessionLimits,
} from "@/lib/session-limits";

describe("resolveSessionLimits", () => {
  it("falls through to built-in defaults when nothing is set", () => {
    expect(resolveSessionLimits({})).toEqual({
      idleMinutes: DEFAULT_IDLE_MINUTES,
      maxHours: DEFAULT_MAX_HOURS,
    });
  });

  it("user override beats role beats global", () => {
    const r = resolveSessionLimits({
      globalIdleMinutes: 60,
      globalMaxHours: 24,
      roleIdleMinutes: 30,
      roleMaxHours: 12,
      userIdleMinutes: 5,
      userMaxHours: 2,
    });
    expect(r).toEqual({ idleMinutes: 5, maxHours: 2 });

    expect(resolveSessionLimits({ globalIdleMinutes: 60, roleIdleMinutes: 30 })).toEqual({
      idleMinutes: 30,
      maxHours: DEFAULT_MAX_HOURS,
    });
    expect(resolveSessionLimits({ globalMaxHours: 24 })).toEqual({
      idleMinutes: DEFAULT_IDLE_MINUTES,
      maxHours: 24,
    });
  });

  it("treats null/zero/negative/garbage as not-set at every layer", () => {
    expect(
      resolveSessionLimits({
        userIdleMinutes: 0,
        userMaxHours: -3,
        roleIdleMinutes: null,
        roleMaxHours: Number.NaN,
        globalIdleMinutes: undefined,
        globalMaxHours: null,
      }),
    ).toEqual({ idleMinutes: DEFAULT_IDLE_MINUTES, maxHours: DEFAULT_MAX_HOURS });
  });

  it("a null user override does not mask a real role value", () => {
    expect(resolveSessionLimits({ userIdleMinutes: null, roleIdleMinutes: 45 })).toEqual({
      idleMinutes: 45,
      maxHours: DEFAULT_MAX_HOURS,
    });
  });
});

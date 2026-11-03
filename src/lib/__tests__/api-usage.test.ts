/**
 * #4 E.4 — in-process API usage counters: counting, day rollover, snapshot
 * isolation, reset. Pure module, no db.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  recordApiUsage,
  getApiUsage,
  resetApiUsage,
} from "@/lib/api-usage";

beforeEach(() => {
  resetApiUsage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("api-usage counters", () => {
  it("counts each outcome and totals calls", () => {
    recordApiUsage("accepted");
    recordApiUsage("accepted");
    recordApiUsage("authFails");
    recordApiUsage("rateLimited");
    recordApiUsage("demoBlocked");

    const usage = getApiUsage();
    expect(usage.calls).toBe(5);
    expect(usage.accepted).toBe(2);
    expect(usage.authFails).toBe(1);
    expect(usage.rateLimited).toBe(1);
    expect(usage.demoBlocked).toBe(1);
  });

  it("returns a snapshot copy — mutating it cannot corrupt the counters", () => {
    recordApiUsage("accepted");
    const snap = getApiUsage();
    snap.calls = 999;
    expect(getApiUsage().calls).toBe(1);
  });

  it("rolls over when the local calendar day changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T10:00:00"));
    recordApiUsage("accepted");
    recordApiUsage("authFails");
    expect(getApiUsage().calls).toBe(2);

    vi.setSystemTime(new Date("2026-10-27T00:00:01"));
    const rolled = getApiUsage();
    expect(rolled.calls).toBe(0);
    expect(rolled.date).toBe("2026-10-27");

    recordApiUsage("accepted");
    expect(getApiUsage().accepted).toBe(1);
  });

  it("reset clears everything", () => {
    recordApiUsage("rateLimited");
    resetApiUsage();
    expect(getApiUsage().calls).toBe(0);
  });
});

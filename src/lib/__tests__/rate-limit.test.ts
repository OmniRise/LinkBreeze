import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  // The module uses a module-level Map, so we pick unique keys per test
  // to avoid cross-test interference.

  it("allows requests under the limit", () => {
    const key = "test-allow-" + Math.random();
    const r1 = rateLimit(key, 5, 60_000);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(4);

    const r2 = rateLimit(key, 5, 60_000);
    expect(r2.ok).toBe(true);
    expect(r2.remaining).toBe(3);
  });

  it("blocks requests once the limit is exceeded", () => {
    const key = "test-block-" + Math.random();
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);

    const r = rateLimit(key, 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("resets the window after the duration elapses", async () => {
    const key = "test-reset-" + Math.random();
    // Exhaust the limit with a short window (E.125: generous margins so a
    // loaded box can't starve the sleep below the window length)
    rateLimit(key, 1, 50); // 50ms window

    // Wait well past window expiry
    await new Promise((r) => setTimeout(r, 150));

    const r = rateLimit(key, 1, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it("returns a resetAt in the future", () => {
    const key = "test-resetat-" + Math.random();
    const now = Date.now();
    const r = rateLimit(key, 10, 5_000);
    expect(r.resetAt).toBeGreaterThan(now);
  });

  it("handles different keys independently", () => {
    const r1 = rateLimit("key-a-" + Math.random(), 1, 60_000);
    const r2 = rateLimit("key-b-" + Math.random(), 1, 60_000);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("E.27: resetAt is exactly now+windowMs and REFUSED calls never extend it", () => {
    const key = "test-honest-" + Math.random();
    const WINDOW = 5_000;
    const t0 = Date.now();
    const first = rateLimit(key, 2, WINDOW);
    expect(first.resetAt).toBeGreaterThanOrEqual(t0 + WINDOW);
    expect(first.resetAt).toBeLessThanOrEqual(Date.now() + WINDOW + 1);

    expect(rateLimit(key, 2, WINDOW).ok).toBe(true); // exactly `limit` allowed
    const trip = rateLimit(key, 2, WINDOW);
    expect(trip.ok).toBe(false); // the next one refused

    // Honesty: no refusal may push the window (and thus Retry-After) out.
    for (let i = 0; i < 5; i++) {
      const again = rateLimit(key, 2, WINDOW);
      expect(again.ok).toBe(false);
      expect(again.resetAt).toBe(trip.resetAt);
    }
  });

  it("E.123: remaining walks limit-1 → 0; the LAST allowed reports 0, refusals floor at 0", () => {
    const key = "test-floor-" + Math.random();
    const limit = 5;
    const seen: number[] = [];
    for (let i = 0; i < limit; i++) {
      const r = rateLimit(key, limit, 60_000);
      expect(r.ok, `call ${i}`).toBe(true);
      expect(r.remaining, `call ${i}`).toBe(limit - 1 - i);
      seen.push(r.remaining);
    }
    expect(seen).toEqual([4, 3, 2, 1, 0]); // boundary: last allowed = 0, not -1

    const refused = rateLimit(key, limit, 60_000);
    expect(refused.ok).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.remaining).toBeGreaterThanOrEqual(0); // never negative, ever
  });

  it("E.27: after the window elapses the FULL budget returns", async () => {
    const key = "test-refill-" + Math.random();
    // E.125: 50ms windows + 150ms sleeps — the original 5ms/15ms margins
    // flaked once under full-suite load (timer starvation); 3× headroom here
    // so CPU saturation can't make the sleep land inside the window.
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 50).ok).toBe(true);
    expect(rateLimit(key, 3, 50).ok).toBe(false);

    await new Promise((r) => setTimeout(r, 150));

    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 50).ok).toBe(true);
    expect(rateLimit(key, 3, 50).ok).toBe(false);
  });
});

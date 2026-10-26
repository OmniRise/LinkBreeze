import { describe, expect, it } from "vitest";
import {
  deliverWithRetries,
  type DeliveryDeps,
} from "@/lib/notifications/runner";

function deps(
  fetchImpl: typeof fetch,
  overrides: Partial<DeliveryDeps> = {},
): DeliveryDeps & { attempts: unknown[] } {
  const attempts: unknown[] = [];
  return {
    fetchImpl,
    sleep: async () => {},
    onAttempt: (r) => attempts.push(r),
    ...overrides,
    attempts,
  };
}

function jsonResponse(status: number): Response {
  return new Response("{}", { status });
}

describe("deliverWithRetries", () => {
  it("succeeds on first attempt, no retries", async () => {
    let calls = 0;
    const d = deps(async () => {
      calls++;
      return jsonResponse(200);
    });
    const out = await deliverWithRetries(
      { url: "https://x", headers: {}, body: "hi" },
      d,
    );
    expect(out.ok).toBe(true);
    expect(calls).toBe(1);
    expect(d.attempts).toHaveLength(1);
  });

  it("retries on 500 then succeeds", async () => {
    const statuses = [500, 500, 200];
    const d = deps(async () => jsonResponse(statuses.shift() ?? 200), {
      sleep: async () => {},
    });
    const out = await deliverWithRetries(
      { url: "https://x", headers: {}, body: "hi" },
      d,
    );
    expect(out.ok).toBe(true);
    expect(out.attempts).toHaveLength(3);
    expect(out.attempts[0].httpStatus).toBe(500);
    expect(out.attempts[2].ok).toBe(true);
  });

  it("gives up after max attempts and reports every attempt", async () => {
    const d = deps(async () => jsonResponse(503), { backoffMs: [0, 0] });
    const out = await deliverWithRetries(
      { url: "https://x", headers: {}, body: "hi" },
      d,
    );
    expect(out.ok).toBe(false);
    expect(out.attempts).toHaveLength(3);
    expect(d.attempts).toHaveLength(3);
    expect(out.attempts.every((a) => a.httpStatus === 503)).toBe(true);
  });

  it("treats fetch rejection (timeout/DNS) as a failed attempt, never throws", async () => {
    const d = deps(async () => {
      throw new Error("network down");
    }, { backoffMs: [0, 0] });
    const out = await deliverWithRetries(
      { url: "https://x", headers: {}, body: "hi" },
      d,
    );
    expect(out.ok).toBe(false);
    expect(out.attempts[0].error).toBe("network down");
    expect(out.attempts[0].httpStatus).toBeNull();
  });

  it("waits between attempts using the backoff table", async () => {
    const waits: number[] = [];
    const d = deps(async () => jsonResponse(500), {
      backoffMs: [200, 800],
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await deliverWithRetries({ url: "https://x", headers: {}, body: "hi" }, d);
    expect(waits).toEqual([200, 800]);
  });
});

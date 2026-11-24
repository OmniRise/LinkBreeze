/**
 * GHSA-cw7j-6vgv-v6jv regression — /api/subscribers/clear is
 * instance-admin-only AND demo-blocked (a read-only demo must never lose
 * its subscriber data). Pins: demo block first, then no session → 401,
 * non-admin Member → 403 without wiping, admin → wiped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  gate: vi.fn(),
  clear: vi.fn(async () => {}),
}));

vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/server/access", () => ({
  requireInstanceAdminOrThrow: mocks.gate,
}));
vi.mock("@/server/queries", () => ({
  clearSubscribers: mocks.clear,
}));

import { DELETE } from "@/app/api/subscribers/clear/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.gate.mockResolvedValue(undefined);
});

describe("DELETE /api/subscribers/clear — instance-admin gate", () => {
  it("demo mode blocks before the gate runs", async () => {
    mocks.demoBlock.mockReturnValue("Read-only demo");
    const res = await DELETE();
    expect(res.status).toBe(403);
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    mocks.gate.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE();
    expect(res.status).toBe(401);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("403s a non-admin Member without wiping", async () => {
    mocks.gate.mockRejectedValue(new Error("Forbidden"));
    const res = await DELETE();
    expect(res.status).toBe(403);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("an admin wipes the list", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
});

/**
 * GHSA-cw7j-6vgv-v6jv regression — /api/subscribers/export is
 * instance-admin-only. Subscriber emails are instance-wide; a session-only
 * check let any Member export every address collected across the instance.
 * These tests pin the route gate: no session → 401, non-admin Member → 403,
 * admin → the CSV. (Exported server action exportBackupPayload additionally
 * self-defends; that contract lives in the data-actions tests.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  rows: vi.fn(async (): Promise<Record<string, string | null>[]> => []),
}));

vi.mock("@/server/access", () => ({
  requireInstanceAdminOrThrow: mocks.gate,
}));
vi.mock("@/server/queries", () => ({
  getAllSubscribers: mocks.rows,
}));

import { GET } from "@/app/api/subscribers/export/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(undefined);
});

describe("GET /api/subscribers/export — instance-admin gate", () => {
  it("401s without a session", async () => {
    mocks.gate.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it("403s a non-admin Member without exporting", async () => {
    mocks.gate.mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it("an admin gets the CSV with header, rows and no-store", async () => {
    mocks.rows.mockResolvedValue([
      { email: "a@x.com", createdAt: "2026-11-20 10:00:00", consentAt: null, consentText: null },
      { email: "b@x.com", createdAt: "2026-11-21 11:30:00", consentAt: "2026-11-21 11:31:00", consentText: "ok" },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.split("\n")[0]).toBe("email,subscribed_at,consent_at,consent_text");
    expect(body).toContain("a@x.com");
    expect(body).toContain("b@x.com");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-disposition")).toContain("linkbreeze-subscribers-");
  });
});

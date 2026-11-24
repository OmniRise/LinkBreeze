/**
 * GHSA-cw7j-6vgv-v6jv regression — /api/backup is instance-admin-only. The
 * payload carries every page's config plus the raw settings KV (API-key
 * hash/prefix, OIDC config), which no Member may read; a session-only check
 * let members pass. The route additionally calls the SELF-DEFENDING
 * exportBackupPayload action (defense-in-depth in depth: both layers gate).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  payload: vi.fn(async () => ({
    version: 1,
    exportedAt: "2026-11-23T12:00:00.000Z",
    pages: [],
    settings: { apiKeyHash: "secret-hash" },
  })),
}));

vi.mock("@/server/access", () => ({
  requireInstanceAdminOrThrow: mocks.gate,
}));
vi.mock("@/server/actions/data", () => ({
  exportBackupPayload: mocks.payload,
}));

import { GET } from "@/app/api/backup/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(undefined);
});

describe("GET /api/backup — instance-admin gate", () => {
  it("401s without a session", async () => {
    mocks.gate.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.payload).not.toHaveBeenCalled();
  });

  it("403s a non-admin Member without exposing the payload", async () => {
    mocks.gate.mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.payload).not.toHaveBeenCalled();
  });

  it("an admin gets the JSON payload as a dated download", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; settings: Record<string, string> };
    expect(body.version).toBe(1);
    expect(body.settings.apiKeyHash).toBe("secret-hash");
    expect(res.headers.get("content-disposition")).toContain("linkbreeze-backup-2026-11-23");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

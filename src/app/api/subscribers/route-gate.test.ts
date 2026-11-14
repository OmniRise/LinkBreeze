/**
 * Regression tests for a #124-class authorization gap (GHSA-cw7j-6vgv-v6jv):
 * instance-wide surfaces — subscriber export/clear, the config-backup
 * download and the onboarding theme switch — must gate on the role ROW
 * (requireInstanceAdminOrThrow), not a bare session check. A Member with a
 * valid session must never read subscriber PII, wipe the list, download the
 * backup payload or switch the instance theme.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async (): Promise<void> => {}),
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async () => ({ userId: 1 })),
  getAllSubscribers: vi.fn(async () => [] as unknown[]),
  clearSubscribers: vi.fn(async () => {}),
  exportBackupPayload: vi.fn(async () => ({
    exportedAt: "2026-11-14T00:00:00.000Z",
  })),
  setActiveTheme: vi.fn(async () => {}),
}));

vi.mock("@/server/access", () => ({ requireInstanceAdminOrThrow: mocks.gate }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/queries", () => ({
  getAllSubscribers: mocks.getAllSubscribers,
  clearSubscribers: mocks.clearSubscribers,
  setActiveTheme: mocks.setActiveTheme,
  updateProfile: vi.fn(async () => {}),
  updateSetting: vi.fn(async () => {}),
  getDefaultPage: vi.fn(async () => ({ id: 1 })),
  updatePage: vi.fn(async () => {}),
}));
vi.mock("@/server/actions/data", () => ({
  exportBackupPayload: mocks.exportBackupPayload,
}));

import { GET as exportGET } from "@/app/api/subscribers/export/route";
import { DELETE as clearDELETE } from "@/app/api/subscribers/clear/route";
import { GET as backupGET } from "@/app/api/backup/route";
import { PUT as onboardingPUT } from "@/app/api/onboarding/route";

const putRequest = (themeId: number) =>
  new NextRequest("http://localhost/api/onboarding", {
    method: "PUT",
    body: JSON.stringify({ themeId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("subscriber routes — instance-admin gate", () => {
  it("export returns 403 for a non-admin member and never reads subscribers", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await exportGET();
    expect(res.status).toBe(403);
    expect(mocks.getAllSubscribers).not.toHaveBeenCalled();
  });

  it("clear returns 403 for a non-admin member and never clears subscribers", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await clearDELETE();
    expect(res.status).toBe(403);
    expect(mocks.clearSubscribers).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("Unauthorized"));
    mocks.gate.mockRejectedValueOnce(new Error("Unauthorized"));
    mocks.gate.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await exportGET()).status).toBe(401);
    expect((await clearDELETE()).status).toBe(401);
    expect((await backupGET()).status).toBe(401);
  });

  it("clears nothing in demo mode, even for an admin", async () => {
    mocks.demoBlock.mockReturnValueOnce("This is a read-only demo.");
    const res = await clearDELETE();
    expect(res.status).toBe(403);
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.clearSubscribers).not.toHaveBeenCalled();
  });

  it("allows an instance admin", async () => {
    expect((await exportGET()).status).toBe(200);
    expect((await clearDELETE()).status).toBe(200);
    expect((await backupGET()).status).toBe(200);
    expect(mocks.clearSubscribers).toHaveBeenCalledOnce();
    expect(mocks.exportBackupPayload).toHaveBeenCalledOnce();
  });
});

describe("onboarding PUT — instance-admin gate", () => {
  it("returns 403 for a non-admin member and never switches the theme", async () => {
    mocks.gate.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await onboardingPUT(putRequest(2));
    expect(res.status).toBe(403);
    expect(mocks.setActiveTheme).not.toHaveBeenCalled();
  });

  it("switches the theme for an instance admin", async () => {
    const res = await onboardingPUT(putRequest(2));
    expect(res.status).toBe(200);
    expect(mocks.setActiveTheme).toHaveBeenCalledWith(2);
  });
});

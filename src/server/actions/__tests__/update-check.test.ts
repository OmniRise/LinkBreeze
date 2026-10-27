import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  checkForUpdates: vi.fn(async () => ({ upToDate: true, latestVersion: "1.5.0" })),
  getUpdateStatus: vi.fn(async () => ({ github: { version: "1.5.0" }, website: { version: "1.5.0" } })),
  setUpdateCheckEnabled: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/lib/update-check", () => ({
  checkForUpdates: mocks.checkForUpdates,
  getUpdateStatus: mocks.getUpdateStatus,
  setUpdateCheckEnabled: mocks.setUpdateCheckEnabled,
}));

import { refreshUpdateCheck, refreshUpdateStatus, toggleUpdateCheck } from "@/server/actions/update-check";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
});

const DEMO_MESSAGE = "This is a read-only demo. Deploy your own instance to make changes.";

describe("update-check actions", () => {
  it("refreshUpdateCheck bypasses the cache when authenticated", async () => {
    await refreshUpdateCheck();
    expect(mocks.checkForUpdates).toHaveBeenCalledWith(true);
  });

  it("refreshUpdateStatus bypasses the cache when authenticated", async () => {
    await refreshUpdateStatus();
    expect(mocks.getUpdateStatus).toHaveBeenCalledWith(true);
  });

  it("toggleUpdateCheck persists when authenticated", async () => {
    await toggleUpdateCheck(false);
    expect(mocks.setUpdateCheckEnabled).toHaveBeenCalledWith(false);
  });

  it("throws Unauthorized when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(refreshUpdateCheck()).rejects.toThrow("Unauthorized");
    await expect(refreshUpdateStatus()).rejects.toThrow("Unauthorized");
    await expect(toggleUpdateCheck(true)).rejects.toThrow("Unauthorized");
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.getUpdateStatus).not.toHaveBeenCalled();
    expect(mocks.setUpdateCheckEnabled).not.toHaveBeenCalled();
  });

  it("blocks all three actions in demo mode BEFORE any session check or fetch", async () => {
    mocks.demoBlock.mockReturnValue("read-only");
    await expect(refreshUpdateCheck()).rejects.toThrow(DEMO_MESSAGE);
    await expect(refreshUpdateStatus()).rejects.toThrow(DEMO_MESSAGE);
    await expect(toggleUpdateCheck(true)).rejects.toThrow(DEMO_MESSAGE);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.getUpdateStatus).not.toHaveBeenCalled();
    expect(mocks.setUpdateCheckEnabled).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  updateSetting: vi.fn(async () => undefined),
  getSettings: vi.fn(async () => ({ slug: "linkbreeze", title: "Test" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  updateSetting: mocks.updateSetting,
  getSettings: mocks.getSettings,
  setActiveTheme: vi.fn(),
}));

import { updateSettings } from "@/server/actions/settings";

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
});

describe("updateSettings", () => {
  it("succeeds with valid settings", async () => {
    const res = await updateSettings(makeFormData({
      slug: "myprofile",
      title: "My Title",
      description: "My desc",
      footerText: "© 2026",
    }));
    expect(res.success).toBe(true);
    expect(mocks.updateSetting).toHaveBeenCalledWith("slug", "myprofile");
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await updateSettings(makeFormData({ slug: "test" }));
    expect(res.success).toBe(false);
  });

  it("rejects in demo mode", async () => {
    mocks.demoBlock.mockReturnValue("read-only");
    const res = await updateSettings(makeFormData({ slug: "test" }));
    expect(res.success).toBe(false);
  });

  it("rejects empty slug", async () => {
    const res = await updateSettings(makeFormData({ slug: "" }));
    expect(res.success).toBe(false);
  });

  it("rejects slug with invalid characters", async () => {
    const res = await updateSettings(makeFormData({ slug: "my profile!" }));
    expect(res.success).toBe(false);
  });

  it("accepts slug with hyphens and underscores", async () => {
    const res = await updateSettings(makeFormData({ slug: "my-profile_123" }));
    expect(res.success).toBe(true);
  });

  it("calls revalidatePath after success", async () => {
    await updateSettings(makeFormData({ slug: "test" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });
});

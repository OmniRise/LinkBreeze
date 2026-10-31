import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  updateProfileQuery: vi.fn(async () => undefined),
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
  updateProfile: mocks.updateProfileQuery,
}));

import { updateProfile } from "@/server/actions/profile";

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
});

describe("updateProfile", () => {
  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await updateProfile(fd({ displayName: "Test", bio: "" }));
    expect(res.success).toBe(false);
  });

  it("rejects in demo mode", async () => {
    mocks.demoBlock.mockReturnValue("Read-only");
    const res = await updateProfile(fd({ displayName: "Test", bio: "" }));
    expect(res.success).toBe(false);
  });

  it("updates with valid data", async () => {
    const res = await updateProfile(fd({ displayName: "My Name", bio: "My bio" }));
    expect(res.success).toBe(true);
    expect(mocks.updateProfileQuery).toHaveBeenCalledOnce();
  });

  it("rejects empty display name", async () => {
    const res = await updateProfile(fd({ displayName: "", bio: "" }));
    expect(res.success).toBe(false);
  });

  it("accepts social links JSON", async () => {
    const res = await updateProfile(fd({
      displayName: "Test",
      bio: "",
      socialLinks: JSON.stringify([{ platform: "github", url: "https://github.com/me" }]),
    }));
    expect(res.success).toBe(true);
  });

  it("gracefully handles invalid social links JSON", async () => {
    const res = await updateProfile(fd({
      displayName: "Test",
      bio: "",
      socialLinks: "not-valid-json",
    }));
    expect(res.success).toBe(true);
  });
});

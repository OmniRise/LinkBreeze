import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  setActiveTheme: vi.fn(async () => undefined),
  updateTheme: vi.fn(async () => undefined),
  getActiveTheme: vi.fn(async (): Promise<{ id: number; name: string } | null> => ({ id: 1, name: "Default" })),
  getThemeById: vi.fn(async (): Promise<{ id: number; name: string; isPreset: boolean } | null> => ({ id: 5, name: "My Theme", isPreset: false })),
  duplicateTheme: vi.fn(async (): Promise<{ id: number; name: string }> => ({ id: 42, name: "Copy" })),
  deleteTheme: vi.fn(async () => undefined),
  themeNameExists: vi.fn(async () => false),
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
  setActiveTheme: mocks.setActiveTheme,
  updateTheme: mocks.updateTheme,
  getActiveTheme: mocks.getActiveTheme,
  getThemeById: mocks.getThemeById,
  duplicateTheme: mocks.duplicateTheme,
  deleteTheme: mocks.deleteTheme,
  themeNameExists: mocks.themeNameExists,
}));

import { activateTheme, customizeActiveTheme, duplicateActiveTheme, deleteCustomTheme } from "@/server/actions/theme";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
  mocks.getActiveTheme.mockResolvedValue({ id: 1, name: "Default" });
  mocks.getThemeById.mockResolvedValue({ id: 5, name: "My Theme", isPreset: false });
  mocks.themeNameExists.mockResolvedValue(false);
});

describe("activateTheme", () => {
  it("activates a valid theme", async () => {
    const res = await activateTheme(2);
    expect(res.success).toBe(true);
  });

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await activateTheme(2);
    expect(res.success).toBe(false);
  });

  it("rejects NaN id", async () => {
    const res = await activateTheme(Number.NaN);
    expect(res.success).toBe(false);
  });
});

describe("customizeActiveTheme", () => {
  function fd(data: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(data)) f.set(k, v);
    return f;
  }

  it("updates theme with valid data", async () => {
    const res = await customizeActiveTheme(fd({ primaryColor: "#ff0000" }));
    expect(res.success).toBe(true);
    expect(mocks.updateTheme).toHaveBeenCalled();
  });

  it("rejects when no active theme", async () => {
    mocks.getActiveTheme.mockResolvedValue(null);
    const res = await customizeActiveTheme(fd({ primaryColor: "#ff0000" }));
    expect(res.success).toBe(false);
  });

  it("rejects invalid color", async () => {
    const res = await customizeActiveTheme(fd({ primaryColor: "not-a-color" }));
    expect(res.success).toBe(false);
  });
});

describe("duplicateActiveTheme", () => {
  it("duplicates with a valid name", async () => {
    const res = await duplicateActiveTheme("My Custom Theme");
    expect(res.success).toBe(true);
  });

  it("rejects empty name", async () => {
    const res = await duplicateActiveTheme("  ");
    expect(res.success).toBe(false);
  });

  it("rejects duplicate name", async () => {
    mocks.themeNameExists.mockResolvedValue(true);
    const res = await duplicateActiveTheme("Existing");
    expect(res.success).toBe(false);
  });
});

describe("deleteCustomTheme", () => {
  it("deletes a non-active custom theme", async () => {
    mocks.getActiveTheme.mockResolvedValue({ id: 1, name: "Default" });
    mocks.getThemeById.mockResolvedValue({ id: 5, name: "My Theme", isPreset: false });
    const res = await deleteCustomTheme(5);
    expect(res.success).toBe(true);
  });

  it("refuses to delete the active theme", async () => {
    mocks.getActiveTheme.mockResolvedValue({ id: 5, name: "Active" });
    const res = await deleteCustomTheme(5);
    expect(res.success).toBe(false);
  });

  it("refuses to delete a built-in preset theme", async () => {
    mocks.getActiveTheme.mockResolvedValue({ id: 1, name: "Default" });
    mocks.getThemeById.mockResolvedValue({ id: 9, name: "Aurora", isPreset: true });
    const res = await deleteCustomTheme(9);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Built-in themes cannot be deleted");
    expect(mocks.deleteTheme).not.toHaveBeenCalled();
  });

  it("refuses to delete a missing theme", async () => {
    mocks.getActiveTheme.mockResolvedValue({ id: 1, name: "Default" });
    mocks.getThemeById.mockResolvedValue(null);
    const res = await deleteCustomTheme(99);
    expect(res.success).toBe(false);
    expect(mocks.deleteTheme).not.toHaveBeenCalled();
  });
});

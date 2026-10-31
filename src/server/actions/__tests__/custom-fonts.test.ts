import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  writeFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
  insertCustomFont: vi.fn(async (): Promise<{ id: number }> => ({ id: 42 })),
  updateCustomFontFamily: vi.fn(async (): Promise<void> => undefined),
  getCustomFontById: vi.fn(async (): Promise<unknown> => null),
  getThemesUsingCustomFont: vi.fn(async (): Promise<unknown[]> => []),
  deleteCustomFont: vi.fn(async (): Promise<{ affectedThemes: string[] }> => ({ affectedThemes: [] })),
  getPagesUsingTheme: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/lib/uploads", async () => {
  const actual = await vi.importActual<typeof import("@/lib/uploads")>("@/lib/uploads");
  return {
    UPLOADS_DIR: "/tmp/test-uploads-lb-fonts",
    ensureUploadsDir: vi.fn(async () => undefined),
    sniffFontFormat: actual.sniffFontFormat,
  };
});
// writeFile/unlink must resolve to /tmp — but the action builds paths from
// UPLOADS_DIR, which is mocked above, so plain mocks are fine.
vi.mock("node:fs/promises", () => ({
  writeFile: mocks.writeFile,
  unlink: mocks.unlink,
}));
vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  insertCustomFont: mocks.insertCustomFont,
  updateCustomFontFamily: mocks.updateCustomFontFamily,
  getCustomFontById: mocks.getCustomFontById,
  getThemesUsingCustomFont: mocks.getThemesUsingCustomFont,
  deleteCustomFont: mocks.deleteCustomFont,
  getPagesUsingTheme: mocks.getPagesUsingTheme,
}));

import { uploadCustomFont, deleteCustomFontAction } from "@/server/actions/uploads";

/** Minimal valid woff2: wOF2 magic + padding, as an ArrayBuffer. */
function woff2Bytes(extra = 32): ArrayBuffer {
  const buf = new Uint8Array(4 + extra);
  buf.set([0x77, 0x4f, 0x46, 0x32], 0); // "wOF2"
  return buf.buffer as ArrayBuffer;
}

function fontFile(bytes: ArrayBuffer, name: string): File {
  return new File([bytes], name, { type: "font/woff2" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
});

describe("uploadCustomFont (#82)", () => {
  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("file", fontFile(woff2Bytes(), "brand.woff2"));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(false);
  });

  it("rejects when no file provided", async () => {
    const fd = new FormData();
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(false);
  });

  it("rejects an unsupported extension", async () => {
    const fd = new FormData();
    fd.set("file", fontFile(woff2Bytes(), "brand.ttf"));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(false);
  });

  it("rejects bytes that are not a font (PNG renamed to .woff2)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fd = new FormData();
    fd.set("file", fontFile(png.buffer as ArrayBuffer, "fake.woff2"));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(false);
    expect(res.success === false && res.error).toMatch(/not a valid font/i);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.insertCustomFont).not.toHaveBeenCalled();
  });

  it("rejects files over 2 MB", async () => {
    const fd = new FormData();
    // A real 2MB+ buffer: File.size is what the action checks.
    const big = new Uint8Array(2 * 1024 * 1024 + 100);
    big.set([0x77, 0x4f, 0x46, 0x32], 0);
    fd.set("file", fontFile(big.buffer as ArrayBuffer, "huge.woff2"));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(false);
    expect(res.success === false && res.error).toMatch(/too large/i);
  });

  it("accepts a valid woff2 and derives name + family from the row", async () => {
    mocks.insertCustomFont.mockResolvedValueOnce({ id: 42 });
    const fd = new FormData();
    fd.set("file", fontFile(woff2Bytes(), "brand-sans.woff2"));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.font.id).toBe(42);
      expect(res.font.family).toBe("LB Custom 42");
      // No display name supplied → derived from the filename.
      expect(res.font.name).toBe("brand sans");
      expect(res.font.url).toMatch(/\/api\/uploads\/[0-9a-f]{24}\.woff2$/);
    }
    expect(mocks.updateCustomFontFamily).toHaveBeenCalledWith(42, "LB Custom 42");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/theme");
  });

  it("honours a user-supplied display name", async () => {
    mocks.insertCustomFont.mockResolvedValueOnce({ id: 43 });
    const fd = new FormData();
    fd.set("file", fontFile(woff2Bytes(), "brand-sans.woff2"));
    fd.set("name", "Brand Sans");
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(true);
    if (res.success) expect(res.font.name).toBe("Brand Sans");
  });

  it("accepts woff1 files", async () => {
    mocks.insertCustomFont.mockResolvedValueOnce({ id: 44 });
    const woff1 = new Uint8Array(36);
    woff1.set([0x77, 0x4f, 0x46, 0x46], 0); // "wOFF"
    const fd = new FormData();
    fd.set("file", new File([woff1.buffer as ArrayBuffer], "old.woff", { type: "font/woff" }));
    const res = await uploadCustomFont(fd);
    expect(res.success).toBe(true);
    if (res.success) expect(res.font.format).toBe("woff");
  });
});

describe("deleteCustomFontAction (#82)", () => {
  const font = {
    id: 42,
    name: "Brand Sans",
    family: "LB Custom 42",
    filename: "brand-sans.woff2",
    url: "/api/uploads/deadbeef.woff2",
    sizeBytes: 2048,
    format: "woff2",
    createdAt: "2026-01-01 00:00:00",
  };

  it("rejects when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await deleteCustomFontAction(42);
    expect(res.success).toBe(false);
  });

  it("rejects an invalid id", async () => {
    const res = await deleteCustomFontAction(-1);
    expect(res.success).toBe(false);
  });

  it("rejects when the font does not exist", async () => {
    mocks.getCustomFontById.mockResolvedValueOnce(null);
    const res = await deleteCustomFontAction(42);
    expect(res.success).toBe(false);
  });

  it("deletes, unlinks the file, and revalidates affected pages", async () => {
    mocks.getCustomFontById.mockResolvedValueOnce(font);
    mocks.getThemesUsingCustomFont.mockResolvedValueOnce([{ id: 7, name: "Neon" }]);
    mocks.getPagesUsingTheme.mockResolvedValueOnce([{ id: 1, slug: "ada" }]);
    mocks.deleteCustomFont.mockResolvedValueOnce({ affectedThemes: ["Neon"] });

    const res = await deleteCustomFontAction(42);
    expect(res.success).toBe(true);
    if (res.success) expect(res.affectedThemes).toEqual(["Neon"]);
    expect(mocks.unlink).toHaveBeenCalledWith(expect.stringContaining("deadbeef.woff2"));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/theme");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ada");
  });

  it("survives a missing file on disk (best-effort unlink)", async () => {
    mocks.getCustomFontById.mockResolvedValueOnce(font);
    mocks.deleteCustomFont.mockResolvedValueOnce({ affectedThemes: [] });
    mocks.unlink.mockRejectedValueOnce(new Error("ENOENT"));

    const res = await deleteCustomFontAction(42);
    expect(res.success).toBe(true);
  });
});

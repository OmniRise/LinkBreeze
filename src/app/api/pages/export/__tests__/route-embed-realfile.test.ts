import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * E.35 — embed zip with a REAL uploads file on disk. Every other embed
 * test exercises the missing-file skip path; this proves the read path:
 * safeUploadPath + byte-exact copy into uploads/<name> inside the zip.
 *
 * UPLOADS_DIR is computed at module import, so the env var must be set
 * BEFORE the route module loads: resetModules + dynamic import.
 */

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/server/queries", () => ({
  getPageById: vi.fn(),
  getAllPages: vi.fn(),
  getActiveLinks: vi.fn(),
  getSectionsByPage: vi.fn(),
  getActiveTheme: vi.fn(),
  getThemeById: vi.fn(),
  getCustomFontById: vi.fn(),
}));

const AVATAR_BYTES = Buffer.from(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 64 }, (_, i) => (i * 7) % 256)],
);
const tempUploads = mkdtempSync(join(tmpdir(), "x80-uploads-"));
const origUploadDir = process.env.UPLOAD_DIR;

beforeAll(() => {
  mkdirSync(tempUploads, { recursive: true });
  writeFileSync(join(tempUploads, "avatar-real.png"), AVATAR_BYTES);
});

afterAll(() => {
  if (origUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = origUploadDir;
  rmSync(tempUploads, { recursive: true, force: true });
});

type ZipLocalEntry = { name: string; data: Buffer };
function readLocalEntries(buf: Buffer): ZipLocalEntry[] {
  const out: ZipLocalEntry[] = [];
  let off = 0;
  while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
    const dataStart = off + 30 + nameLen + extraLen;
    out.push({ name, data: buf.subarray(dataStart, dataStart + size) });
    off = dataStart + size;
  }
  return out;
}

describe("embed zip ships real uploads files (E.35)", () => {
  it("copies an on-disk avatar byte-identically into uploads/", async () => {
    process.env.UPLOAD_DIR = tempUploads;
    vi.resetModules();

    const { getSession: gs } = await import("@/lib/auth");
    const q = await import("@/server/queries");
    vi.mocked(gs).mockResolvedValue({ userId: 1, username: "jane" } as never);
    vi.mocked(q.getPageById).mockResolvedValue({
      id: 1,
      slug: "jane",
      title: "Jane",
      bio: null,
      themeId: null,
      avatarUrl: "/api/uploads/avatar-real.png",
      emailCapture: false,
      shareEnabled: false,
    } as never);
    vi.mocked(q.getActiveLinks).mockResolvedValue([]);
    vi.mocked(q.getSectionsByPage).mockResolvedValue([]);
    vi.mocked(q.getActiveTheme).mockResolvedValue(null);
    vi.mocked(q.getThemeById).mockResolvedValue(null);
    vi.mocked(q.getCustomFontById).mockResolvedValue(null);

    const { GET } = await import("@/app/api/pages/export/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages/export?id=1&embed=1", {
        headers: { host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");

    const entries = readLocalEntries(Buffer.from(await res.arrayBuffer()));
    const names = entries.map((e) => e.name);
    expect(names).toContain("jane.html");
    expect(names).toContain("uploads/avatar-real.png");
    const shipped = entries.find((e) => e.name === "uploads/avatar-real.png")!;
    expect(shipped.data.equals(AVATAR_BYTES)).toBe(true);
    // html references the bundled copy, not the instance endpoint
    const html = entries.find((e) => e.name === "jane.html")!.data.toString("utf8");
    expect(html).toContain("uploads/avatar-real.png");
    expect(html).not.toContain("/api/uploads/avatar-real.png");
  });
});

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * E.35/E.52 — embed zip with a REAL uploads file on disk. Every other
 * embed test exercises the missing-file skip path; these prove the read
 * path (safeUploadPath + byte-exact copy into uploads/<name>) for BOTH
 * the single and the BATCH (?all=1) upload-collection code paths.
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
const SECOND_BYTES = Buffer.from("second-file-contents-not-a-real-image");
const tempUploads = mkdtempSync(join(tmpdir(), "x80-uploads-"));
const origUploadDir = process.env.UPLOAD_DIR;

let GET: typeof import("@/app/api/pages/export/route")["GET"];
let auth: typeof import("@/lib/auth");
let q: typeof import("@/server/queries");

function mockQueries() {
  vi.mocked(auth.getSession).mockResolvedValue({ userId: 1, username: "jane" } as never);
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
  vi.mocked(q.getAllPages).mockResolvedValue([
    {
      id: 1,
      slug: "jane",
      title: "Jane",
      bio: null,
      themeId: null,
      avatarUrl: "/api/uploads/avatar-real.png",
      emailCapture: false,
      shareEnabled: false,
    },
    {
      id: 2,
      slug: "bob",
      title: "Bob",
      bio: null,
      themeId: null,
      avatarUrl: "/api/uploads/avatar-real.png",
      emailCapture: false,
      shareEnabled: false,
    },
  ] as never[]);
  vi.mocked(q.getActiveLinks).mockResolvedValue([]);
  vi.mocked(q.getSectionsByPage).mockResolvedValue([]);
  vi.mocked(q.getActiveTheme).mockResolvedValue(null);
  vi.mocked(q.getThemeById).mockResolvedValue(null);
  vi.mocked(q.getCustomFontById).mockResolvedValue(null);
}

beforeAll(async () => {
  mkdirSync(tempUploads, { recursive: true });
  writeFileSync(join(tempUploads, "avatar-real.png"), AVATAR_BYTES);
  writeFileSync(join(tempUploads, "second-file.txt"), SECOND_BYTES);
  process.env.UPLOAD_DIR = tempUploads;
  vi.resetModules();
  ({ GET } = await import("@/app/api/pages/export/route"));
  // re-import AFTER resetModules: these are the same mock instances the
  // freshly-loaded route module sees (static imports would be stale)
  auth = await import("@/lib/auth");
  q = await import("@/server/queries");
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

describe("embed zip ships real uploads files (E.35/E.52)", () => {
  it("single: copies an on-disk avatar byte-identically into uploads/", async () => {
    mockQueries();
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
    const html = entries.find((e) => e.name === "jane.html")!.data.toString("utf8");
    expect(html).toContain("uploads/avatar-real.png");
    expect(html).not.toContain("/api/uploads/avatar-real.png");
  });

  it("batch: ?all=1&embed=1 collects real files across MULTIPLE htmls (E.52)", async () => {
    mockQueries();
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages/export?all=1&embed=1", {
        headers: { host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");

    const entries = readLocalEntries(Buffer.from(await res.arrayBuffer()));
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain("jane.html");
    expect(names).toContain("bob.html");
    expect(names).toContain("uploads/avatar-real.png");
    // byte-exact through the batch path too
    const shipped = entries.find((e) => e.name === "uploads/avatar-real.png")!;
    expect(shipped.data.equals(AVATAR_BYTES)).toBe(true);
    // both htmls reference the bundled copy (dedup: one file, two refs)
    for (const page of ["jane.html", "bob.html"]) {
      const html = entries.find((e) => e.name === page)!.data.toString("utf8");
      expect(html).toContain("uploads/avatar-real.png");
      expect(html).not.toContain("/api/uploads/");
    }
  });

  it("batch: unreferenced files on disk are NOT bundled (collection is reference-driven)", async () => {
    mockQueries();
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages/export?all=1&embed=1", {
        headers: { host: "localhost:3000" },
      }),
    );
    const entries = readLocalEntries(Buffer.from(await res.arrayBuffer()));
    const names = entries.map((e) => e.name);
    // second-file.txt exists in the uploads dir but no html references it
    expect(names).not.toContain("uploads/second-file.txt");
    expect(names.filter((n) => n.startsWith("uploads/"))).toHaveLength(1);
  });

  it("10 pages × 10 distinct uploads files: all collected exactly once (E.82)", async () => {
    // one file per page — aggregation across htmls with DISTINCT refs
    const pages = Array.from({ length: 10 }, (_, i) => {
      const file = `sheet-${i + 1}.png`;
      writeFileSync(join(tempUploads, file), Buffer.from(`payload-${i + 1}`));
      return {
        id: i + 1,
        slug: `sheet-page-${i + 1}`,
        title: `Page ${i + 1}`,
        bio: null,
        themeId: null,
        avatarUrl: `/api/uploads/${file}`,
        emailCapture: false,
        shareEnabled: false,
      };
    }) as never[];
    vi.mocked(auth.getSession).mockResolvedValue({ userId: 1, username: "jane" } as never);
    vi.mocked(q.getAllPages).mockResolvedValue(pages);
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages/export?all=1&embed=1", {
        headers: { host: "localhost:3000" },
      }),
    );
    expect(res.status).toBe(200);
    const entries = readLocalEntries(Buffer.from(await res.arrayBuffer()));
    const uploadNames = entries
      .map((e) => e.name)
      .filter((n) => n.startsWith("uploads/"));
    expect(uploadNames.sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `uploads/sheet-${i + 1}.png`).sort(),
    );
    // byte-exact payloads, one entry each (no dupes, nothing dropped)
    for (let i = 1; i <= 10; i++) {
      const e = entries.find((x) => x.name === `uploads/sheet-${i}.png`)!;
      expect(e.data.toString("utf8")).toBe(`payload-${i}`);
    }
    expect(uploadNames.length).toBe(new Set(uploadNames).size);
  });
});

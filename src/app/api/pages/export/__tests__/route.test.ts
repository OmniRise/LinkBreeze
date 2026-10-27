import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/api/pages/export/route";

/**
 * E.8 — route contract tests for /api/pages/export.
 *
 * Auth + queries are mocked (actions-test convention): no real DB, no
 * fresh-checkout fragility. Pins the HTTP surface: auth gate, param
 * validation, not-found, both response formats (.html / .zip), the
 * Content-Disposition filenames, and the 413 size caps.
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

import { getSession } from "@/lib/auth";
import {
  getPageById,
  getAllPages,
  getActiveLinks,
  getSectionsByPage,
  getActiveTheme,
  getThemeById,
  getCustomFontById,
} from "@/server/queries";

const mockSession = vi.mocked(getSession);
const mockGetPageById = vi.mocked(getPageById);
const mockGetAllPages = vi.mocked(getAllPages);
const mockGetActiveLinks = vi.mocked(getActiveLinks);
const mockGetSections = vi.mocked(getSectionsByPage);
const mockGetActiveTheme = vi.mocked(getActiveTheme);
const mockGetThemeById = vi.mocked(getThemeById);
const mockGetCustomFont = vi.mocked(getCustomFontById);

const PAGE = {
  id: 1,
  slug: "jane",
  title: "Jane",
  bio: null,
  themeId: null,
  emailCapture: false,
  shareEnabled: false,
} as never;

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/pages/export${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ userId: 1, username: "jane" } as never);
  mockGetPageById.mockResolvedValue(PAGE);
  mockGetAllPages.mockResolvedValue([PAGE]);
  mockGetActiveLinks.mockResolvedValue([]);
  mockGetSections.mockResolvedValue([]);
  mockGetActiveTheme.mockResolvedValue(null);
  mockGetThemeById.mockResolvedValue(null);
  mockGetCustomFont.mockResolvedValue(null);
});

describe("GET /api/pages/export", () => {
  it("401 without a session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(401);
  });

  it("guard ordering: 401 fires before ANY data query (E.31)", async () => {
    // No enumeration without auth: the session guard must short-circuit
    // before a single page/link/theme row is read, in every variant.
    mockSession.mockResolvedValue(null);
    for (const q of ["?id=1", "?id=1&embed=1", "?all=1", "?all=1&embed=1"]) {
      const res = await GET(req(q));
      expect(res.status, q).toBe(401);
    }
    expect(mockGetPageById).not.toHaveBeenCalled();
    expect(mockGetAllPages).not.toHaveBeenCalled();
    expect(mockGetActiveLinks).not.toHaveBeenCalled();
    expect(mockGetSections).not.toHaveBeenCalled();
    expect(mockGetActiveTheme).not.toHaveBeenCalled();
    expect(mockGetThemeById).not.toHaveBeenCalled();
    expect(mockGetCustomFont).not.toHaveBeenCalled();
  });

  it("400 on malformed or missing id", async () => {
    for (const q of ["?id=abc", "?id=-1", "?id=0", ""]) {
      const res = await GET(req(q));
      expect(res.status, `query ${q || "(empty)"}`).toBe(400);
    }
  });

  it("404 for an unknown page id", async () => {
    mockGetPageById.mockResolvedValue(null);
    const res = await GET(req("?id=99"));
    expect(res.status).toBe(404);
  });

  it("guard precedence: 400 fires before the page lookup, 404 before any data read (E.41)", async () => {
    // malformed id must never reach the page table…
    const bad = await GET(req("?id=abc"));
    expect(bad.status).toBe(400);
    expect(mockGetPageById).not.toHaveBeenCalled();
    // …and a missing page must short-circuit before links/sections fetch
    mockGetPageById.mockResolvedValue(null);
    const missing = await GET(req("?id=99"));
    expect(missing.status).toBe(404);
    expect(mockGetActiveLinks).not.toHaveBeenCalled();
    expect(mockGetSections).not.toHaveBeenCalled();
    expect(mockGetActiveTheme).not.toHaveBeenCalled();
  });

  it("exports an UNPUBLISHED page too — admin-scoped, not public-scoped", async () => {
    // The public route 404s unpublished pages; the export route must not,
    // or admins could never snapshot drafts before publishing.
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      isPublished: false,
    } as never);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    expect((await res.text()).startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("200 single-page .html with attachment headers", async () => {
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="jane.html"',
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = await res.text();
    expect(body.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(body).toContain("Generated by LinkBreeze static export");
    expect(body).toContain("<title>Jane</title>");
  });

  it("unicode slug: Content-Disposition stays pure ASCII (E.42)", async () => {
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      slug: "日本語",
    } as never);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition")!;
    expect(cd).toBe('attachment; filename="page.html"');
    expect(/^[\x20-\x7e]*$/.test(cd)).toBe(true);
  });

  it("CRLF slug can never split the response headers (E.54)", async () => {
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      slug: "jane\r\nX-Injected: yes\r\n",
    } as never);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition")!;
    expect(cd).not.toMatch(/[\r\n]/);
    expect(cd).toBe('attachment; filename="janeX-Injectedyes.html"');
    // no smuggled header survived anywhere in the header block
    expect(res.headers.get("X-Injected")).toBeNull();
    expect([...res.headers.keys()].every((k) => !/[\r\n]/.test(k))).toBe(true);
  });

  it("404 when no pages exist for ?all=1", async () => {
    mockGetAllPages.mockResolvedValue([]);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(404);
  });

  it("?all=1 returns a zip with batch headers", async () => {
    const second = { ...(PAGE as object), id: 2, slug: "bob" } as never;
    mockGetAllPages.mockResolvedValue([PAGE, second]);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="linkbreeze-pages.zip"',
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32LE(0)).toBe(0x04034b50); // PK local header
  });

  it("batch aggregate cap: combined >25MiB → 413, no zip bytes ever built (E.51)", async () => {
    // Zip-bound decision (logged): batch zips use the 25 MiB bound, NOT
    // the 2 MiB single-file cap — 36 pages × ~750KB bios ≈ 27MiB combined
    const pages = Array.from({ length: 36 }, (_, i) => ({
      ...(PAGE as object),
      id: i + 1,
      slug: `big${i + 1}`,
      bio: "B".repeat(750 * 1024),
    })) as never[];
    mockGetAllPages.mockResolvedValue(pages);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toContain("25 MiB limit");
    expect(json.bytes).toBeGreaterThan(25 * 1024 * 1024);
    // proof createZip never produced output: no PK signature anywhere
    const raw = Buffer.from(
      new TextEncoder().encode(JSON.stringify(json)),
    );
    expect(raw.readUInt32LE(0)).not.toBe(0x04034b50);
  });

  it("one-page instance: ?all=1 still returns a one-entry zip (E.33)", async () => {
    mockGetAllPages.mockResolvedValue([PAGE]);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="linkbreeze-pages.zip"',
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    // exactly ONE local header — no silent fallback to a plain .html body
    let off = 0;
    let entries = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      entries++;
      off = off + 30 + nameLen + extraLen + size;
    }
    expect(entries).toBe(1);
  });

  it("two unicode-slug pages colliding in one batch → caf.html + caf-2.html (E.58)", async () => {
    mockGetAllPages.mockResolvedValue([
      { ...(PAGE as object), id: 1, slug: "café" },
      { ...(PAGE as object), id: 2, slug: "cafe" }, // different slug…
      { ...(PAGE as object), id: 3, slug: "café" }, // …but 1 & 3 collide
    ] as never[]);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    // parse entry names
    const names: string[] = [];
    let off = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      names.push(buf.subarray(off + 30, off + 30 + nameLen).toString("utf8"));
      off = off + 30 + nameLen + extraLen + size;
    }
    expect(names.sort()).toEqual(["cafe.html", "caf-2.html", "caf.html"].sort());
  });

  it("param handling: junk ignored, wrong-cased id strictly 400 (E.64)", async () => {
    // param names are case-sensitive — ?ID=1 is a MISSING id, not an id;
    // checked FIRST so getPageById call counts are still zero
    const wrongCase = await GET(req("?ID=1"));
    expect(wrongCase.status).toBe(400);
    expect(mockGetPageById).not.toHaveBeenCalled();
    // unknown params never break a valid export
    const junk = await GET(req("?id=1&junk=1&UTM=x"));
    expect(junk.status).toBe(200);
    expect(mockGetPageById).toHaveBeenCalledWith(1);
  });

  it("every error mode returns a parseable {error} JSON body (E.66)", async () => {
    const cases: Array<[string, number]> = [
      ["?id=abc", 400], // malformed
      ["?id=99", 404], // unknown page (getPageById→null below)
      ["?all=1", 404], // empty instance (getAllPages→[])
    ];
    mockGetPageById.mockResolvedValue(null);
    mockGetAllPages.mockResolvedValue([]);
    for (const [q, status] of cases) {
      const res = await GET(req(q));
      expect(res.status, q).toBe(status);
      const json = await res.json();
      expect(typeof json.error, q).toBe("string");
      expect(json.error.length, q).toBeGreaterThan(0);
    }
    // 413 shape (single page over cap) matches too
    mockGetActiveLinks.mockResolvedValue(
      Array.from({ length: 450 }, (_, i) => ({
        id: i + 1, pageId: 1, sectionId: null, orderIndex: i, type: "url",
        title: `L${i}`, description: "D".repeat(6000),
        url: `https://example.com/${i}`, icon: null, iconUrl: null,
        customIconUrl: null, iconMode: "auto", autoIcon: true, imageUrl: null,
        isHighlighted: false, isActive: true, scheduleStart: null,
        scheduleEnd: null, clicksCount: 0, cardStyle: "compact",
        popupText: null, ctaLabel: null, redirectSlug: null,
        createdAt: "2026-01-01 00:00:00",
      })) as never,
    );
    mockGetPageById.mockResolvedValue(PAGE);
    const big = await GET(req("?id=1"));
    expect(big.status).toBe(413);
    const bigJson = await big.json();
    expect(typeof bigJson.error).toBe("string");
    expect(bigJson.bytes).toBeGreaterThan(0);
  });

  it("batch of 50 pages completes end-to-end in < 5s (E.79)", async () => {
    const pages = Array.from({ length: 50 }, (_, i) => ({
      ...(PAGE as object),
      id: i + 1,
      slug: `page-${i + 1}`,
    })) as never[];
    mockGetAllPages.mockResolvedValue(pages);
    mockGetActiveLinks.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: i + 1, pageId: 1, sectionId: null, orderIndex: i, type: "url",
        title: `Link ${i}`, description: "d", url: `https://e.com/${i}`,
        icon: null, iconUrl: null, customIconUrl: null, iconMode: "auto",
        autoIcon: true, imageUrl: null, isHighlighted: false, isActive: true,
        scheduleStart: null, scheduleEnd: null, clicksCount: 0,
        cardStyle: "compact", popupText: null, ctaLabel: null,
        redirectSlug: null, createdAt: "2026-01-01 00:00:00",
      })) as never,
    );
    const t0 = performance.now();
    const res = await GET(req("?all=1"));
    const ms = performance.now() - t0;
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    // generous wall tripwire (typical: well under 1s); catches a
    // pathological per-page re-render or accidental N+1 into sync work
    expect(ms, `batch of 50 took ${Math.round(ms)}ms`).toBeLessThan(5000);
  });

  it("every batch entry gets the full per-page transform (E.81)", async () => {
    // Regression-at-scale risk: transforms (direct href, beacon strip,
    // sanitization) accidentally applied only to the first entry or
    // skipped in the loop. NOTE: plain-mode media IS origin-absolute by
    // design — the invariants here are the transforms themselves.
    const pages = Array.from({ length: 30 }, (_, p) => ({
      ...(PAGE as object),
      id: p + 1,
      slug: `bulk-${p + 1}`,
    })) as never[];
    mockGetAllPages.mockResolvedValue(pages);
    mockGetActiveLinks.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: i + 1, pageId: 1, sectionId: null, orderIndex: i, type: "url",
        title: `L${i}`, description: null, url: `https://dest.example/${i}`,
        icon: null, iconUrl: null, customIconUrl: null, iconMode: "auto",
        autoIcon: true, imageUrl: null, isHighlighted: false, isActive: true,
        scheduleStart: null, scheduleEnd: null, clicksCount: 0,
        cardStyle: "compact", popupText: null, ctaLabel: null,
        redirectSlug: null, createdAt: "2026-01-01 00:00:00",
      })) as never,
    );
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const entries: Array<{ name: string; data: Buffer }> = [];
    let off = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      const start = off + 30 + nameLen + extraLen;
      entries.push({ name, data: buf.subarray(start, start + size) });
      off = start + size;
    }
    expect(entries).toHaveLength(30);
    // archive-level order: local headers follow page-query order (E.97)
    expect(entries.map((e) => e.name)).toEqual(
      Array.from({ length: 30 }, (_, i) => `bulk-${i + 1}.html`),
    );
    for (const { name, data } of entries) {
      const html = data.toString("utf8");
      expect(html.startsWith("<!DOCTYPE html>"), name).toBe(true);
      expect(html, name).not.toContain("/go/");
      expect(html, name).not.toContain("sendBeacon");
      expect(html, name).not.toContain("href=\"javascript:");
      // direct destination present in every entry
      expect(html, name).toContain('href="https://dest.example/0"');
    }
  });

  it("embed batch over 25MiB hits the SAME shared 413 helper (E.84)", async () => {
    // Batch embed and batch plain now share one maxBytes binding — pin
    // the embed variant reaches sizeError with the dynamic message too
    const pages = Array.from({ length: 36 }, (_, i) => ({
      ...(PAGE as object),
      id: i + 1,
      slug: `ebig${i + 1}`,
      bio: "B".repeat(750 * 1024),
    })) as never[];
    mockGetAllPages.mockResolvedValue(pages);
    const res = await GET(req("?all=1&embed=1"));
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Export exceeds the 25 MiB limit");
    expect(json.bytes).toBeGreaterThan(25 * 1024 * 1024);
  });

  it("single-page EMBED over 25MiB → 413 with dynamic message (E.87)", async () => {
    // last unpinned size branch: single html + embed cap (route ~line 238)
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      bio: "B".repeat(26 * 1024 * 1024),
    } as never);
    const res = await GET(req("?id=1&embed=1"));
    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const json = await res.json();
    expect(json.error).toBe("Export exceeds the 25 MiB limit");
    expect(json.bytes).toBeGreaterThan(25 * 1024 * 1024);
    // sanity: bio appears in ~4 SEO slots (meta/og/json-ld/visible) so
    // ~4× input is expected — just catch a runaway memory blowup
    expect(json.bytes).toBeLessThan(200 * 1024 * 1024);
  });

  it("embed zip naming survives odd slugs (E.93)", async () => {
    // single embed CD: <exportFilename minus .html>-export.zip
    const cases: Array<[string, string]> = [
      ["@janedoe", "@janedoe-export.zip"], // opt-in @ survives
      ["日本語", "page-export.zip"], // unicode → fallback stem
      ["café", "caf-export.zip"], // diacritic strip
      ["..\\evil", "evil-export.zip"], // traversal → flat stem
    ];
    for (const [slug, expected] of cases) {
      mockGetPageById.mockResolvedValue({ ...(PAGE as object), slug } as never);
      const res = await GET(req("?id=1&embed=1"));
      expect(res.status, slug).toBe(200);
      expect(res.headers.get("Content-Disposition"), slug).toBe(
        `attachment; filename="${expected}"`,
      );
      // ASCII-only header (no folding risk) — same rule as .html names
      const cd = res.headers.get("Content-Disposition")!;
      expect(cd, slug).toMatch(/^[\x20-\x7e]+$/);
      Buffer.from(await res.arrayBuffer()); // drain body
    }
  });

  it("route is read-only: no mutative statements or direct db imports (E.100)", async () => {
    const routeSrc = readFileSync(
      join(__dirname, "../route.ts"),
      "utf8",
    );
    // no INSERT/UPDATE/DELETE, no fs writes, no db helper imports —
    // export must never touch data (backup-adjacent safety contract)
    expect(routeSrc).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i);
    expect(routeSrc).not.toMatch(/\b(appendFile|writeFile|rename|unlink|mkdir|createWriteStream)\b/);
    expect(routeSrc).not.toContain('from "@/db');
    // queries module is SELECT-only for this route's call graph
    expect(routeSrc).toContain('} from "@/server/queries";');
  });

  it("custom font row MISSING → graceful default-font export (E.111)", async () => {
    // theme requests custom:7 but the row is gone/null: resolveFontOptions
    // returns {} → default stacks, NO @font-face, export still 200.
    // (A REJECTING query propagates → 500 — same as the live page and
    // every other route here: db failure is app-wide, not export-shaped;
    // logged as an orchestrator decision.)
    mockGetPageById.mockResolvedValue({ ...(PAGE as object), themeId: 5 } as never);
    mockGetThemeById.mockResolvedValue({
      id: 5,
      name: "GoneFont",
      fontFamily: "custom:77",
      animationType: "none",
    } as never);
    mockGetCustomFont.mockResolvedValue(null);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(mockGetCustomFont).toHaveBeenCalledWith(77);
    expect(body).not.toContain("@font-face");
    // default font token still emitted (resolver fell back)
    expect(body).toContain("--lb-font:");
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("mixed page shapes batch: no cross-page state bleed (E.114)", async () => {
    const base = (p: number, over: Record<string, unknown>) => ({
      id: p,
      pageId: p,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: `Link${p}`,
      description: null,
      url: `https://dest.example/${p}`,
      icon: null, iconUrl: null, customIconUrl: null, iconMode: "auto",
      autoIcon: true, imageUrl: null, isHighlighted: false, isActive: true,
      scheduleStart: null, scheduleEnd: null, clicksCount: 0,
      cardStyle: "compact", popupText: null, ctaLabel: null,
      redirectSlug: null, createdAt: "2026-01-01 00:00:00",
      ...over,
    });
    mockGetAllPages.mockResolvedValue([
      { ...(PAGE as object), id: 1, slug: "p-popup" },
      { ...(PAGE as object), id: 2, slug: "p-text" },
      { ...(PAGE as object), id: 3, slug: "p-divider" },
      { ...(PAGE as object), id: 4, slug: "p-embed" },
      { ...(PAGE as object), id: 5, slug: "p-hl" },
    ] as never[]);
    // per-page distinct content: one link per page, marker = its type
    let call = 0;
    mockGetActiveLinks.mockImplementation(async () => {
      call += 1;
      switch (call) {
        case 1:
          return [base(1, { type: "text", title: "POPUPMARK", popupText: "pt", ctaLabel: "Go" })] as never;
        case 2:
          return [base(2, { type: "text", title: "TEXTMARK" })] as never;
        case 3:
          return [base(3, { type: "divider", title: "DIVMARK" })] as never;
        case 4:
          return [base(4, { type: "embed", title: "EMBEDMARK", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })] as never;
        default:
          return [base(5, { title: "HLMARK", isHighlighted: true })] as never;
      }
    });
    mockGetSections.mockResolvedValue([] as never);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const entries = new Map<string, string>();
    let off = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      const start = off + 30 + nameLen + extraLen;
      entries.set(name, buf.subarray(start, start + size).toString("utf8"));
      off = start + size;
    }
    expect(entries.size).toBe(5);
    // each marker lands ONLY in its own page's entry (no bleed)
    const markers: Array<[file: string, marker: string]> = [
      ["p-popup.html", "POPUPMARK"],
      ["p-text.html", "TEXTMARK"],
      ["p-divider.html", "DIVMARK"],
      ["p-embed.html", "EMBEDMARK"],
      ["p-hl.html", "HLMARK"],
    ];
    for (const [file, marker] of markers) {
      expect(entries.has(file), file).toBe(true);
      expect(entries.get(file)!, file).toContain(marker);
      for (const [otherFile, otherMarker] of markers) {
        if (otherFile === file) continue;
        expect(
          entries.get(file)!,
          `${otherMarker} bled into ${file}`,
        ).not.toContain(otherMarker);
      }
    }
    // dialog ELEMENT: popup-text page owns one (type "text" cards are
    // popup-capable by design — its OWN id, marker checks above prove no
    // foreign content); non-popup types must ship none. The lb-popup-*
    // CSS substring appears in every style block by design.
    expect(entries.get("p-popup.html")).toContain("<dialog");
    expect(entries.get("p-text.html")).toContain("lb-popup-2"); // own link id
    for (const f of ["p-divider.html", "p-embed.html", "p-hl.html"]) {
      expect(entries.get(f)!, f).not.toContain("<dialog");
    }
  });

  it("zero-link page exports valid minimal html at ROUTE level (E.121)", async () => {
    mockGetPageById.mockResolvedValue({ ...(PAGE as object) } as never);
    mockGetActiveLinks.mockResolvedValue([]);
    mockGetSections.mockResolvedValue([]);
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(body).toContain("</html>");
    // header identity ships, card surface does not (element form —
    // the .lb-link-card CSS rule ships unconditionally per E.115)
    expect(body).toContain("Jane"); // title from PAGE fixture
    expect(body).not.toContain('class="lb-link-card"');
    expect((body.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it("batch with SOME empty pages: every entry valid, empties card-free (E.121)", async () => {
    mockGetAllPages.mockResolvedValue([
      { ...(PAGE as object), id: 1, slug: "full-page" },
      { ...(PAGE as object), id: 2, slug: "empty-a" },
      { ...(PAGE as object), id: 3, slug: "empty-b" },
    ] as never[]);
    const oneLink = [
      {
        id: 1, pageId: 1, sectionId: null, orderIndex: 0, type: "url",
        title: "OnlyOne", description: null, url: "https://e.com/",
        icon: null, iconUrl: null, customIconUrl: null, iconMode: "auto",
        autoIcon: true, imageUrl: null, isHighlighted: false, isActive: true,
        scheduleStart: null, scheduleEnd: null, clicksCount: 0,
        cardStyle: "compact", popupText: null, ctaLabel: null,
        redirectSlug: null, createdAt: "2026-01-01 00:00:00",
      },
    ] as never[];
    let call = 0;
    mockGetActiveLinks.mockImplementation(async () => {
      call += 1;
      return call === 1 ? oneLink : [];
    });
    mockGetSections.mockResolvedValue([]);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const htmls: Array<[string, string]> = [];
    let off = 0;
    while (off + 4 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.subarray(off + 30, off + 30 + nameLen).toString("utf8");
      const start = off + 30 + nameLen + extraLen;
      htmls.push([name, buf.subarray(start, start + size).toString("utf8")]);
      off = start + size;
    }
    expect(htmls).toHaveLength(3);
    for (const [name, html] of htmls) {
      expect(html.startsWith("<!DOCTYPE html>"), name).toBe(true);
      expect(html, name).toContain("</html>");
      expect((html.match(/<h1[\s>]/g) ?? []).length, name).toBe(1);
    }
    // count card ELEMENTS (class= attr), not the unconditional CSS rule
    const cardCount = (html: string) =>
      (html.match(/class="lb-link-card/g) ?? []).length;
    expect(cardCount(htmls[0][1])).toBeGreaterThan(0); // full page has cards
    expect(cardCount(htmls[1][1])).toBe(0); // empty pages have none
    expect(cardCount(htmls[2][1])).toBe(0);
  });

  it("batch economics: global state once, per-page queries linear (E.24)", async () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({
      ...(PAGE as object),
      id: i + 1,
      slug: `p${i + 1}`,
    })) as never[];
    mockGetAllPages.mockResolvedValue(pages);
    const res = await GET(req("?all=1"));
    expect(res.status).toBe(200);
    // global fallback theme resolved ONCE for the whole batch, not per page
    expect(mockGetActiveTheme).toHaveBeenCalledTimes(1);
    // per-page data exactly once per page — no re-fetch storms
    expect(mockGetActiveLinks).toHaveBeenCalledTimes(5);
    expect(mockGetSections).toHaveBeenCalledTimes(5);
    // pages with themeId:null never hit the theme table
    expect(mockGetThemeById).not.toHaveBeenCalled();
    // sequential loop: at most one getActiveLinks call in flight at a time
    let inFlight = 0;
    let maxInFlight = 0;
    mockGetActiveLinks.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return [];
    });
    mockGetAllPages.mockResolvedValue(pages);
    await GET(req("?all=1"));
    expect(maxInFlight).toBe(1);
  });

  it("embed=1 single page returns a zip (missing uploads skip silently)", async () => {
    const res = await GET(req("?id=1&embed=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="jane-export.zip"',
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("all=1&embed=1 returns the batch zip with assetBase HTML (no absolute origin refs)", async () => {
    const second = { ...(PAGE as object), id: 2, slug: "bob" } as never;
    mockGetAllPages.mockResolvedValue([PAGE, second]);
    const res = await GET(req("?all=1&embed=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="linkbreeze-pages.zip"',
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    // pages built with assetBase: no absolute origin refs in the HTML entries
    expect(buf.toString("latin1")).not.toContain("http://localhost:3000");
  });

  it("413 when a single export exceeds the 2 MiB cap", async () => {
    // 450 links x ~6KB descriptions ≈ 2.7 MiB of escaped text.
    mockGetActiveLinks.mockResolvedValue(
      Array.from({ length: 450 }, (_, i) => ({
        id: i + 1,
        pageId: 1,
        sectionId: null,
        orderIndex: i,
        type: "url",
        title: `Link ${i}`,
        description: "D".repeat(6000),
        url: `https://example.com/${i}`,
        icon: null,
        iconUrl: null,
        customIconUrl: null,
        iconMode: "auto",
        autoIcon: true,
        imageUrl: null,
        isHighlighted: false,
        isActive: true,
        scheduleStart: null,
        scheduleEnd: null,
        clicksCount: 0,
        cardStyle: "compact",
        popupText: null,
        ctaLabel: null,
        redirectSlug: null,
        createdAt: "2026-01-01 00:00:00",
      })) as never,
    );
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toContain("2 MiB limit");
    expect(json.bytes).toBeGreaterThan(2 * 1024 * 1024);
  });

  it("orphaned themeId falls back cleanly (E.44)", async () => {
    // themeId points at a deleted row → getThemeById null
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      themeId: 99,
    } as never);
    mockGetThemeById.mockResolvedValue(null);

    // branch 1: no fallback theme either → {} defaults, still 200
    mockGetActiveTheme.mockResolvedValue(null);
    const bare = await GET(req("?id=1"));
    expect(bare.status).toBe(200);
    const bareBody = await bare.text();
    expect(mockGetThemeById).toHaveBeenCalledWith(99);
    expect(bareBody.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(bareBody).toContain("<style>"); // tokens still emitted

    // branch 2: active fallback theme present → its tokens win
    mockGetActiveTheme.mockResolvedValue({
      id: 3,
      name: "FallbackTheme",
      primaryColor: "#00ff00",
      animationType: "none",
    } as never);
    const fb = await GET(req("?id=1"));
    expect(fb.status).toBe(200);
    expect(await fb.text()).toContain("--lb-accent: #00ff00;");
  });

  it("resolves custom:<id> fonts into @font-face + token family (E.25)", async () => {
    // explicit host header: undici does not auto-populate it on
    // programmatically-built requests (real server requests always have it)
    const fontReq = (q: string) =>
      new NextRequest(`http://localhost:3000/api/pages/export${q}`, {
        headers: { host: "localhost:3000" },
      });
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      themeId: 9,
    } as never);
    mockGetThemeById.mockResolvedValue({
      id: 9,
      name: "CustomFontTheme",
      fontFamily: "custom:7",
      cardFontFamily: null,
      animationType: "none",
    } as never);
    mockGetCustomFont.mockResolvedValue({
      id: 7,
      family: "My Uploaded",
      url: "/api/uploads/f-abc.woff2",
      format: "woff2",
    } as never);
    const res = await GET(fontReq("?id=1"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(mockGetCustomFont).toHaveBeenCalledWith(7);
    expect(body).toContain("@font-face {");
    expect(body).toContain("font-family: 'My Uploaded';");
    expect(body).toContain(
      "src: url('http://localhost:3000/api/uploads/f-abc.woff2')",
    );
    // the theme token points at the uploaded family, not the default stack
    expect(body).toContain("--lb-font: 'My Uploaded'");

    // embed mode: the font src ships as a relative uploads/ ref, so the
    // collector can bundle the file alongside the html
    const embedRes = await GET(fontReq("?id=1&embed=1"));
    expect(embedRes.status).toBe(200);
    const zipBuf = Buffer.from(await embedRes.arrayBuffer());
    expect(zipBuf.toString("latin1")).toContain("url('uploads/f-abc.woff2')");
    expect(zipBuf.toString("latin1")).not.toContain("/api/uploads/f-abc.woff2");
  });

  it("both site AND card fonts as custom rows → two @font-face rules, two families (E.70)", async () => {
    mockGetPageById.mockResolvedValue({ ...(PAGE as object), themeId: 11 } as never);
    mockGetThemeById.mockResolvedValue({
      id: 11,
      name: "DualFontTheme",
      fontFamily: "custom:7",
      cardFontFamily: "custom:8",
      animationType: "none",
    } as never);
    const rows = new Map<number, { id: number; family: string; url: string; format: string }>([
      [7, { id: 7, family: "Site Font", url: "/api/uploads/site.woff2", format: "woff2" }],
      [8, { id: 8, family: "Card Font", url: "/api/uploads/card.woff2", format: "woff2" }],
    ]);
    mockGetCustomFont.mockImplementation(
      async (fontId: number) => (rows.get(fontId) ?? null) as never,
    );
    const res = await GET(req("?id=1"));
    expect(res.status).toBe(200);
    const body = await res.text();
    // both rows fetched, both rules emitted
    expect(mockGetCustomFont).toHaveBeenCalledWith(7);
    expect(mockGetCustomFont).toHaveBeenCalledWith(8);
    expect(body.match(/@font-face \{/g) ?? []).toHaveLength(2);
    expect(body).toContain("font-family: 'Site Font';");
    expect(body).toContain("font-family: 'Card Font';");
    // and both families reach the tokens
    expect(body).toContain("'Site Font'");
    expect(body).toContain("'Card Font'");
  });

  it("theme rows flow through page theme override", async () => {
    mockGetThemeById.mockResolvedValue({
      id: 7,
      name: "Custom",
      primaryColor: "#ff0000",
      linkStyle: "glass",
    } as never);
    const pageWithTheme = { ...(PAGE as object), themeId: 7 } as never;
    mockGetPageById.mockResolvedValue(pageWithTheme);
    const res = await GET(req("?id=1"));
    const body = await res.text();
    expect(mockGetThemeById).toHaveBeenCalledWith(7);
    expect(body).toContain("--lb-accent: #ff0000;");
  });
});

describe("getOrigin host-injection guard (E.23)", () => {
  const origBase = process.env.BASE_URL;
  const origTrust = process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ userId: 1, username: "jane" } as never);
    mockGetPageById.mockResolvedValue({
      ...(PAGE as object),
      avatarUrl: "/api/uploads/av.png",
    } as never);
    mockGetActiveLinks.mockResolvedValue([]);
    mockGetSections.mockResolvedValue([]);
    mockGetActiveTheme.mockResolvedValue(null);
    mockGetThemeById.mockResolvedValue(null);
    mockGetCustomFont.mockResolvedValue(null);
    delete process.env.BASE_URL;
    delete process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST;
  });

  afterEach(() => {
    if (origBase === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = origBase;
    if (origTrust === undefined) delete process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST;
    else process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST = origTrust;
  });

  it("BASE_URL beats a spoofed X-Forwarded-Host", async () => {
    process.env.BASE_URL = "https://cdn.example";
    const res = await GET(
      new NextRequest("http://victim.example/api/pages/export?id=1", {
        headers: {
          host: "victim.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
        },
      }),
    );
    const body = await res.text();
    expect(body).toContain('src="https://cdn.example/api/uploads/av.png"');
    expect(body).not.toContain("evil.example");
  });

  it("without BASE_URL or trust flag, X-Forwarded-Host is ignored", async () => {
    const res = await GET(
      new NextRequest("http://victim.example/api/pages/export?id=1", {
        headers: {
          host: "victim.example",
          "x-forwarded-host": "evil.example",
        },
      }),
    );
    const body = await res.text();
    expect(body).toContain('src="http://victim.example/api/uploads/av.png"');
    expect(body).not.toContain("evil.example");
  });

  it("trust flag opts in to X-Forwarded-Host (proxy-correct path)", async () => {
    process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST = "true";
    const res = await GET(
      new NextRequest("http://backend.internal/api/pages/export?id=1", {
        headers: {
          host: "backend.internal",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
        },
      }),
    );
    const body = await res.text();
    expect(body).toContain('src="https://public.example/api/uploads/av.png"');
    expect(body).not.toContain("backend.internal");
  });
});

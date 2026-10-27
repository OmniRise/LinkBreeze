import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
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
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(cd)).toBe(true);
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

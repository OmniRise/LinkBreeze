import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(
    async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> =>
      ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 }),
  ),
  revalidatePath: vi.fn(),
  getDefaultPage: vi.fn(),
  getPageById: vi.fn(),
  createLink: vi.fn(),
  updatePage: vi.fn(),
  fetchAndCacheFavicon: vi.fn<(url: string) => Promise<string | null>>(
    async () => "/api/uploads/favicon-test.png",
  ),
  extractDomain: vi.fn((url: string): string | null => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo", () => ({ demoBlock: mocks.demoBlock }));
vi.mock("@/lib/favicon", () => ({
  fetchAndCacheFavicon: mocks.fetchAndCacheFavicon,
  extractDomain: mocks.extractDomain,
}));
vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  getDefaultPage: mocks.getDefaultPage,
  getPageById: mocks.getPageById,
  createLink: mocks.createLink,
  updatePage: mocks.updatePage,
}));

import { confirmImport } from "@/server/actions/migration-wizard";

interface TestImportedLink {
  title: string;
  url: string;
  type?: string;
  selected: boolean;
  isSocial: boolean;
}

function makeLink(i: number, overrides: Partial<TestImportedLink> = {}): TestImportedLink {
  return {
    title: `Link ${i}`,
    url: `https://example-${i}.test/page`,
    type: "url",
    selected: true,
    isSocial: false,
    ...overrides,
  };
}

function makeFormData(links: TestImportedLink[], social: TestImportedLink[] = []): FormData {
  const fd = new FormData();
  fd.set("pageId", "1");
  fd.set("links", JSON.stringify(links));
  fd.set("socialLinks", JSON.stringify(social));
  return fd;
}

describe("confirmImport icon handling (#95)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demoBlock.mockReturnValue(null);
    mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
    mocks.getDefaultPage.mockResolvedValue({ id: 1, slug: "home", socialLinks: "[]" });
    mocks.getPageById.mockResolvedValue({ id: 1, slug: "home", socialLinks: "[]" });
    mocks.createLink.mockResolvedValue({ id: 1 });
    mocks.updatePage.mockResolvedValue(undefined);
    mocks.fetchAndCacheFavicon.mockResolvedValue("/api/uploads/favicon-test.png");
  });

  it("resolves favicons for imported links (the old code never fetched them)", async () => {
    const res = await confirmImport(null, makeFormData([makeLink(1), makeLink(2)]));

    expect(res.success).toBe(true);
    expect(mocks.fetchAndCacheFavicon).toHaveBeenCalledTimes(2);
    expect(mocks.createLink).toHaveBeenCalledWith(
      expect.objectContaining({ iconUrl: "/api/uploads/favicon-test.png", iconMode: "auto" }),
    );
  });

  it("counts links whose favicon could not be resolved", async () => {
    mocks.fetchAndCacheFavicon.mockImplementation(async (url: string) =>
      url.includes("fail") ? null : "/api/uploads/favicon-test.png",
    );
    const res = await confirmImport(
      null,
      makeFormData([
        makeLink(1, { url: "https://fail-1.test/" }),
        makeLink(2),
        makeLink(3, { url: "https://fail-2.test/" }),
      ]),
    );

    expect(res.success).toBe(true);
    expect(res.iconFallbackCount).toBe(2);
    // Links are still created even when the favicon fails.
    expect(mocks.createLink).toHaveBeenCalledTimes(3);
    expect(mocks.createLink).toHaveBeenLastCalledWith(
      expect.objectContaining({ iconUrl: null, url: "https://fail-2.test/" }),
    );
  });

  it("does not fetch favicons for non-url link types", async () => {
    const res = await confirmImport(
      null,
      makeFormData([makeLink(1, { type: "email", url: "mailto:x@example.com" })]),
    );

    expect(res.success).toBe(true);
    expect(mocks.fetchAndCacheFavicon).not.toHaveBeenCalled();
    expect(res.iconFallbackCount).toBe(0);
    expect(mocks.createLink).toHaveBeenCalledWith(
      expect.objectContaining({ url: "mailto:x@example.com", iconUrl: null }),
    );
  });

  it("saves links with bounded concurrency, not one unbounded Promise.all", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mocks.createLink.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { id: 1 };
    });

    const res = await confirmImport(
      null,
      makeFormData(Array.from({ length: 12 }, (_, i) => makeLink(i))),
    );

    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalledTimes(12);
    // Bounded at 3 concurrent saves: the unbounded Promise.all of the old
    // code would push all 12 in-flight saves at once.
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("reports zero fallbacks when every link resolves an icon", async () => {
    const res = await confirmImport(null, makeFormData([makeLink(1), makeLink(2)]));
    expect(res.iconFallbackCount).toBe(0);
  });
});

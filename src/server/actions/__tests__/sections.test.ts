import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * reorderContent page-ownership gate (security-audit CT-2). The old gate
 * checked only the FIRST link id — sectionOrder ids had no access check at
 * all when linkOrder was empty, and query writes were unscoped per id. The
 * action now resolves every id (links via getLinksByIds, sections via
 * getSectionPageId) to its page, refuses anything that is not one single
 * page, then runs the same assertSectionPageAccess gate as other mutations.
 * Mocks per repo convention — no DB touched.
 */
const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn((): string | null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  revalidatePath: vi.fn(),
  getLinksByIds: vi.fn(async (): Promise<{ id: number; pageId: number | null }[]> => []),
  getSectionPageId: vi.fn(async (): Promise<number | null> => null),
  reorderPageContent: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoBlock }));
vi.mock("@/server/queries", () => ({
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  reorderPageContent: mocks.reorderPageContent,
  getPageById: vi.fn(async (id: number): Promise<{ id: number; slug: string; userId: number } | null> => ({ id, slug: "home", userId: id === 5 ? 1 : 2 })),
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "member",
    caps: { pagesLimit: null, visibility: "own", manageAccounts: false, manageInstance: false },
  })),
  getSectionPageId: mocks.getSectionPageId,
  getLink: vi.fn(async () => null),
  getLinksByIds: mocks.getLinksByIds,
}));

import { reorderContent } from "@/server/actions/sections";

function payload(linkOrder: Array<{ id: number; sectionId: number | null }>, sectionOrder: number[]) {
  return { linkOrder, sectionOrder };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoBlock.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "member", exp: Date.now() + 60000, pv: 1 });
  mocks.getLinksByIds.mockResolvedValue([]);
  mocks.getSectionPageId.mockResolvedValue(null);
  mocks.reorderPageContent.mockResolvedValue(undefined);
});

describe("reorderContent page-ownership gate (security-audit CT-2)", () => {
  it("refuses a sectionOrder-only payload for a foreign page (old blind spot)", async () => {
    mocks.getSectionPageId.mockResolvedValue(7); // page 7 belongs to user 2
    const res = await reorderContent(payload([], [42]));
    expect(res.success).toBe(false);
    expect(mocks.reorderPageContent).not.toHaveBeenCalled();
  });

  it("refuses an unknown section id", async () => {
    mocks.getSectionPageId.mockResolvedValue(null);
    const res = await reorderContent(payload([], [999]));
    expect(res.success).toBe(false);
    expect(mocks.reorderPageContent).not.toHaveBeenCalled();
  });

  it("refuses a mixed-page link batch", async () => {
    mocks.getLinksByIds.mockResolvedValue([
      { id: 1, pageId: 5 },
      { id: 2, pageId: 9 },
    ]);
    const res = await reorderContent(
      payload(
        [
          { id: 1, sectionId: null },
          { id: 2, sectionId: null },
        ],
        [],
      ),
    );
    expect(res.success).toBe(false);
    expect(mocks.reorderPageContent).not.toHaveBeenCalled();
  });

  it("refuses links and sections resolving to different pages", async () => {
    mocks.getLinksByIds.mockResolvedValue([{ id: 1, pageId: 5 }]);
    mocks.getSectionPageId.mockResolvedValue(9);
    const res = await reorderContent(payload([{ id: 1, sectionId: null }], [42]));
    expect(res.success).toBe(false);
    expect(mocks.reorderPageContent).not.toHaveBeenCalled();
  });

  it("passes a single-page mixed payload for the owner", async () => {
    mocks.getLinksByIds.mockResolvedValue([{ id: 1, pageId: 5 }]);
    mocks.getSectionPageId.mockResolvedValue(5);
    const res = await reorderContent(payload([{ id: 1, sectionId: null }], [42]));
    expect(res.success).toBe(true);
    expect(mocks.reorderPageContent).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #124 multi-user — OWNERSHIP MATRIX at the action level.
 *
 * Four actors × three page kinds. This is the security surface a reviewer
 * should read first: user B must never be able to read-mutate user A's page
 * or links, legacy single-user rows (userId NULL) stay admin-only, and the
 * admin passes everywhere. The query-level mirror of this matrix lives in
 * multiuser.integration.test.ts.
 */

const mocks = vi.hoisted(() => ({
  demoGuard: vi.fn((): null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number; role?: string } | null> => ({
    userId: 2,
    username: "bob",
    exp: Date.now() + 60000,
    pv: 1,
    role: "owner",
  })),
  revalidatePath: vi.fn(),
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
  // queries
  createPage: vi.fn(async () => ({ id: 5 })),
  updatePage: vi.fn(async () => undefined),
  deletePage: vi.fn(async () => undefined),
  getDefaultPage: vi.fn(async () => ({ id: 1, slug: "home", userId: 1 })),
  getAllPages: vi.fn(async (): Promise<{ id: number; slug: string }[]> => []),
  getPageById: vi.fn(async (id: number): Promise<{ id: number; slug: string; userId: number | null } | null> => null),
  createLink: vi.fn(async () => undefined),
  updateLink: vi.fn(async () => undefined),
  deleteLink: vi.fn(async () => undefined),
  getAllLinks: vi.fn(async () => []),
  getLink: vi.fn(async (): Promise<{ id: number; pageId: number } | null> => null),
  reorderLinks: vi.fn(async () => undefined),
  isSlugTaken: vi.fn(async () => false),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/queries", () => ({
  createPage: mocks.createPage,
  updatePage: mocks.updatePage,
  deletePage: mocks.deletePage,
  getDefaultPage: mocks.getDefaultPage,
  getAllPages: mocks.getAllPages,
  getPageById: mocks.getPageById,
  createLink: mocks.createLink,
  updateLink: mocks.updateLink,
  deleteLink: mocks.deleteLink,
  getAllLinks: mocks.getAllLinks,
  getLink: mocks.getLink,
  reorderLinks: mocks.reorderLinks,
  isSlugTaken: mocks.isSlugTaken,
}));

import { updatePageAction, deletePageAction } from "@/server/actions/pages";
import { createLink, updateLink, deleteLink } from "@/server/actions/links";

/** Alice (userId 1) owns page 10; Bob (userId 2) owns page 20. Page 30 is legacy (userId NULL). */
const PAGES: Record<number, { id: number; slug: string; userId: number | null }> = {
  10: { id: 10, slug: "alice", userId: 1 },
  20: { id: 20, slug: "bob", userId: 2 },
  30: { id: 30, slug: "legacy", userId: null },
};

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

function asBob() {
  mocks.getSession.mockResolvedValue({ userId: 2, username: "bob", exp: Date.now() + 60000, pv: 1, role: "owner" });
}
function asAlice() {
  mocks.getSession.mockResolvedValue({ userId: 1, username: "alice", exp: Date.now() + 60000, pv: 1, role: "owner" });
}
function asAdmin() {
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1, role: "admin" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoGuard.mockReturnValue(null);
  mocks.getPageById.mockImplementation(async (id: number) => PAGES[id] ?? null);
  asBob();
});

// ─────────────── pages: update / delete ───────────────

describe("ownership matrix — page actions", () => {
  it("member B CANNOT update member A's page", async () => {
    const res = await updatePageAction(fd({ pageId: "10", title: "hacked" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("member B CANNOT delete member A's page", async () => {
    const res = await deletePageAction(fd({ pageId: "10", mode: "keep" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.deletePage).not.toHaveBeenCalled();
  });

  it("member B CAN update their own page", async () => {
    const res = await updatePageAction(fd({ pageId: "20", title: "mine" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).toHaveBeenCalled();
  });

  it("member B CANNOT touch a legacy page (userId NULL) even though no one owns it", async () => {
    const res = await updatePageAction(fd({ pageId: "30", title: "claim" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("member A CANNOT touch member B's page either (the gate is not user-1-specific)", async () => {
    asAlice();
    const res = await updatePageAction(fd({ pageId: "20", title: "hacked" }));
    expect(res.success).toBe(false);
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("admin CAN update any page, including legacy rows", async () => {
    asAdmin();
    expect((await updatePageAction(fd({ pageId: "10", title: "x" }))).success).toBe(true);
    expect((await updatePageAction(fd({ pageId: "30", title: "x" }))).success).toBe(true);
  });

  it("admin CAN delete a member's page", async () => {
    asAdmin();
    const res = await deletePageAction(fd({ pageId: "20", mode: "wipe" }));
    expect(res.success).toBe(true);
    expect(mocks.deletePage).toHaveBeenCalled();
  });
});

/** Link form fields every real submit carries (checkboxes are always set by the dialog). */
function linkFd(data: Record<string, string>): FormData {
  return fd({ type: "url", isHighlighted: "off", isActive: "on", ...data });
}

// ─────────────── links: create / update / delete ───────────────

describe("ownership matrix — link actions", () => {
  it("member B CANNOT add a link to member A's page", async () => {
    const res = await createLink(linkFd({ pageId: "10", title: "Link", url: "https://example.com" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("member B CANNOT add a link to a legacy page", async () => {
    const res = await createLink(linkFd({ pageId: "30", title: "Link", url: "https://example.com" }));
    expect(res.success).toBe(false);
    expect(mocks.createLink).not.toHaveBeenCalled();
  });

  it("member B CAN add a link to their own page", async () => {
    const res = await createLink(linkFd({ pageId: "20", title: "Link", url: "https://example.com" }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalled();
  });

  it("admin CAN add a link to any page", async () => {
    asAdmin();
    const res = await createLink(linkFd({ pageId: "10", title: "Link", url: "https://example.com" }));
    expect(res.success).toBe(true);
    expect(mocks.createLink).toHaveBeenCalled();
  });

  it("member B CANNOT update a link that lives on member A's page (page derived from the link, not the client)", async () => {
    mocks.getLink.mockResolvedValue({ id: 77, pageId: 10 });
    const res = await updateLink(linkFd({ id: "77", title: "hacked", url: "https://example.com" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.updateLink).not.toHaveBeenCalled();
  });

  it("member B CANNOT delete a link on member A's page", async () => {
    mocks.getLink.mockResolvedValue({ id: 77, pageId: 10 });
    const res = await deleteLink(fd({ id: "77" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteLink).not.toHaveBeenCalled();
  });

  it("member B CAN delete a link on their own page", async () => {
    mocks.getLink.mockResolvedValue({ id: 78, pageId: 20 });
    const res = await deleteLink(fd({ id: "78" }));
    expect(res.success).toBe(true);
    expect(mocks.deleteLink).toHaveBeenCalledWith(78);
  });

  it("a link id that does not exist returns not-found (no existence leak)", async () => {
    mocks.getLink.mockResolvedValue(null);
    const res = await deleteLink(fd({ id: "999" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });

  it("unauthenticated callers are rejected before the ownership check", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await deleteLink(fd({ id: "78" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("unauthorized");
  });
});

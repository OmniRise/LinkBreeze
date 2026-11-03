import { describe, it, expect } from "vitest";

/**
 * #124 2B — capability resolution (tests written BEFORE the implementation).
 *
 * The role ROW is the source of truth; users.role text is a legacy hint.
 * resolveCapabilities must honor, in order:
 *  1. A builtin Admin role row is ALWAYS full capabilities — a corrupted or
 *     hand-edited row can never lock the instance out.
 *  2. A custom role row's own flags (pages_limit NULL=unlimited, visibility,
 *     manageAccounts, manageInstance).
 *  3. No role row (role_id NULL / deleted row) → map through the legacy TEXT
 *     role. Never silently demote: unknown text maps to Member, 'admin' text
 *     maps to Admin.
 */
import {
  resolveCapabilities,
  canViewPage,
  canEditPage,
  filterVisiblePages,
  type RoleRowLike,
} from "@/lib/ownership";

const adminRow: RoleRowLike = {
  name: "Admin",
  isBuiltin: true,
  pagesLimit: null,
  pagesVisibility: "manage_all",
  canManageAccounts: true,
  canManageInstance: true,
};
const memberRow: RoleRowLike = {
  name: "Member",
  isBuiltin: true,
  pagesLimit: 1,
  pagesVisibility: "own",
  canManageAccounts: false,
  canManageInstance: false,
};
const viewerRow: RoleRowLike = {
  name: "Viewer",
  isBuiltin: false,
  pagesLimit: 3,
  pagesVisibility: "view_all",
  canManageAccounts: false,
  canManageInstance: false,
};
const teamLeadRow: RoleRowLike = {
  name: "Team Lead",
  isBuiltin: false,
  pagesLimit: null,
  pagesVisibility: "manage_all",
  canManageAccounts: false,
  canManageInstance: false,
};

describe("resolveCapabilities", () => {
  it("builtin Admin row is full power", () => {
    const caps = resolveCapabilities("admin", adminRow);
    expect(caps).toEqual({
      pagesLimit: null,
      visibility: "manage_all",
      manageAccounts: true,
      manageInstance: true,
    });
  });

  it("builtin Admin row is IMMUNE to stripping — even a corrupted row yields full power", () => {
    const corrupted: RoleRowLike = { ...adminRow, canManageAccounts: false, canManageInstance: false, pagesVisibility: "own", pagesLimit: 0 };
    expect(resolveCapabilities("admin", corrupted).manageAccounts).toBe(true);
    expect(resolveCapabilities("admin", corrupted).manageInstance).toBe(true);
    expect(resolveCapabilities("admin", corrupted).visibility).toBe("manage_all");
    expect(resolveCapabilities("admin", corrupted).pagesLimit).toBeNull();
  });

  it("custom role rows resolve their own flags", () => {
    expect(resolveCapabilities("owner", viewerRow)).toEqual({
      pagesLimit: 3,
      visibility: "view_all",
      manageAccounts: false,
      manageInstance: false,
    });
    expect(resolveCapabilities("owner", teamLeadRow).visibility).toBe("manage_all");
    expect(resolveCapabilities("owner", teamLeadRow).manageAccounts).toBe(false);
  });

  it("NULL role row maps through the legacy TEXT role (never silent demotion)", () => {
    expect(resolveCapabilities("admin", null).manageAccounts).toBe(true);
    expect(resolveCapabilities("admin", null).visibility).toBe("manage_all");
    expect(resolveCapabilities("owner", null)).toEqual({
      pagesLimit: 1,
      visibility: "own",
      manageAccounts: false,
      manageInstance: false,
    });
    // absent/garbage text + no row = Member (deny by default), never Admin
    expect(resolveCapabilities(null, null).manageAccounts).toBe(false);
    expect(resolveCapabilities("superuser", null).manageAccounts).toBe(false);
  });

  it("invalid visibility strings on custom roles deny by default (own)", () => {
    const garbage: RoleRowLike = { ...viewerRow, pagesVisibility: "everything" as never };
    expect(resolveCapabilities("owner", garbage).visibility).toBe("own");
  });
});

describe("filterVisiblePages (admin page switcher / dashboard scoping)", () => {
  const pages = [
    { id: 10, slug: "alice", userId: 10 },
    { id: 20, slug: "bob", userId: 20 },
    { id: 30, slug: "legacy", userId: null },
  ];
  const memberCaps = { pagesLimit: 1, visibility: "own" as const, manageAccounts: false, manageInstance: false };
  const viewerCaps = { pagesLimit: 3, visibility: "view_all" as const, manageAccounts: false, manageInstance: false };
  const leadCaps = { pagesLimit: null, visibility: "manage_all" as const, manageAccounts: false, manageInstance: false };
  const adminCaps = { pagesLimit: null, visibility: "manage_all" as const, manageAccounts: true, manageInstance: true };

  it("own-visibility member sees ONLY their own pages (never legacy rows)", () => {
    expect(filterVisiblePages(pages, memberCaps, 20).map((p) => p.id)).toEqual([20]);
    expect(filterVisiblePages(pages, memberCaps, 99)).toEqual([]);
  });

  it("view_all member sees every page (read-only surface)", () => {
    expect(filterVisiblePages(pages, viewerCaps, 20)).toHaveLength(3);
  });

  it("manage_all member sees every page", () => {
    expect(filterVisiblePages(pages, leadCaps, 20)).toHaveLength(3);
  });

  it("full admin sees every page", () => {
    expect(filterVisiblePages(pages, adminCaps, 1)).toHaveLength(3);
  });
});

describe("view/edit page matrix over capabilities", () => {
  const alice = { id: 10, userId: 10, slug: "alice" };
  const bob = { id: 20, userId: 20, slug: "bob" };
  const legacy = { id: 30, userId: null, slug: "legacy" };
  const bobSession = { userId: 20 };

  it("own-visibility member: own page yes, others no (view AND edit)", () => {
    const caps = resolveCapabilities("owner", memberRow);
    expect(canViewPage(caps, bobSession, bob)).toBe(true);
    expect(canEditPage(caps, bobSession, bob)).toBe(true);
    expect(canViewPage(caps, bobSession, alice)).toBe(false);
    expect(canEditPage(caps, bobSession, alice)).toBe(false);
    expect(canViewPage(caps, bobSession, legacy)).toBe(false);
  });

  it("view_all member CANNOT edit others' pages — view without write", () => {
    const caps = resolveCapabilities("owner", viewerRow);
    expect(canViewPage(caps, bobSession, alice)).toBe(true);
    expect(canEditPage(caps, bobSession, alice)).toBe(false);
    // but can still edit their own
    expect(canEditPage(caps, bobSession, bob)).toBe(true);
    // legacy rows: viewing requires... they stay admin-only even for view_all
    expect(canViewPage(caps, bobSession, legacy)).toBe(false);
  });

  it("manage_all member can view AND edit others' pages, still not legacy rows", () => {
    const caps = resolveCapabilities("owner", teamLeadRow);
    expect(canViewPage(caps, bobSession, alice)).toBe(true);
    expect(canEditPage(caps, bobSession, alice)).toBe(true);
    expect(canEditPage(caps, bobSession, legacy)).toBe(false);
  });

  it("admin capabilities pass everywhere incl. legacy rows", () => {
    const caps = resolveCapabilities("admin", adminRow);
    expect(canEditPage(caps, { userId: 1 }, alice)).toBe(true);
    expect(canEditPage(caps, { userId: 1 }, legacy)).toBe(true);
  });

  it("null page rejects for everyone", () => {
    const caps = resolveCapabilities("admin", adminRow);
    expect(canViewPage(caps, { userId: 1 }, null)).toBe(false);
    expect(canEditPage(caps, { userId: 1 }, null)).toBe(false);
  });
});

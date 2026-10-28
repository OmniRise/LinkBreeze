import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #124 multi-user — account lifecycle actions.
 *
 * This file IS the security contract for /accounts: every action must be
 * admin-gated, must enforce the self-protection rules (cannot disable/demote/
 * delete yourself), and must never allow the last active admin to be removed.
 */

const mocks = vi.hoisted(() => ({
  demoGuard: vi.fn((): null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number; role?: string } | null> => ({
    userId: 1,
    username: "admin",
    exp: Date.now() + 60000,
    pv: 1,
    role: "admin",
  })),
  hashPassword: vi.fn(async (s: string) => `hashed-${s}`),
  revalidatePath: vi.fn(),
  listUsers: vi.fn(async () => [] as { id: number; role: string; status: string }[]),
  listAccountSummaries: vi.fn(async () => [] as unknown[]),
  getUserById: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  getUserByUsername: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  createUser: vi.fn(async () => ({ id: 9 })),
  updateUserStatus: vi.fn(async () => undefined),
  updateUserRole: vi.fn(async () => undefined),
  updateUserRoleById: vi.fn(async () => undefined),
  deleteUser: vi.fn(async () => undefined),
  getPageByOwner: vi.fn(async (): Promise<{ id: number; slug: string; userId: number } | null> => null),
  setPageOwner: vi.fn(async () => undefined),
  updatePage: vi.fn(async () => undefined),
  getPageById: vi.fn(async (): Promise<{ id: number; slug: string; userId: number } | null> => null),
  getSetting: vi.fn(async (): Promise<string | null> => null),
  updateSetting: vi.fn(async () => undefined),
  createPage: vi.fn(async () => ({ id: 50 })),
  getAllPages: vi.fn(async (): Promise<{ id: number; slug: string }[]> => []),
  getRoleById: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  listInstanceAdminIds: vi.fn(async (): Promise<number[]> => [1, 2]),
  getCapabilitiesForUser: vi.fn(async (userId: number): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: userId === 1 ? "admin" : "owner",
    caps: userId === 1 ? { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true } : { pagesLimit: 1, visibility: "own", manageAccounts: false, manageInstance: false },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession, hashPassword: mocks.hashPassword }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/queries", () => ({
  listUsers: mocks.listUsers,
  listAccountSummaries: mocks.listAccountSummaries,
  getUserById: mocks.getUserById,
  getUserByUsername: mocks.getUserByUsername,
  createUser: mocks.createUser,
  updateUserStatus: mocks.updateUserStatus,
  updateUserRole: mocks.updateUserRole,
  updateUserRoleById: mocks.updateUserRoleById,
  deleteUser: mocks.deleteUser,
  getPageByOwner: mocks.getPageByOwner,
  setPageOwner: mocks.setPageOwner,
  updatePage: mocks.updatePage,
  getPageById: mocks.getPageById,
  getSetting: mocks.getSetting,
  updateSetting: mocks.updateSetting,
  createPage: mocks.createPage,
  getAllPages: mocks.getAllPages,
  getRoleById: mocks.getRoleById,
  listInstanceAdminIds: mocks.listInstanceAdminIds,
  getCapabilitiesForUser: mocks.getCapabilitiesForUser,
}));

import {
  listAccountsAction,
  createAccountAction,
  setAccountStatusAction,
  assignAccountRoleAction,
  deleteAccountAction,
  reassignPageSlugAction,
} from "@/server/actions/accounts";

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

/** Two active admins by default, so single-admin guard tests must opt in. */
function seedUsers(users: { id: number; role: string; status: string }[]) {
  mocks.listUsers.mockResolvedValue(users);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoGuard.mockReturnValue(null);
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1, role: "admin" });
  mocks.getCapabilitiesForUser.mockResolvedValue({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  });
  mocks.listInstanceAdminIds.mockResolvedValue([1, 2]);
  mocks.getUserById.mockResolvedValue(null);
  mocks.getUserByUsername.mockResolvedValue(null);
  mocks.getPageByOwner.mockResolvedValue(null);
  mocks.getPageById.mockResolvedValue(null);
  mocks.getRoleById.mockResolvedValue(null);
  mocks.getAllPages.mockResolvedValue([]);
  mocks.getSetting.mockResolvedValue(null); // accountPagePolicy default: per_user
  seedUsers([
    { id: 1, role: "admin", status: "active" },
    { id: 2, role: "admin", status: "active" },
  ]);
});

// ─────────────────────────── admin gate ───────────────────────────

describe("admin gating (every account action)", () => {
  it("rejects unauthenticated callers on every action", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await listAccountsAction()).success).toBe(false);
    expect((await createAccountAction(fd({ username: "bob", password: "Password1" }))).success).toBe(false);
    expect((await setAccountStatusAction(2, "disabled")).success).toBe(false);
    expect((await assignAccountRoleAction(2, 2)).success).toBe(false);
    expect((await deleteAccountAction(fd({ userId: "2" }))).success).toBe(false);
    expect((await reassignPageSlugAction(fd({ pageId: "1", slug: "x" }))).success).toBe(false);
  });

  it("rejects non-admin (owner) sessions with forbidden", async () => {
    mocks.getSession.mockResolvedValue({ userId: 5, username: "member", exp: Date.now() + 60000, pv: 1, role: "owner" });
    mocks.getCapabilitiesForUser.mockResolvedValue({
      roleText: "owner",
      caps: { pagesLimit: 1, visibility: "own", manageAccounts: false, manageInstance: false },
    });
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect((await listAccountsAction()).success).toBe(false);
    expect((await setAccountStatusAction(2, "disabled")).success).toBe(false);
    expect((await assignAccountRoleAction(2, 2)).success).toBe(false);
    expect((await deleteAccountAction(fd({ userId: "2" }))).success).toBe(false);
    expect((await reassignPageSlugAction(fd({ pageId: "1", slug: "x" }))).success).toBe(false);
  });

  it("blocks demo mode before the session check", async () => {
    mocks.demoGuard.mockReturnValue({ success: false, error: "demo", errorCode: "demo" } as never);
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(false);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── listAccountsAction ───────────────────────────

describe("listAccountsAction", () => {
  it("returns mapped summaries for admins", async () => {
    mocks.listAccountSummaries.mockResolvedValue([
      { id: 1, username: "admin", role: "admin", status: "active", createdAt: "2026-01-01", lastLoginAt: null, pageSlug: "home", passwordHash: "SECRET" },
    ] as never);
    const res = await listAccountsAction();
    expect(res.success).toBe(true);
    if (res.success) {
      const a = res.accounts[0] as Record<string, unknown>;
      expect(a.username).toBe("admin");
      expect(a.pageSlug).toBe("home");
      // passwordHash must never cross the boundary even if the query row has it
      expect(a.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.accounts)).not.toContain("SECRET");
    }
  });
});

// ─────────────────────────── createAccountAction ───────────────────────────

describe("createAccountAction", () => {
  it("creates an account with a hashed password (Argon2id path, never plaintext)", async () => {
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(true);
    expect(mocks.hashPassword).toHaveBeenCalledWith("Password1");
    expect(mocks.createUser).toHaveBeenCalledWith("bob", "hashed-Password1", {});
  });

  it("honors an explicit role row id and validates it exists", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 5, name: "Editor", isBuiltin: false });
    const res = await createAccountAction(fd({ username: "bob", password: "Password1", roleId: "5" }));
    expect(res.success).toBe(true);
    expect(mocks.createUser).toHaveBeenCalledWith("bob", "hashed-Password1", { roleId: 5 });
  });

  it("rejects an unknown role id with not-found", async () => {
    const res = await createAccountAction(fd({ username: "bob", password: "Password1", roleId: "99" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("2B.4 page policy per_user (default): provisions the account's own page, slug collision-safe", async () => {
    mocks.getAllPages.mockResolvedValue([{ id: 1, slug: "bob" }]);
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(true);
    expect(mocks.createPage).toHaveBeenCalledWith({ slug: "bob-2", title: "bob", userId: 9 });
  });

  it("2B.4 page policy manual: NO page is provisioned", async () => {
    mocks.getSetting.mockResolvedValue("manual");
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(true);
    expect(mocks.createPage).not.toHaveBeenCalled();
  });

  it("rejects duplicate usernames with conflict", async () => {
    mocks.getUserByUsername.mockResolvedValue({ id: 7, username: "bob" });
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("conflict");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it.each([
    ["short", "Ab1x"],
    ["no lowercase", "PASSWORD1"],
    ["no uppercase", "password1"],
    ["no digit", "Passwordxyz"],
    ["too long", "A1" + "x".repeat(300)],
  ])("rejects weak password (%s)", async (_label, password) => {
    const res = await createAccountAction(fd({ username: "bob", password }));
    expect(res.success).toBe(false);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it.each(["ab", "bad space", "bad!char", "bad#char"])("rejects invalid username %j", async (username) => {
    const res = await createAccountAction(fd({ username, password: "Password1" }));
    expect(res.success).toBe(false);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("maps a query-layer failure to an internal ActionResult instead of throwing", async () => {
    mocks.createUser.mockRejectedValue(new Error("db down"));
    const res = await createAccountAction(fd({ username: "bob", password: "Password1" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("internal");
  });
});

// ─────────────────────────── setAccountStatusAction ───────────────────────────

describe("setAccountStatusAction", () => {
  it("disables and enables an account", async () => {
    mocks.getUserById.mockResolvedValue({ id: 2, role: "owner", status: "active" });
    const res = await setAccountStatusAction(2, "disabled");
    expect(res.success).toBe(true);
    expect(mocks.updateUserStatus).toHaveBeenCalledWith(2, "disabled");

    const res2 = await setAccountStatusAction(2, "active");
    expect(res2.success).toBe(true);
    expect(mocks.updateUserStatus).toHaveBeenCalledWith(2, "active");
  });

  it("refuses to disable your own account", async () => {
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    const res = await setAccountStatusAction(1, "disabled");
    expect(res.success).toBe(false);
    expect(mocks.updateUserStatus).not.toHaveBeenCalled();
  });

  it("refuses to disable the last active admin", async () => {
    seedUsers([{ id: 1, role: "admin", status: "active" }]);
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    const res = await setAccountStatusAction(1, "disabled");
    expect(res.success).toBe(false);
    expect(mocks.updateUserStatus).not.toHaveBeenCalled();
  });

  it("counts only ACTIVE admins for the last-admin guard (a disabled admin doesn't block)", async () => {
    seedUsers([
      { id: 1, role: "admin", status: "active" },
      { id: 2, role: "admin", status: "disabled" },
    ]);
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    const res = await setAccountStatusAction(1, "disabled");
    expect(res.success).toBe(false);
    expect(mocks.updateUserStatus).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown user", async () => {
    const res = await setAccountStatusAction(42, "disabled");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });
});

// ─────────────────────────── setAccountRoleAction ───────────────────────────

describe("assignAccountRoleAction", () => {
  const memberRole = { id: 2, name: "Member", isBuiltin: true, pagesLimit: 1, pagesVisibility: "own", canManageAccounts: false, canManageInstance: false };
  const adminRole = { id: 1, name: "Admin", isBuiltin: true, pagesLimit: null, pagesVisibility: "manage_all", canManageAccounts: true, canManageInstance: true };

  it("assigns a role row and bumps sessionVersion (stale claims must die)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getRoleById.mockResolvedValue(memberRole);
    // keyed by userId: the gate resolves the SESSION (admin), the action resolves the TARGET (member)
    mocks.getCapabilitiesForUser.mockImplementation(async (userId: number) =>
      userId === 3
        ? { roleText: "owner", caps: { pagesLimit: 1, visibility: "own", manageAccounts: false, manageInstance: false } }
        : { roleText: "admin", caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true } },
    );
    const res = await assignAccountRoleAction(3, 2);
    expect(res.success).toBe(true);
    expect(mocks.updateUserRoleById).toHaveBeenCalledWith(3, 2);
    expect(mocks.updateSetting).toHaveBeenCalledWith("sessionVersion", "1");
  });

  it("refuses to demote the LAST instance admin (capability-based)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    mocks.getRoleById.mockResolvedValue(memberRole);
    mocks.listInstanceAdminIds.mockResolvedValue([1]);
    const res = await assignAccountRoleAction(1, 2);
    expect(res.success).toBe(false);
    expect(mocks.updateUserRoleById).not.toHaveBeenCalled();
  });

  it("ALLOWS demotion when a second instance admin exists (handover)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    mocks.getRoleById.mockResolvedValue(memberRole);
    mocks.listInstanceAdminIds.mockResolvedValue([1, 2]);
    const res = await assignAccountRoleAction(1, 2);
    expect(res.success).toBe(true);
    expect(mocks.updateUserRoleById).toHaveBeenCalledWith(1, 2);
  });

  it("assigning the Admin role to a member never trips the invariant", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getRoleById.mockResolvedValue(adminRole);
    mocks.getCapabilitiesForUser.mockImplementation(async (userId: number) =>
      userId === 3
        ? { roleText: "owner", caps: { pagesLimit: 1, visibility: "own", manageAccounts: false, manageInstance: false } }
        : { roleText: "admin", caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true } },
    );
    const res = await assignAccountRoleAction(3, 1);
    expect(res.success).toBe(true);
  });

  it("returns not-found for an unknown user or role", async () => {
    expect((await assignAccountRoleAction(42, 2)).success).toBe(false);
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    const res = await assignAccountRoleAction(3, 99);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });
});

// ─────────────────────────── deleteAccountAction ───────────────────────────

describe("deleteAccountAction", () => {
  it("deletes an account with no page", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    const res = await deleteAccountAction(fd({ userId: "3" }));
    expect(res.success).toBe(true);
    expect(mocks.deleteUser).toHaveBeenCalledWith(3);
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("keeps the page and releases nothing when no slug fields are passed (FK cascades owner to NULL)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getPageByOwner.mockResolvedValue({ id: 30, slug: "bob", userId: 3 });
    const res = await deleteAccountAction(fd({ userId: "3" }));
    expect(res.success).toBe(true);
    expect(mocks.deleteUser).toHaveBeenCalledWith(3);
    expect(mocks.setPageOwner).not.toHaveBeenCalled();
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("reassigns the page slug when a new slug is given and release is OFF", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getPageByOwner.mockResolvedValue({ id: 30, slug: "bob", userId: 3 });
    const res = await deleteAccountAction(fd({ userId: "3", slug: "bob-archive" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).toHaveBeenCalledWith(30, { slug: "bob-archive" });
    expect(mocks.setPageOwner).not.toHaveBeenCalled();
    expect(mocks.deleteUser).toHaveBeenCalledWith(3);
  });

  it("releases the slug when the checkbox is on: page detached, slug tombstoned, content kept", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getPageByOwner.mockResolvedValue({ id: 30, slug: "bob", userId: 3 });
    const res = await deleteAccountAction(fd({ userId: "3", releaseSlug: "on", slug: "bob" }));
    expect(res.success).toBe(true);
    expect(mocks.setPageOwner).toHaveBeenCalledWith(30, null);
    expect(mocks.updatePage).toHaveBeenCalledWith(30, { slug: "deleted-30" });
    expect(mocks.deleteUser).toHaveBeenCalledWith(3);
  });

  it("sanitizes a messy replacement slug (spaces→dashes, symbols stripped)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getPageByOwner.mockResolvedValue({ id: 30, slug: "bob", userId: 3 });
    const res = await deleteAccountAction(fd({ userId: "3", slug: "Bob Archive!" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).toHaveBeenCalledWith(30, { slug: "bob-archive" });
  });

  it("rejects a replacement slug that normalizes to empty (never silently clears the address)", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.getPageByOwner.mockResolvedValue({ id: 30, slug: "bob", userId: 3 });
    const res = await deleteAccountAction(fd({ userId: "3", slug: "!!!" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("refuses to delete your own account", async () => {
    const res = await deleteAccountAction(fd({ userId: "1" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses to delete the last active admin", async () => {
    seedUsers([{ id: 1, role: "admin", status: "active" }]);
    mocks.getUserById.mockResolvedValue({ id: 1, role: "admin", status: "active" });
    const res = await deleteAccountAction(fd({ userId: "1" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown user", async () => {
    const res = await deleteAccountAction(fd({ userId: "42" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("maps a query-layer failure to an internal ActionResult instead of throwing", async () => {
    mocks.getUserById.mockResolvedValue({ id: 3, role: "owner", status: "active" });
    mocks.deleteUser.mockRejectedValue(new Error("db down"));
    const res = await deleteAccountAction(fd({ userId: "3" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("internal");
  });
});

// ─────────────────────────── reassignPageSlugAction ───────────────────────────

describe("reassignPageSlugAction", () => {
  it("reassigns a page slug", async () => {
    mocks.getPageById.mockResolvedValue({ id: 30, slug: "old-slug", userId: 3 });
    const res = await reassignPageSlugAction(fd({ pageId: "30", slug: "new-slug" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).toHaveBeenCalledWith(30, { slug: "new-slug" });
  });

  it("no-ops when the slug is unchanged (case-insensitive)", async () => {
    mocks.getPageById.mockResolvedValue({ id: 30, slug: "New-Slug", userId: 3 });
    const res = await reassignPageSlugAction(fd({ pageId: "30", slug: "new-slug" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("sanitizes the slug like every slug input in the app", async () => {
    mocks.getPageById.mockResolvedValue({ id: 30, slug: "old-slug", userId: 3 });
    const res = await reassignPageSlugAction(fd({ pageId: "30", slug: "New Slug!" }));
    expect(res.success).toBe(true);
    expect(mocks.updatePage).toHaveBeenCalledWith(30, { slug: "new-slug" });
  });

  it("rejects a slug that normalizes to empty", async () => {
    mocks.getPageById.mockResolvedValue({ id: 30, slug: "old-slug", userId: 3 });
    const res = await reassignPageSlugAction(fd({ pageId: "30", slug: "!!!" }));
    expect(res.success).toBe(false);
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("returns not-found for an unknown page", async () => {
    const res = await reassignPageSlugAction(fd({ pageId: "42", slug: "new-slug" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });

  it("requires a non-empty slug", async () => {
    const res = await reassignPageSlugAction(fd({ pageId: "30", slug: "" }));
    expect(res.success).toBe(false);
  });
});

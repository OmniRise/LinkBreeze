import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #124 2B — role management actions. Tests written BEFORE the implementation.
 *
 * Invariants under test:
 *  - every role action needs a session whose capabilities allow BOTH
 *    manageAccounts AND manageInstance (plain manageAccounts isn't enough)
 *  - builtin roles (Admin, Member) can never be deleted
 *  - the builtin Admin role can never be edited into something weaker
 *  - deleting a role that still has users is refused unless a reassign
 *    target is given; users are moved, then the role is deleted
 *  - duplicate role names are a conflict
 */

const mocks = vi.hoisted(() => ({
  demoGuard: vi.fn((): null => null),
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({
    userId: 1,
    username: "admin",
    exp: Date.now() + 60000,
    pv: 1,
  })),
  revalidatePath: vi.fn(),
  getCapabilitiesForUser: vi.fn(async (userId: number) => ({
    roleText: userId === 1 ? "admin" : "owner",
    caps: userId === 1
      ? { pagesLimit: null as number | null, visibility: "manage_all", manageAccounts: true, manageInstance: true }
      : { pagesLimit: 1 as number | null, visibility: "own", manageAccounts: false, manageInstance: false },
  })),
  listRoles: vi.fn(async () => [] as unknown[]),
  getRoleById: vi.fn(async () => null as unknown),
  getRoleByName: vi.fn(async () => null as unknown),
  createRole: vi.fn(async () => ({ id: 5 })),
  updateRole: vi.fn(async () => undefined),
  deleteRole: vi.fn(async () => undefined),
  countUsersWithRole: vi.fn(async () => 0),
  moveUsersToRole: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/queries", () => ({
  getCapabilitiesForUser: mocks.getCapabilitiesForUser,
  listRoles: mocks.listRoles,
  getRoleById: mocks.getRoleById,
  getRoleByName: mocks.getRoleByName,
  createRole: mocks.createRole,
  updateRole: mocks.updateRole,
  deleteRole: mocks.deleteRole,
  countUsersWithRole: mocks.countUsersWithRole,
  moveUsersToRole: mocks.moveUsersToRole,
  getSetting: vi.fn(async () => null),
  updateSetting: vi.fn(async () => undefined),
}));

import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
} from "@/server/actions/roles";

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

function denyInstance() {
  mocks.getCapabilitiesForUser.mockResolvedValue({
    roleText: "owner",
    caps: { pagesLimit: 1, visibility: "own", manageAccounts: true, manageInstance: false },
  });
}
function plainMember() {
  mocks.getCapabilitiesForUser.mockResolvedValue({
    roleText: "owner",
    caps: { pagesLimit: 1, visibility: "own", manageAccounts: false, manageInstance: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoGuard.mockReturnValue(null);
  // mockResolvedValue values PERSIST across clearAllMocks — the "no session"
  // queued by the unauthenticated test must be re-established here.
  mocks.getSession.mockResolvedValue({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 });
  mocks.getRoleById.mockResolvedValue(null);
  mocks.getRoleByName.mockResolvedValue(null);
  mocks.getCapabilitiesForUser.mockResolvedValue({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  });
});

describe("role action gating", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await createRoleAction(fd({ name: "X" }))).success).toBe(false);
    expect((await updateRoleAction(fd({ roleId: "3", name: "X" }))).success).toBe(false);
    expect((await deleteRoleAction(fd({ roleId: "3" }))).success).toBe(false);
  });

  it("rejects sessions with manageAccounts but NOT manageInstance", async () => {
    denyInstance();
    const res = await createRoleAction(fd({ name: "X" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createRole).not.toHaveBeenCalled();
  });

  it("rejects plain members", async () => {
    plainMember();
    expect((await deleteRoleAction(fd({ roleId: "3" }))).success).toBe(false);
    expect(mocks.deleteRole).not.toHaveBeenCalled();
  });
});

describe("createRoleAction", () => {
  it("creates a role with validated fields", async () => {
    const res = await createRoleAction(
      fd({ name: "Editor", pagesLimit: "3", pagesVisibility: "view_all", canManageAccounts: "off", canManageInstance: "off" }),
    );
    expect(res.success).toBe(true);
    expect(mocks.createRole).toHaveBeenCalledWith({
      name: "Editor",
      pagesLimit: 3,
      pagesVisibility: "view_all",
      canManageAccounts: false,
      canManageInstance: false,
    });
  });

  it("pagesLimit empty string means unlimited (NULL)", async () => {
    await createRoleAction(fd({ name: "Editor", pagesLimit: "", pagesVisibility: "own" }));
    expect(mocks.createRole).toHaveBeenCalledWith(expect.objectContaining({ pagesLimit: null }));
  });

  it("rejects duplicate names with conflict", async () => {
    mocks.getRoleByName.mockResolvedValue({ id: 2, name: "Editor" });
    const res = await createRoleAction(fd({ name: "Editor", pagesVisibility: "own" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("conflict");
  });

  it("rejects invalid visibility values", async () => {
    const res = await createRoleAction(fd({ name: "Bad", pagesVisibility: "everything" }));
    expect(res.success).toBe(false);
    expect(mocks.createRole).not.toHaveBeenCalled();
  });

  it("rejects negative or garbage pagesLimit", async () => {
    expect((await createRoleAction(fd({ name: "Bad", pagesLimit: "-2", pagesVisibility: "own" }))).success).toBe(false);
    expect((await createRoleAction(fd({ name: "Bad", pagesLimit: "abc", pagesVisibility: "own" }))).success).toBe(false);
  });
});

describe("updateRoleAction", () => {
  it("updates a custom role", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 3, name: "Editor", isBuiltin: false });
    const res = await updateRoleAction(fd({ roleId: "3", name: "Editor", pagesLimit: "5", pagesVisibility: "manage_all" }));
    expect(res.success).toBe(true);
    expect(mocks.updateRole).toHaveBeenCalledWith(3, expect.objectContaining({ pagesVisibility: "manage_all", pagesLimit: 5 }));
  });

  it("NEVER lets anyone weaken the builtin Admin role", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 1, name: "Admin", isBuiltin: true });
    const res = await updateRoleAction(fd({ roleId: "1", name: "Admin", pagesVisibility: "own", canManageAccounts: "off", canManageInstance: "off" }));
    expect(res.success).toBe(false);
    expect(mocks.updateRole).not.toHaveBeenCalled();
  });

  it("allows renaming a builtin Member's limit (not a lockout risk) but not its builtin flag", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 2, name: "Member", isBuiltin: true });
    const res = await updateRoleAction(fd({ roleId: "2", name: "Member", pagesLimit: "2", pagesVisibility: "own" }));
    expect(res.success).toBe(true);
    expect(mocks.updateRole).toHaveBeenCalled();
  });

  it("returns not-found for unknown roles", async () => {
    const res = await updateRoleAction(fd({ roleId: "42", name: "Ghost", pagesVisibility: "own" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });

  it("rejects renaming to an existing name", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 3, name: "Editor", isBuiltin: false });
    mocks.getRoleByName.mockResolvedValue({ id: 4, name: "Taken" });
    const res = await updateRoleAction(fd({ roleId: "3", name: "Taken", pagesVisibility: "own" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("conflict");
  });
});

describe("deleteRoleAction", () => {
  it("refuses to delete builtin roles (Admin AND Member)", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 1, name: "Admin", isBuiltin: true });
    expect((await deleteRoleAction(fd({ roleId: "1" }))).success).toBe(false);
    mocks.getRoleById.mockResolvedValue({ id: 2, name: "Member", isBuiltin: true });
    expect((await deleteRoleAction(fd({ roleId: "2" }))).success).toBe(false);
    expect(mocks.deleteRole).not.toHaveBeenCalled();
  });

  it("refuses to delete a role that still has users without a reassign target", async () => {
    mocks.getRoleById.mockResolvedValue({ id: 3, name: "Editor", isBuiltin: false });
    mocks.countUsersWithRole.mockResolvedValue(4);
    const res = await deleteRoleAction(fd({ roleId: "3" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteRole).not.toHaveBeenCalled();
    expect(mocks.moveUsersToRole).not.toHaveBeenCalled();
  });

  it("with a reassign target: moves users, then deletes", async () => {
    mocks.countUsersWithRole.mockResolvedValue(4);
    mocks.getRoleById.mockReset();
    mocks.getRoleById
      .mockResolvedValueOnce({ id: 3, name: "Editor", isBuiltin: false }) // the role
      .mockResolvedValueOnce({ id: 2, name: "Member", isBuiltin: true }); // the target
    const res = await deleteRoleAction(fd({ roleId: "3", reassignTo: "2" }));
    expect(res.success).toBe(true);
    expect(mocks.moveUsersToRole).toHaveBeenCalledWith(3, 2);
    expect(mocks.deleteRole).toHaveBeenCalledWith(3);
  });

  it("rejects an unknown reassign target", async () => {
    mocks.getRoleById.mockReset();
    mocks.getRoleById.mockResolvedValueOnce({ id: 3, name: "Editor", isBuiltin: false }); // the role
    mocks.getRoleById.mockResolvedValueOnce(null); // the target
    const res = await deleteRoleAction(fd({ roleId: "3", reassignTo: "99" }));
    expect(res.success).toBe(false);
    expect(mocks.deleteRole).not.toHaveBeenCalled();
  });

  it("returns not-found for unknown roles", async () => {
    const res = await deleteRoleAction(fd({ roleId: "42" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("not_found");
  });
});

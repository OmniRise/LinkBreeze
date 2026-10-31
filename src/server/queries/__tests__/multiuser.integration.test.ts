/**
 * Integration tests: #124 multi-user at the QUERY level (real sql.js DB).
 *
 * The action-level matrix (ownership.test.ts) proves the gates fire in the
 * actions; this file proves the DATA LAYER behaves the way those gates and
 * invariants assume: user rows carry role/status, page ownership links and
 * cascades work, account summaries never leak secrets, and the last-admin
 * count predicate the actions rely on reads true from a real DB.
 */
import { describe, it, expect } from "vitest";
import "./integration-setup";
import { db } from "./integration-setup";
import * as schema from "@/db/schema";

import {
  createUser,
  getUserByUsername,
  getUserById,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  listUsers,
  listAccountSummaries,
  getPageByOwner,
  getPageById,
  createPage,
} from "@/server/queries";
import { canAccessPage } from "@/lib/ownership";

describe("[integration] multi-user accounts", () => {
  it("createFirstUser bootstraps an ADMIN (both setup paths must agree)", async () => {
    // the harness seeds its own admin; wipe to exercise the first-user path
    db.delete(schema.users).run();
    const { createFirstUser } = await import("@/server/queries");
    const u = createFirstUser("bootstrap", "hash");
    expect(u).not.toBeNull();
    expect(u!.role).toBe("admin");
    // second call on a non-empty table returns null (TOCTOU guard intact)
    expect(createFirstUser("second", "hash")).toBeNull();
  });

  it("creates users with explicit role and lifecycle defaults", async () => {
    const admin = await createUser("root", "hash-a", { role: "admin" });
    const member = await createUser("member", "hash-m");
    expect(admin.role).toBe("admin");
    expect(member.role).toBe("owner");
    expect(admin.status).toBe("active");
    expect(member.status).toBe("active");
    expect(admin.lastLoginAt).toBeNull();
  });

  it("refuses duplicate usernames (unique constraint)", async () => {
    await createUser("dup", "hash-1");
    await expect(createUser("dup", "hash-2")).rejects.toThrow();
  });

  it("reads users back by username and id; unknown ids return null", async () => {
    const u = await createUser("findme", "hash-x", { role: "owner" });
    expect((await getUserByUsername("findme"))?.id).toBe(u.id);
    expect((await getUserByUsername("nobody"))).toBeNull();
    expect((await getUserById(u.id))?.username).toBe("findme");
    expect(await getUserById(424242)).toBeNull();
  });

  it("persists status and role updates", async () => {
    const u = await createUser("toggle", "hash-t");
    await updateUserStatus(u.id, "disabled");
    expect((await getUserById(u.id))?.status).toBe("disabled");
    await updateUserStatus(u.id, "active");
    await updateUserRole(u.id, "admin");
    const reread = await getUserById(u.id);
    expect(reread?.status).toBe("active");
    expect(reread?.role).toBe("admin");
  });

  it("listAccountSummaries joins the owned page slug and NEVER carries secret columns", async () => {
    const u1 = await createUser("summ1", "hash-1");
    const u2 = await createUser("summ2", "hash-2");
    await createPage({ slug: "summ1-page", title: "P1", userId: u1.id });

    const rows = await listAccountSummaries();
    const r1 = rows.find((r) => r.id === u1.id)!;
    const r2 = rows.find((r) => r.id === u2.id)!;
    expect(r1.pageSlug).toBe("summ1-page");
    expect(r2.pageSlug).toBeNull();

    const keys = Object.keys(r1);
    for (const secret of ["passwordHash", "totpSecret", "recoveryCodes"]) {
      expect(keys).not.toContain(secret);
    }
  });

  it("deleting a user cascades page ownership to NULL but KEEPS the page content", async () => {
    const u = await createUser("doomed", "hash-d");
    const page = await createPage({ slug: "doomed-page", title: "Content survives", userId: u.id });
    expect((await getPageByOwner(u.id))?.slug).toBe("doomed-page");

    await deleteUser(u.id);
    expect(await getUserById(u.id)).toBeNull();

    const orphan = await getPageById(page.id);
    expect(orphan).not.toBeNull();
    expect(orphan!.title).toBe("Content survives");
    expect(orphan!.userId).toBeNull();
  });

  it("the last-active-admin predicate reads correctly from a real DB", async () => {
    const a1 = await createUser("pa1", "h", { role: "admin" });
    const a2 = await createUser("pa2", "h", { role: "admin" });
    const pairActive = () =>
      listUsers().then(
        (us) =>
          us.filter((u) => [a1.id, a2.id].includes(u.id) && u.role === "admin" && u.status === "active")
            .length,
      );

    expect(await pairActive()).toBe(2);
    await updateUserStatus(a2.id, "disabled");
    expect(await pairActive()).toBe(1); // guard trips from here on
    await updateUserStatus(a2.id, "active");
    await updateUserRole(a2.id, "owner");
    expect(await pairActive()).toBe(1); // demotion also leaves one
  });
});

describe("[integration] ownership matrix at the query + predicate level", () => {
  it.each([
    // [actor, target page, expected canAccessPage]
    { actor: "member-own", role: "owner", userId: "u2", pageUserId: "u2", ok: true },
    { actor: "member-other", role: "owner", userId: "u2", pageUserId: "u1", ok: false },
    { actor: "member-legacy", role: "owner", userId: "u2", pageUserId: null, ok: false },
    { actor: "admin-any", role: "admin", userId: "u1", pageUserId: "u2", ok: true },
    { actor: "admin-legacy", role: "admin", userId: "u1", pageUserId: null, ok: true },
  ])("$actor → canAccessPage=$ok", async ({ actor, role, userId, pageUserId, ok }) => {
    const [u1, u2] = await Promise.all([
      getUserByUsername("matrix-admin").then((u) => u ?? createUser("matrix-admin", "h", { role: "admin" })),
      getUserByUsername("matrix-member").then((u) => u ?? createUser("matrix-member", "h")),
    ]);
    const ownerIds: Record<string, number> = { u1: u1.id, u2: u2.id };
    const page = await createPage({
      slug: `matrix-${actor}`,
      title: "T",
      userId: pageUserId === null ? null : ownerIds[pageUserId],
    });
    expect(canAccessPage({ userId: ownerIds[userId], role }, page)).toBe(ok);
  });

  it("getPageByOwner returns only the owned page (the scoping primitive)", async () => {
    const u = await createUser("scoping2", "h");
    const other = await createUser("other2", "h");
    const mine = await createPage({ slug: "mine-scope2", title: "T", userId: u.id });
    await createPage({ slug: "theirs-scope2", title: "T", userId: other.id });

    expect((await getPageByOwner(u.id))?.id).toBe(mine.id);
    expect(await getPageByOwner(other.id)).not.toBeNull();
    expect(await getPageByOwner(424242)).toBeNull();
  });

  it("missing-role pages and garbage role claims normalize to owner, never admin", async () => {
    // The backward-compat rule cuts ONE way: absent/garbage role = owner.
    // Only the literal "admin" gets admin power (normalizeRole in ownership.ts).
    const owner = await createUser("norm-owner", "h");
    const admin = await createUser("norm-admin", "h", { role: "admin" });
    const page = await createPage({ slug: "norm-page2", title: "T", userId: owner.id });
    const legacy = await createPage({ slug: "norm-legacy2", title: "T", userId: null });

    expect(canAccessPage({ userId: admin.id, role: undefined }, page)).toBe(false);
    expect(canAccessPage({ userId: admin.id, role: "superuser" }, page)).toBe(false);
    expect(canAccessPage({ userId: admin.id, role: "admin" }, page)).toBe(true);
    // legacy rows stay admin-only even for a real owner
    expect(canAccessPage({ userId: owner.id, role: "owner" }, legacy)).toBe(false);
    expect(canAccessPage({ userId: admin.id, role: "admin" }, legacy)).toBe(true);
  });
});

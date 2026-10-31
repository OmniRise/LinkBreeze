/**
 * Integration tests: #124 follow-up audit log at the DATA level (real sql.js
 * DB). Proves the append-only store keeps actor snapshots readable after user
 * deletion, filters (actor/action/since/cursor) behave, and retention
 * honors the KV setting.
 */
import { describe, it, expect, vi } from "vitest";
import "./integration-setup";
import { db } from "./integration-setup";
import * as schema from "@/db/schema";
import { eq, sql } from "drizzle-orm";

import { recordAudit, listAuditEntries, listAuditActors, sweepAuditRetention } from "@/server/audit";
import { createUser } from "@/server/queries";

describe("[integration] audit log", () => {
  it("records entries with explicit actor + detail, newest first", async () => {
    const admin = await createUser("aud-admin", "hash");
    await recordAudit("account.created", "bob", { role: "Member" }, {
      actor: { userId: admin.id, username: admin.username },
      ip: "10.0.0.9",
    });
    // login.failed fires with NO session yet — override the harness mock
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValueOnce(null);
    await recordAudit("login.failed", "bob", undefined, { ip: "10.0.0.9" });

    const { entries } = await listAuditEntries();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const [newest, older] = entries;
    expect(newest.action).toBe("login.failed");
    expect(newest.actorUserId).toBeNull(); // no session existed
    expect(newest.ip).toBe("10.0.0.9");
    expect(older.action).toBe("account.created");
    expect(older.actorUsername).toBe("aud-admin");
    expect(JSON.parse(older.detail!)).toEqual({ role: "Member" });
  });

  it("never throws outside a request scope (headers() unavailable)", async () => {
    await expect(recordAudit("settings.updated", "oidc")).resolves.toBeUndefined();
    const { entries } = await listAuditEntries({ action: "settings.updated" });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].ip).toBeNull();
  });

  it("filters by actor and action", async () => {
    const a = await createUser("aud-a", "hash");
    const b = await createUser("aud-b", "hash");
    await recordAudit("role.created", "Editors", undefined, { actor: { userId: a.id, username: "aud-a" } });
    await recordAudit("role.created", "Viewers", undefined, { actor: { userId: b.id, username: "aud-b" } });
    await recordAudit("role.deleted", "Viewers", undefined, { actor: { userId: a.id, username: "aud-a" } });

    const byActor = await listAuditEntries({ actorUserId: a.id, action: "role.created" });
    expect(byActor.entries.map((e) => e.target)).toEqual(["Editors"]);
    const byAction = await listAuditEntries({ action: "role.deleted" });
    expect(byAction.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("cursor pagination walks chronologically without repeats", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAudit("login.success", `u${i}`, undefined, {
        actor: { userId: 1, username: "aud-admin" },
      });
    }
    const page1 = await listAuditEntries({ limit: 2 });
    expect(page1.entries.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    // same-second inserts are the norm — the (createdAt, id) cursor must walk
    const page2 = await listAuditEntries({
      limit: 2,
      before: page1.entries[1].createdAt,
      beforeId: page1.entries[1].id,
    });
    expect(page2.entries.length).toBe(2);
    const ids1 = page1.entries.map((e) => e.id);
    const ids2 = page2.entries.map((e) => e.id);
    expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
  });

  it("actor snapshot survives user deletion (FK set null)", async () => {
    const temp = await createUser("aud-doomed", "hash");
    await recordAudit("account.deleted", "aud-doomed", undefined, {
      actor: { userId: temp.id, username: "aud-doomed" },
    });
    db.delete(schema.users).where(eq(schema.users.id, temp.id)).run();
    const { entries } = await listAuditEntries({ action: "account.deleted" });
    const entry = entries.find((e) => e.target === "aud-doomed");
    expect(entry).toBeDefined();
    expect(entry!.actorUsername).toBe("aud-doomed"); // snapshot kept
    expect(entry!.actorUserId).toBeNull(); // FK nulled
  });

  it("retention deletes entries older than the configured window", async () => {
    // backdate one entry beyond the default 90 days
    db.insert(schema.auditLog)
      .values({ action: "login.success", actorUsername: "ancient", createdAt: "2020-01-01 00:00:00" })
      .run();
    await recordAudit("login.success", "fresh", undefined, { actor: { userId: 1, username: "aud-admin" } });
    await sweepAuditRetention();
    const ancient = db
      .select()
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.actorUsername} = 'ancient'`)
      .all();
    expect(ancient.length).toBe(0);
  });

  it("listAuditActors returns distinct actors with usernames", async () => {
    const actors = await listAuditActors();
    const names = actors.map((a) => a.username);
    expect(names).toContain("aud-admin");
    expect(names).toContain("aud-a");
  });
});

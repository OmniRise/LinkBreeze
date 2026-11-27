import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import "./integration-setup";
import { db } from "./integration-setup";
import * as schema from "@/db/schema";
import { claimInvite, getValidInvite } from "@/server/queries";
import type { InferInsertModel } from "drizzle-orm";

type InviteInsert = InferInsertModel<typeof schema.invites>;

function seedInvite(overrides: Partial<InviteInsert> = {}): { id: number; tokenHash: string } {
  const tokenHash = "hash-" + Math.random().toString(36).slice(2);
  const row = db
    .insert(schema.invites)
    .values({
      tokenHash,
      expiresAt: new Date(Date.now() + 3600_000).toISOString().replace(/\.\d+Z$/, ""),
      ...overrides,
    })
    .returning()
    .all()[0];
  return { id: row.id, tokenHash: row.tokenHash };
}

beforeEach(async () => {
  // Invites are user-referenced on create/used-by — clear in dependency order.
  await db.delete(schema.invites);
  await db.delete(schema.users);
});

describe("claimInvite — atomic single-winner acceptance (security audit AB-3)", () => {
  it("claims a pending, unexpired invite and marks it used", async () => {
    const { tokenHash, id } = seedInvite();
    const claimed = await claimInvite(tokenHash);
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(id);
    expect(claimed!.usedAt).not.toBeNull();
    // getValidInvite agrees — a second acceptance attempt is refused.
    expect(await getValidInvite(tokenHash)).toBeNull();
  });

  it("a second claim of the same token loses (returns null)", async () => {
    const { tokenHash } = seedInvite();
    expect(await claimInvite(tokenHash)).not.toBeNull();
    expect(await claimInvite(tokenHash)).toBeNull();
  });

  it("refuses an expired invite without touching it", async () => {
    const { tokenHash, id } = seedInvite({
      expiresAt: new Date(Date.now() - 60_000).toISOString().replace(/\.\d+Z$/, ""),
    });
    expect(await claimInvite(tokenHash)).toBeNull();
    const row = db.select().from(schema.invites).where(eq(schema.invites.id, id)).all()[0];
    expect(row.usedAt).toBeNull();
  });

  it("refuses an unknown token hash", async () => {
    expect(await claimInvite("hash-nonexistent")).toBeNull();
  });
});

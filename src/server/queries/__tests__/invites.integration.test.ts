/**
 * Integration tests: #124 follow-up invitations, stage 1 (real sql.js DB).
 * Proves the token lifecycle: hashed storage, single-use, expiry, revocation,
 * and the lazy sweep.
 */
import { describe, it, expect } from "vitest";
import "./integration-setup";
import { db } from "./integration-setup";

import {
  createInvite,
  getValidInvite,
  markInviteUsed,
  purgeExpiredInvites,
  revokeInvite,
} from "@/server/queries";
import { hashInviteToken } from "@/lib/invite-token";

describe("[integration] invites", () => {
  it("stores only the hash — the raw token is never persisted", async () => {
    const token = "raw-token-abc";
    await createInvite({
      tokenHash: hashInviteToken(token),
      roleId: null,
      createdBy: 1,
      expiresAt: "2099-01-01 00:00:00",
    });
    const all = db.select().from((await import("@/db/schema")).invites).all();
    const stored = JSON.stringify(all);
    expect(stored).not.toContain(token);
    expect(all.some((r: { tokenHash: string }) => r.tokenHash === hashInviteToken(token))).toBe(true);
  });

  it("resolves a valid token, then marks it used → single-use", async () => {
    const token = "single-use-token";
    const invite = await createInvite({
      tokenHash: hashInviteToken(token),
      roleId: 2,
      createdBy: 1,
      expiresAt: "2099-01-01 00:00:00",
    });
    expect(await getValidInvite(hashInviteToken(token))).not.toBeNull();
    await markInviteUsed(invite.id, 1); // usedBy FK → seeded admin
    expect(await getValidInvite(hashInviteToken(token))).toBeNull();
  });

  it("expired invitations are invalid", async () => {
    await createInvite({
      tokenHash: hashInviteToken("expired-token"),
      roleId: null,
      createdBy: 1,
      expiresAt: "2020-01-01 00:00:00",
    });
    expect(await getValidInvite(hashInviteToken("expired-token"))).toBeNull();
  });

  it("revocation deletes unused invites; purge clears expired ones", async () => {
    const invite = await createInvite({
      tokenHash: hashInviteToken("revoked-token"),
      roleId: null,
      createdBy: 1,
      expiresAt: "2099-01-01 00:00:00",
    });
    await revokeInvite(invite.id);
    expect(await getValidInvite(hashInviteToken("revoked-token"))).toBeNull();

    await createInvite({
      tokenHash: hashInviteToken("old-expired"),
      roleId: null,
      createdBy: 1,
      expiresAt: "2020-06-01 00:00:00",
    });
    await purgeExpiredInvites();
    const all = db.select().from((await import("@/db/schema")).invites).all();
    expect(all.some((r: { tokenHash: string }) => r.tokenHash === hashInviteToken("old-expired"))).toBe(false);
  });
});

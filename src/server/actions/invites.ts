"use server";

import "server-only";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { headers } from "next/headers";

import { createSession, getSession, hashPassword } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  notFoundError,
  conflictError,
  ErrorCode,
} from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/audit";
import { requireAccountsAdmin } from "@/server/access";
import {
  createInvite,
  createPage,
  createUser,
  getRoleById,
  getValidInvite,
  getUserByUsername,
  markInviteUsed,
  purgeExpiredInvites,
  revokeInvite as revokeInviteQuery,
  listInvites,
} from "@/server/queries";
import { accountPagePolicy, uniqueSlugForUsername } from "@/server/actions/accounts";

export interface InviteToken {
  token: string;
  expiresAt: string;
}

import { hashInviteToken, INVITE_TTL_DAYS } from "@/lib/invite-token";

/** Mint an invitation: 32 random bytes, stored hashed, valid 7 days. */
export async function createInviteAction(formData: FormData): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  const session = await getSession();
  if (!session) return unauthorizedError();

  const parsed = z
    .object({ roleId: z.coerce.number().int().positive().nullish() })
    .safeParse({ roleId: formData.get("roleId") });
  if (!parsed.success) return validationError("Invalid role");
  const roleId = parsed.data.roleId ?? null;
  if (roleId && !(await getRoleById(roleId))) return notFoundError("Role not found");

  // Cap outstanding invites so the list stays useful and abuse is bounded.
  const outstanding = (await listInvites()).filter((i) => !i.usedAt);
  if (outstanding.length >= 50) {
    return validationError("Too many pending invites — revoke some first");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  await createInvite({
    tokenHash: hashInviteToken(token),
    roleId,
    createdBy: session.userId,
    expiresAt,
  });
  await recordAudit("settings.updated", "inviteCreated", { roleId });
  revalidatePath("/accounts");
  return { success: true, token, expiresAt };
}

export async function revokeInviteAction(inviteId: number): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  await revokeInviteQuery(inviteId);
  await recordAudit("settings.updated", "inviteRevoked", { inviteId });
  revalidatePath("/accounts");
  return { success: true };
}

export async function listInvitesAction(): Promise<
  ActionResult<{ invites: { id: number; roleId: number | null; roleName: string | null; createdAt: string; expiresAt: string; used: boolean }[] }>
> {
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  const rows = await listInvites();
  const { listRoles } = await import("@/server/queries");
  const roleRows = await listRoles();
  const roleNameById = new Map(roleRows.map((r) => [r.id, r.name]));
  return {
    success: true,
    invites: rows.map((r) => ({
      id: r.id,
      roleId: r.roleId,
      roleName: r.roleId ? roleNameById.get(r.roleId) ?? null : null,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      used: r.usedAt != null,
    })),
  };
}

const acceptSchema = z.object({
  token: z.string().min(10).max(200),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, digits, dots, dashes, and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256)
    .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
    .refine((v) => /[0-9]/.test(v), "Password must contain at least one number"),
});

/**
 * Accept an invitation (public — no session). Creates the account with the
 * invited role, provisions its page per the instance policy, marks the token
 * used, and signs the new member in. Rate limited per IP.
 */
export async function acceptInviteAction(formData: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (h.get("x-real-ip") || "").toString() ||
    "0.0.0.0";
  const rl = rateLimit(`invite:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return {
      success: false,
      error: "Too many attempts — try again in a minute.",
      errorCode: ErrorCode.RATE_LIMIT,
    };
  }

  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { token, username, password } = parsed.data;

  const invite = await getValidInvite(hashInviteToken(token));
  if (!invite) return notFoundError("This invitation is invalid, expired, or already used");

  const existing = await getUserByUsername(username);
  if (existing) return conflictError("Username already taken");

  if (invite.roleId && !(await getRoleById(invite.roleId))) {
    return notFoundError("The invited role no longer exists");
  }

  const user = await createUser(username, await hashPassword(password), invite.roleId ? { roleId: invite.roleId } : {});
  if (await accountPagePolicy() !== "manual") {
    await createPage({
      slug: await uniqueSlugForUsername(username),
      title: username,
      userId: user.id,
    });
  }
  await markInviteUsed(invite.id, user.id);
  await purgeExpiredInvites();
  await recordAudit("account.created", username, { via: "invite", roleId: invite.roleId }, {
    actor: { userId: user.id, username },
    ip,
  });

  await createSession(user.id, username);
  revalidatePath("/dashboard");
  return { success: true };
}

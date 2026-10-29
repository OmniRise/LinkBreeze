"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, hashPassword } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  conflictError,
  notFoundError,
  ErrorCode,
  logError,
} from "@/lib/errors";
import {
  listAccountSummaries,
  getUserById,
  getUserByUsername,
  createUser,
  updateUserStatus,
  deleteUser,
  getPageByOwner,
  setPageOwner,
  updatePage,
  getPageById,
  createPage,
  getAllPages,
  getRoleById,
  listInstanceAdminIds,
  getCapabilitiesForUser,
  getSetting,
  updateSetting,
} from "@/server/queries";
import { requireAccountsAdmin, requireInstanceAdmin } from "@/server/access";
import { recordAudit } from "@/server/audit";
import { requirePasswordConfirmation } from "@/server/actions/confirm";
import { normalizeSlug, slugError, SLUG_ERRORS } from "@/lib/link-slug";

/** First page slug for a new account: the username, made unique with -2/-3… */
export async function uniqueSlugForUsername(username: string): Promise<string> {
  const base = normalizeSlug(username) || "user";
  const taken = new Set((await getAllPages()).map((p) => p.slug.toLowerCase()));
  if (!taken.has(base.toLowerCase()) && !slugError(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * #124 2B.4 — instance page policy: 'per_user' (default) auto-creates each
 * new account's own public page; 'manual' leaves new pages to the admin.
 */
export async function accountPagePolicy(): Promise<"per_user" | "manual"> {
  const v = await getSetting("accountPagePolicy");
  return v === "manual" ? "manual" : "per_user";
}

/**
 * Strip account fields that must never be returned to the client.
 * `pageSlug` is the page this account owns (null when it owns none) — the
 * delete dialog needs it to offer the slug-release option.
 */
function publicAccount(u: {
  id: number;
  username: string;
  role: string;
  roleId?: number | null;
  roleName?: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  pageSlug?: string | null;
}) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    roleId: u.roleId ?? null,
    roleName: u.roleName ?? null,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    pageSlug: u.pageSlug ?? null,
  };
}

export type AccountSummary = ReturnType<typeof publicAccount>;

export async function listAccountsAction(): Promise<ActionResult<{ accounts: AccountSummary[] }>> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  const accounts = (await listAccountSummaries()).map(publicAccount);
  return { success: true, accounts };
}

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(64)
  .regex(
    /^[a-zA-Z0-9_.-]+$/,
    "Username may only contain letters, numbers, dots, hyphens and underscores",
  );

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(256)
  .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Password must contain at least one number");

export async function createAccountAction(formData: FormData): Promise<ActionResult<{ accountId: number }>> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;

  const parsed = z
    .object({
      username: usernameSchema,
      password: passwordSchema,
      // Role ROW id. Absent → the builtin Member role.
      roleId: z.coerce.number().int().positive().nullish(),
    })
    .safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
      roleId: formData.get("roleId"),
    });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { username, password, roleId } = parsed.data;

  const existing = await getUserByUsername(username);
  if (existing) return conflictError("Username already taken");

  // Validate the role up front (a bad id would otherwise silently yield the
  // legacy text mapping instead of the role the admin picked).
  if (roleId) {
    const role = await getRoleById(roleId);
    if (!role) return notFoundError("Role not found");
  }

  try {
    const user = await createUser(username, await hashPassword(password), roleId ? { roleId } : {});
    // 2B.4 page policy: 'per_user' (default) provisions the account's own page.
    if (await accountPagePolicy() !== "manual") {
      await createPage({
        slug: await uniqueSlugForUsername(username),
        title: username,
        userId: user.id,
      });
    }
    await recordAudit("account.created", username, { roleId: roleId ?? null });
    // Every sibling action revalidates; create was the one that skipped it,
    // so a fresh account could stay invisible in the list after a refresh.
    revalidatePath("/accounts");
    return { success: true, accountId: user.id };
  } catch (err) {
    logError("createAccount", err, { username });
    return {
      success: false,
      error: "Something went wrong while creating the account. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function setAccountStatusAction(
  userId: number,
  status: "active" | "disabled",
): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  const session = await getSession();
  if (!session) return unauthorizedError();

  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  if (userId === session.userId && status === "disabled") {
    return validationError("You cannot disable your own account");
  }
  // Never disable the last instance admin (capability-based: a custom role
  // holding manageAccounts+manageInstance counts, a legacy text admin counts).
  if (status === "disabled") {
    const adminIds = await listInstanceAdminIds();
    if (adminIds.includes(userId) && adminIds.length <= 1) {
      return validationError("Cannot disable the last active admin");
    }
  }

  await updateUserStatus(userId, status);
  await recordAudit(status === "disabled" ? "account.disabled" : "account.enabled", target.username);
  revalidatePath("/accounts");
  return { success: true };
}

/**
 * Assign a role ROW to an account (#124 2B). The text-role action this
 * replaces stayed backwards compatible via the resolver: NULL role_id maps
 * through the legacy text. The last-admin invariant is capability-based.
 */
export async function assignAccountRoleAction(
  userId: number,
  roleId: number,
): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;

  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  const role = await getRoleById(roleId);
  if (!role) return notFoundError("Role not found");

  const caps = await getCapabilitiesForUser(userId);
  const wasFullAdmin = caps.caps.manageAccounts && caps.caps.manageInstance;
  const willBeFullAdmin =
    (role.isBuiltin && role.name === "Admin") ||
    (role.canManageAccounts && role.canManageInstance);
  if (wasFullAdmin && !willBeFullAdmin) {
    const adminIds = await listInstanceAdminIds();
    if (adminIds.length <= 1) {
      return validationError("Cannot demote the last active admin");
    }
  }

  const { updateUserRoleById } = await import("@/server/queries");
  await updateUserRoleById(userId, roleId);
  await recordAudit("role.assigned", target.username, { roleId });
  // Capabilities changed → existing sessions carry stale role claims. Bump
  // the sessionVersion so every session re-mints with the correct role.
  const v = Number(await getSetting("sessionVersion")) || 0;
  await updateSetting("sessionVersion", String(v + 1));
  revalidatePath("/accounts");
  return { success: true };
}

const releaseSlugSchema = z.object({
  userId: z.coerce.number(),
  // FormData.get() yields NULL for absent fields — .nullish(), never .optional(),
  // or an unchecked checkbox fails the whole parse (caught by tests-first).
  releaseSlug: z.enum(["on", "off"]).nullish(),
  slug: z.string().nullish(),
});

export async function deleteAccountAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;
  const session = await getSession();
  if (!session) return unauthorizedError();

  const parsed = releaseSlugSchema.safeParse({
    userId: formData.get("userId"),
    releaseSlug: formData.get("releaseSlug"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { userId, releaseSlug, slug } = parsed.data;

  if (userId === session.userId) {
    return validationError("You cannot delete your own account");
  }
  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  // Re-auth before destructive ops (locked design): the acting admin must
  // re-enter their password, so a stolen unlocked tab can't wipe accounts.
  const confirm = await requirePasswordConfirmation(formData);
  if (confirm) return confirm;
  const caps = await getCapabilitiesForUser(userId);
  if (caps.caps.manageAccounts && caps.caps.manageInstance) {
    const adminIds = await listInstanceAdminIds();
    if (adminIds.length <= 1) return validationError("Cannot delete the last active admin");
  }

  const page = await getPageByOwner(userId);
  try {
    if (page) {
      if (slug && releaseSlug !== "on") {
        const norm = normalizeSlug(slug);
        // "###" normalizes to "" — reject rather than silently clearing the
        // page's public address.
        if (!norm) return validationError("Slug is required");
        const reason = slugError(norm);
        if (reason) return validationError(SLUG_ERRORS[reason]);
        await updatePage(page.id, { slug: norm });
      } else if (releaseSlug === "on") {
        // Release: detach ownership and tombstone the slug so a new account
        // can claim it. The page content is preserved.
        await setPageOwner(page.id, null);
        await updatePage(page.id, { slug: `deleted-${page.id}` });
      }
      // Otherwise leave the page owned by the (now-deleted) user id, which
      // cascades to NULL via the FK — content preserved, slug reusable later.
    }
    await deleteUser(userId);
    await recordAudit("account.deleted", target.username);
  } catch (err) {
    logError("deleteAccount", err, { userId });
    return {
      success: false,
      error: "Something went wrong while deleting the account. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }

  revalidatePath("/accounts");
  return { success: true };
}

const reassignSchema = z.object({
  pageId: z.coerce.number(),
  slug: z.string().min(1, "Slug is required"),
});

/**
 * 2B.4 — instance page policy: 'per_user' (default) auto-creates each new
 * account's own page; 'manual' leaves new pages to the admin. Instance-level
 * setting → manageInstance required.
 */
export async function setAccountPagePolicyAction(policy: "per_user" | "manual"): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireInstanceAdmin();
  if (denied) return denied;
  if (policy !== "per_user" && policy !== "manual") return validationError("Invalid policy");
  await updateSetting("accountPagePolicy", policy);
  await recordAudit("settings.updated", "accountPagePolicy", { policy });
  revalidatePath("/accounts");
  return { success: true };
}

export async function reassignPageSlugAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;

  const parsed = reassignSchema.safeParse({
    pageId: formData.get("pageId"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { pageId } = parsed.data;
  const norm = normalizeSlug(parsed.data.slug);
  // Input is SANITIZED (spaces→dashes, symbols stripped) like every slug input
  // in the app — but a fully-symbol input normalizes to "" and must be
  // rejected, never silently clear the page's public address.
  if (!norm) return validationError("Slug is required");
  const reason = slugError(norm);
  if (reason) return validationError(SLUG_ERRORS[reason]);

  const page = await getPageById(pageId);
  if (!page) return notFoundError("Page not found");
  if (page.slug.toLowerCase() === norm.toLowerCase()) {
    return { success: true }; // no-op
  }
  await updatePage(pageId, { slug: norm });
  revalidatePath("/accounts");
  revalidatePath(`/${norm}`, "layout");
  return { success: true };
}

// ─── Per-user session override (#124 follow-up session lifetime) ────────────

const sessionOverrideSchema = z.object({
  userId: z.coerce.number().int().positive(),
  idleMinutes: z
    .union([z.literal(""), z.string()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .pipe(z.number("Invalid idle minutes").int("Invalid idle minutes").positive("Idle minutes must be positive").max(60 * 24 * 365, "Idle minutes too large").nullable()),
  maxHours: z
    .union([z.literal(""), z.string()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .pipe(z.number("Invalid max hours").int("Invalid max hours").positive("Max hours must be positive").max(24 * 365 * 5, "Max hours too large").nullable()),
});

/** Empty fields = inherit (role, then global). */
export async function setUserSessionOverrideAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireAccountsAdmin();
  if (denied) return denied;

  const parsed = sessionOverrideSchema.safeParse({
    userId: formData.get("userId"),
    idleMinutes: formData.get("idleMinutes"),
    maxHours: formData.get("maxHours"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { userId, idleMinutes, maxHours } = parsed.data;
  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");

  const { setUserSessionOverride } = await import("@/server/queries");
  await setUserSessionOverride(userId, idleMinutes, maxHours);
  // A shorter limit may now apply — force re-mint on next request.
  const { getSetting, updateSetting } = await import("@/server/queries");
  const v = Number(await getSetting("sessionVersion")) || 0;
  await updateSetting("sessionVersion", String(v + 1));
  await recordAudit("settings.updated", `sessionOverride:${target.username}`, { idleMinutes, maxHours });
  revalidatePath("/accounts");
  return { success: true };
}

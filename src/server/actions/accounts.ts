"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, hashPassword } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  forbiddenError,
  conflictError,
  notFoundError,
  ErrorCode,
  logError,
} from "@/lib/errors";
import {
  listUsers,
  listAccountSummaries,
  getUserById,
  getUserByUsername,
  createUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getPageByOwner,
  setPageOwner,
  updatePage,
  getPageById,
} from "@/server/queries";
import { normalizeSlug, slugError, SLUG_ERRORS } from "@/lib/link-slug";

/** Admin-only precondition shared by every account action. */
async function requireAdmin() {
  const session = await getSession();
  if (!session) return { session: null, error: unauthorizedError() };
  if (session.role !== "admin") {
    return { session, error: forbiddenError("Only admins can manage accounts") };
  }
  return { session, error: null };
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
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  pageSlug?: string | null;
}) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    pageSlug: u.pageSlug ?? null,
  };
}

export type AccountSummary = ReturnType<typeof publicAccount>;

export async function listAccountsAction(): Promise<ActionResult<{ accounts: AccountSummary[] }>> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireAdmin();
  if (error) return error;
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
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = z
    .object({
      username: usernameSchema,
      password: passwordSchema,
      role: z.enum(["admin", "owner"]).default("owner"),
    })
    .safeParse({
      username: formData.get("username"),
      password: formData.get("password"),
      role: formData.get("role") || "owner",
    });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { username, password, role } = parsed.data;

  const existing = await getUserByUsername(username);
  if (existing) return conflictError("Username already taken");

  try {
    const user = await createUser(username, await hashPassword(password), { role });
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
  const { session, error } = await requireAdmin();
  if (error) return error;

  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  if (userId === session!.userId && status === "disabled") {
    return validationError("You cannot disable your own account");
  }
  // Never disable the last active admin — that would lock the instance.
  if (status === "disabled" && target.role === "admin") {
    const admins = (await listUsers()).filter((u) => u.role === "admin" && u.status === "active");
    if (admins.length <= 1) return validationError("Cannot disable the last active admin");
  }

  await updateUserStatus(userId, status);
  revalidatePath("/accounts");
  return { success: true };
}

export async function setAccountRoleAction(
  userId: number,
  role: "admin" | "owner",
): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const { session, error } = await requireAdmin();
  if (error) return error;

  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  if (userId === session!.userId && role === "owner") {
    return validationError("You cannot remove your own admin role");
  }
  if (target.role === "admin" && role === "owner") {
    const admins = (await listUsers()).filter((u) => u.role === "admin" && u.status === "active");
    if (admins.length <= 1) return validationError("Cannot demote the last active admin");
  }

  await updateUserRole(userId, role);
  // Role changed → existing sessions carry a stale role claim. Bump the
  // sessionVersion so every session re-mints with the correct role.
  const { updateSetting, getSetting } = await import("@/server/queries");
  const v = Number(await getSetting("sessionVersion")) || 0;
  await updateSetting("sessionVersion", String(v + 1));
  revalidatePath("/accounts");
  return { success: true };
}

const releaseSlugSchema = z.object({
  userId: z.coerce.number(),
  releaseSlug: z.enum(["on", "off"]).optional(),
  slug: z.string().optional(),
});

export async function deleteAccountAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const { session, error } = await requireAdmin();
  if (error) return error;

  const parsed = releaseSlugSchema.safeParse({
    userId: formData.get("userId"),
    releaseSlug: formData.get("releaseSlug"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { userId, releaseSlug, slug } = parsed.data;

  if (userId === session!.userId) {
    return validationError("You cannot delete your own account");
  }
  const target = await getUserById(userId);
  if (!target) return notFoundError("Account not found");
  if (target.role === "admin") {
    const admins = (await listUsers()).filter((u) => u.role === "admin" && u.status === "active");
    if (admins.length <= 1) return validationError("Cannot delete the last active admin");
  }

  const page = await getPageByOwner(userId);
  try {
    if (page) {
      if (slug && releaseSlug !== "on") {
        const norm = normalizeSlug(slug);
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

export async function reassignPageSlugAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireAdmin();
  if (error) return error;

  const parsed = reassignSchema.safeParse({
    pageId: formData.get("pageId"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { pageId } = parsed.data;
  const norm = normalizeSlug(parsed.data.slug);
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  forbiddenError,
  conflictError,
  notFoundError,
} from "@/lib/errors";
import {
  getCapabilitiesForUser,
  listRoles,
  getRoleById,
  getRoleByName,
  createRole,
  updateRole,
  deleteRole,
  countUsersWithRole,
  moveUsersToRole,
} from "@/server/queries";

/**
 * #124 2B — role management. Every action requires a session whose
 * capabilities hold BOTH manageAccounts AND manageInstance: a custom role
 * with only manageAccounts can administer accounts but not reshape the
 * permission model itself.
 */
async function requireRoleManager() {
  const session = await getSession();
  if (!session) return { error: unauthorizedError() };
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!(caps.manageAccounts && caps.manageInstance)) {
    return { error: forbiddenError("Only instance admins can manage roles") };
  }
  return { error: null };
}

const nameSchema = z.string().trim().min(1, "Role name is required").max(64);

const visibilitySchema = z.enum(["own", "view_all", "manage_all"]);

/** Checkbox fields arrive as "on"/"off"/absent (null) — absent means off. */
const flag = z
  .enum(["on", "off"])
  .nullish()
  .transform((v) => v === "on");

/** "3" → 3, "" → NULL (unlimited), garbage → parse error. */
const limitSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pages limit must be a non-negative whole number" });
      return z.NEVER;
    }
    return n;
  });

export type RoleActionPayload = {
  name: string;
  pagesLimit: number | null;
  pagesVisibility: "own" | "view_all" | "manage_all";
  canManageAccounts: boolean;
  canManageInstance: boolean;
};

function parseRoleForm(formData: FormData) {
  return z
    .object({
      name: nameSchema,
      pagesLimit: limitSchema,
      pagesVisibility: visibilitySchema,
      canManageAccounts: flag,
      canManageInstance: flag,
    })
    .safeParse({
      name: formData.get("name"),
      pagesLimit: formData.get("pagesLimit") ?? "",
      pagesVisibility: formData.get("pagesVisibility") || "own",
      canManageAccounts: formData.get("canManageAccounts"),
      canManageInstance: formData.get("canManageInstance"),
    });
}

export async function listRolesAction(): Promise<
  ActionResult<{ roles: Awaited<ReturnType<typeof listRoles>> }>
> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireRoleManager();
  if (error) return error;
  return { success: true, roles: await listRoles() };
}

export async function createRoleAction(formData: FormData): Promise<ActionResult<{ roleId: number }>> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireRoleManager();
  if (error) return error;

  const parsed = parseRoleForm(formData);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const existing = await getRoleByName(parsed.data.name);
  if (existing) return conflictError("A role with this name already exists");

  const created = await createRole(parsed.data);
  revalidatePath("/accounts");
  return { success: true, roleId: created.id };
}

const roleIdSchema = z.coerce.number().int().positive();

export async function updateRoleAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireRoleManager();
  if (error) return error;

  const parsed = z
    .object({ roleId: roleIdSchema })
    .safeParse({ roleId: formData.get("roleId") });
  if (!parsed.success) return validationError("Invalid role id");
  const role = await getRoleById(parsed.data.roleId);
  if (!role) return notFoundError("Role not found");

  const fields = parseRoleForm(formData);
  if (!fields.success) {
    return validationError(fields.error.issues[0]?.message ?? "Invalid input");
  }

  // The builtin Admin role is the lockout insurance: it can never be edited
  // into something weaker. (Renaming it is pointless and refused too.)
  if (role.isBuiltin && role.name === "Admin") {
    return validationError("The Admin role cannot be changed");
  }

  if (fields.data.name !== role.name) {
    const nameTaken = await getRoleByName(fields.data.name);
    if (nameTaken) return conflictError("A role with this name already exists");
  }

  await updateRole(parsed.data.roleId, fields.data);
  // Capabilities changed → every session's role claims are potentially stale.
  const { getSetting, updateSetting } = await import("@/server/queries");
  const v = Number(await getSetting("sessionVersion")) || 0;
  await updateSetting("sessionVersion", String(v + 1));
  revalidatePath("/accounts");
  return { success: true };
}

export async function deleteRoleAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const { error } = await requireRoleManager();
  if (error) return error;

  const parsed = z
    .object({
      roleId: roleIdSchema,
      reassignTo: z.coerce.number().int().positive().nullish(),
    })
    .safeParse({ roleId: formData.get("roleId"), reassignTo: formData.get("reassignTo") });
  if (!parsed.success) return validationError("Invalid input");
  const { roleId, reassignTo } = parsed.data;

  const role = await getRoleById(roleId);
  if (!role) return notFoundError("Role not found");
  // Builtins anchor the whole model: Admin is the lockout insurance, Member
  // is the default for JIT provisioning and account creation.
  if (role.isBuiltin) return validationError("Built-in roles cannot be deleted");

  const userCount = await countUsersWithRole(roleId);
  if (userCount > 0) {
    if (!reassignTo) {
      return validationError(
        `${userCount} account${userCount === 1 ? "" : "s"} still use${userCount === 1 ? "s" : ""} this role. Choose a role to move them to.`,
      );
    }
    if (reassignTo === roleId) return validationError("Choose a different role to move accounts to");
    const target = await getRoleById(reassignTo);
    if (!target) return notFoundError("Target role not found");
    await moveUsersToRole(roleId, reassignTo);
  }

  await deleteRole(roleId);
  revalidatePath("/accounts");
  return { success: true };
}

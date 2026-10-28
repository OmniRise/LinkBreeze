import "server-only";

import { getSession } from "@/lib/auth";
import {
  type ActionError,
  unauthorizedError,
  forbiddenError,
} from "@/lib/errors";
import { getCapabilitiesForUser } from "@/server/queries";

/**
 * #124 multi-user capability gates for server actions.
 *
 * The proxy keeps non-admins off the admin PAGES, but a Next server action is
 * a public POST endpoint — every instance-level action must self-defend.
 * These helpers resolve the session's capabilities from the role ROW (source
 * of truth) and return an error ActionResult to propagate, or null to proceed.
 */

async function caps(): Promise<{ userId: number; manageAccounts: boolean; manageInstance: boolean } | null> {
  const session = await getSession();
  if (!session) return null;
  const { caps } = await getCapabilitiesForUser(session.userId);
  return { userId: session.userId, ...caps };
}

/** Instance settings, backups, domains, themes, data import/restore. */
export async function requireInstanceAdmin(): Promise<ActionError | null> {
  const c = await caps();
  if (!c) return unauthorizedError();
  if (!c.manageInstance) return forbiddenError("Only instance admins can change instance settings");
  return null;
}

/** Account + role management. */
export async function requireAccountsAdmin(): Promise<ActionError | null> {
  const c = await caps();
  if (!c) return unauthorizedError();
  if (!c.manageAccounts) return forbiddenError("Only admins can manage accounts");
  return null;
}

/** Convenience for actions that need both (role model changes). */
export async function requireFullAdmin(): Promise<ActionError | null> {
  const c = await caps();
  if (!c) return unauthorizedError();
  if (!(c.manageAccounts && c.manageInstance)) {
    return forbiddenError("Only instance admins can do this");
  }
  return null;
}

/** Throwing variant for non-ActionResult helpers (API routes map to 401/403). */
export async function requireInstanceAdminOrThrow(): Promise<void> {
  const denied = await requireInstanceAdmin();
  if (denied && !denied.success) {
    throw new Error(denied.errorCode === "forbidden" ? "Forbidden" : "Unauthorized");
  }
}

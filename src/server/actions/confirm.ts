import "server-only";

import { getSession, verifyPassword } from "@/lib/auth";
import { getUserById } from "@/server/queries";
import { type ActionResult, validationError, unauthorizedError } from "@/lib/errors";

/**
 * Re-authentication gate for destructive operations (#124 follow-up, locked
 * design): the acting user must re-enter their password. Reads and consumes
 * the `confirmPassword` field from the submitted FormData. Returns an error
 * ActionResult when the confirmation is missing or wrong, null when the
 * caller may proceed.
 */
export async function requirePasswordConfirmation(formData: FormData): Promise<ActionResult | null> {
  const session = await getSession();
  if (!session) return unauthorizedError();
  const password = String(formData.get("confirmPassword") ?? "");
  if (password === "") {
    return validationError("Re-enter your password to confirm this action");
  }
  const actor = await getUserById(session.userId);
  if (!actor) return unauthorizedError();
  const ok = await verifyPassword(password, actor.passwordHash);
  if (!ok) {
    return validationError("Password incorrect — action cancelled");
  }
  return null;
}

/**
 * Ownership & role helpers (#124 multi-user).
 *
 * Pure module — no `@/db`, no `server-only` — so unit tests can exercise the
 * role/ownership logic directly. The session carries a `role` claim; these
 * helpers centralize the two rules that must never drift:
 *
 *  1. Backward compat: a session minted before multi-user (or a user row with
 *     role NULL) is treated as ADMIN — the bootstrapped admin is never silently
 *     demoted. Same for the DEMO_AUTO_LOGIN mock session.
 *  2. Ownership: a non-admin ('owner') may only touch rows whose userId matches
 *     their own. A row with userId NULL is a legacy single-user row — visible to
 *     admins only (an owner must not claim another user's legacy data).
 */
import type { SessionPayload } from "@/lib/session-token";

export type UserRole = "admin" | "owner";

/** Coerce a raw role claim (possibly absent/garbage) to a concrete role. */
export function normalizeRole(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "owner";
}

/** Can the actor manage accounts / global settings? Only admins. */
export function canManageAccounts(actor: { role?: UserRole | null }): boolean {
  return normalizeRole(actor.role) === "admin";
}

/**
 * Can this session act on this page?
 *
 *  - admin              → always (they manage every page on the instance).
 *  - owner              → only their OWN page (userId === session.userId).
 *  - legacy page (userId === null) → admin-only. A non-admin must never be
 *    handed a pre-multi-user page they don't own.
 *
 * Single source of truth for page authorization. Every page-scoped mutating
 * action must call it before touching a row.
 */
export function canAccessPage(
  session: Pick<SessionPayload, "userId" | "role">,
  page: { userId?: number | null } | null | undefined,
): boolean {
  if (!page) return false;
  if (normalizeRole(session.role) === "admin") return true;
  return page.userId != null && page.userId === session.userId;
}

/**
 * Ownership & capability helpers (#124 multi-user).
 *
 * Pure module — no `@/db`, no `server-only` — so unit tests can exercise the
 * role/ownership logic directly. Two layers:
 *
 * LEGACY (kept for sessions + bootstrapped instances): a session carries a
 * `role` text claim; normalizeRole/canAccessPage implement the two rules that
 * must never drift:
 *  1. Backward compat: a session minted before multi-user (or a user row with
 *     role NULL) is treated as ADMIN — the bootstrapped admin is never silently
 *     demoted. Same for the DEMO_AUTO_LOGIN mock session.
 *  2. Ownership: a non-admin ('owner') may only touch rows whose userId matches
 *     their own. A row with userId NULL is a legacy single-user row — visible to
 *     admins only (an owner must not claim another user's legacy data).
 *
 * 2B CAPABILITIES: a role ROW (roles table) is the source of truth. The text
 * role is only a fast-path hint. resolveCapabilities() collapses (legacy text,
 * role row) into concrete capabilities; canViewPage/canEditPage apply them.
 * The builtin Admin row is immune to stripping — a corrupted row can never
 * lock the instance out.
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

// ─── 2B: role-row capabilities ──────────────────────────────────────────────

export type PageVisibility = "own" | "view_all" | "manage_all";

/** The subset of a roles row the resolver needs (keeps this module pure). */
export interface RoleRowLike {
  name: string;
  isBuiltin: boolean;
  pagesLimit: number | null;
  pagesVisibility: string;
  canManageAccounts: boolean;
  canManageInstance: boolean;
}

export interface RoleCapabilities {
  /** Max pages a member may own; NULL = unlimited. */
  pagesLimit: number | null;
  visibility: PageVisibility;
  manageAccounts: boolean;
  manageInstance: boolean;
}

export const ADMIN_CAPABILITIES: RoleCapabilities = {
  pagesLimit: null,
  visibility: "manage_all",
  manageAccounts: true,
  manageInstance: true,
};

export const MEMBER_CAPABILITIES: RoleCapabilities = {
  pagesLimit: 1,
  visibility: "own",
  manageAccounts: false,
  manageInstance: false,
};

const VISIBILITIES: PageVisibility[] = ["own", "view_all", "manage_all"];

function toVisibility(raw: string): PageVisibility {
  return VISIBILITIES.includes(raw as PageVisibility) ? (raw as PageVisibility) : "own";
}

/**
 * Collapse (legacy text role, role row) into concrete capabilities.
 *
 * Order of authority:
 *  1. Builtin Admin row → ALWAYS ADMIN_CAPABILITIES (immune to stripping).
 *  2. Custom/builtin Member row → its own flags (garbage visibility → 'own').
 *  3. No row → legacy text mapping ('admin' → Admin, everything else →
 *     Member). Unknown/absent text denies by default.
 */
export function resolveCapabilities(
  roleText: string | null | undefined,
  roleRow: RoleRowLike | null | undefined,
): RoleCapabilities {
  if (roleRow) {
    if (roleRow.isBuiltin && roleRow.name === "Admin") return ADMIN_CAPABILITIES;
    return {
      pagesLimit: roleRow.pagesLimit ?? null,
      visibility: toVisibility(roleRow.pagesVisibility),
      manageAccounts: !!roleRow.canManageAccounts,
      manageInstance: !!roleRow.canManageInstance,
    };
  }
  return normalizeRole(roleText) === "admin" ? ADMIN_CAPABILITIES : MEMBER_CAPABILITIES;
}

type PageRef = { userId?: number | null } | null | undefined;
type Actor = { userId: number };

/**
 * May this actor READ this page? Admin-caps and manage_all pass for every
 * owned page; view_all passes for owned pages but legacy (userId NULL) rows
 * stay admin-only; own = only their own rows.
 */
export function canViewPage(
  caps: RoleCapabilities,
  actor: Actor,
  page: PageRef,
): boolean {
  if (!page) return false;
  if (caps.manageAccounts && caps.manageInstance) {
    // full admin (builtin Admin or capability-complete custom role)
    return true;
  }
  if (caps.visibility === "manage_all" || caps.visibility === "view_all") {
    return page.userId != null;
  }
  return page.userId != null && page.userId === actor.userId;
}

/** May this actor EDIT this page? manage_all grants cross-user write; view_all does NOT. */
export function canEditPage(
  caps: RoleCapabilities,
  actor: Actor,
  page: PageRef,
): boolean {
  if (!page) return false;
  if (caps.manageAccounts && caps.manageInstance) return true;
  if (caps.visibility === "manage_all") return page.userId != null;
  return page.userId != null && page.userId === actor.userId;
}

/**
 * Which pages may this actor SEE in the admin UI (page switcher, dashboard)?
 *  - full admin / manage_all / view_all → every page
 *  - own → only pages they own (legacy NULL-owner rows stay admin-only)
 * Single choke point for the admin surface (layout switcher, dashboard);
 * keep it next to the predicates so visibility rules can't drift apart.
 */
export function filterVisiblePages<
  T extends { userId?: number | null },
>(pages: T[], caps: RoleCapabilities, userId: number): T[] {
  if (caps.manageAccounts && caps.manageInstance) return pages;
  if (caps.visibility === "view_all" || caps.visibility === "manage_all") return pages;
  return pages.filter((p) => p.userId != null && p.userId === userId);
}

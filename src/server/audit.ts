import "server-only";

import { headers } from "next/headers";
import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/server/queries";

/**
 * Fixed event vocabulary (#124 follow-up audit log). The /audit filter lists
 * exactly these; anything security-relevant MUST map onto one of them rather
 * than inventing free-form strings.
 */
export const AUDIT_ACTIONS = [
  "account.created",
  "account.updated",
  "account.disabled",
  "account.enabled",
  "account.deleted",
  "role.assigned",
  "role.created",
  "role.updated",
  "role.deleted",
  "login.success",
  "login.failed",
  "sso.linked",
  "sso.login",
  "sso.refused",
  "settings.updated",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditActor {
  userId: number;
  username: string;
}

interface RecordAuditOptions {
  /** Explicit actor for events where no session exists yet (login itself). */
  actor?: AuditActor;
  /** Explicit IP for events that already resolved one (login rate-limit path). */
  ip?: string;
}

function clientIp(h: Headers): string {
  return (
    (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (h.get("x-real-ip") || "").toString() ||
    "0.0.0.0"
  );
}

/** Retention sweep runs at most once a minute per server process. */
let lastSweep = 0;

/** Delete entries older than the configured retention window (KV, default 90d). */
export async function sweepAuditRetention(): Promise<void> {
  const days = Number(await getSetting("auditRetentionDays")) || 90;
  await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, sql`datetime('now', ${`-${days} days`})`));
}

/**
 * Append one audit entry. NEVER throws — auditing must not break the action
 * it observes. Outside a request scope (tests, cron) actor/ip fall back to
 * explicit values or nulls.
 */
export async function recordAudit(
  action: AuditAction,
  target?: string,
  detail?: Record<string, unknown>,
  options: RecordAuditOptions = {},
): Promise<void> {
  try {
    let actor = options.actor ?? null;
    let ip = options.ip ?? null;
    if (!actor) {
      const session = await getSession();
      if (session) actor = { userId: session.userId, username: session.username };
    }
    if (!ip) {
      try {
        ip = clientIp(await headers());
      } catch {
        ip = null; // not in a request scope
      }
    }
    await db.insert(auditLog).values({
      actorUserId: actor?.userId ?? null,
      actorUsername: actor?.username ?? null,
      action,
      target: target ?? null,
      detail: detail ? JSON.stringify(detail) : null,
      ip,
    });

    // Lazy retention: default 90 days, admin-configurable via KV.
    const now = Date.now();
    if (now - lastSweep > 60_000) {
      lastSweep = now;
      await sweepAuditRetention();
    }
  } catch {
    // swallow — auditing must never fail the surrounding action
  }
}

export interface AuditFilters {
  actorUserId?: number;
  action?: AuditAction;
  /** Only entries newer than this many days. */
  sinceDays?: number;
  /** Cursor pagination: entries strictly older than this (createdAt, id) pair. */
  before?: string;
  beforeId?: number;
  limit?: number;
}

export async function listAuditEntries(filters: AuditFilters = {}): Promise<{
  entries: {
    id: number;
    actorUserId: number | null;
    actorUsername: string | null;
    action: string;
    target: string | null;
    detail: string | null;
    ip: string | null;
    createdAt: string;
  }[];
  hasMore: boolean;
}> {
  const limit = filters.limit ?? 50;
  const conds: SQL[] = [];
  if (filters.actorUserId != null) conds.push(eq(auditLog.actorUserId, filters.actorUserId));
  if (filters.action) conds.push(eq(auditLog.action, filters.action));
  if (filters.sinceDays != null) {
    conds.push(sql`${auditLog.createdAt} >= datetime('now', ${`-${filters.sinceDays} days`})`);
  }
  if (filters.before) {
    // Compound cursor: same-second entries are common (bulk admin edits), so
    // (createdAt, id) must both advance or pagination skips/duplicates rows.
    conds.push(
      filters.beforeId != null
        ? or(
            lt(auditLog.createdAt, filters.before),
            and(eq(auditLog.createdAt, filters.before), lt(auditLog.id, filters.beforeId)),
          )!
        : lt(auditLog.createdAt, filters.before),
    );
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { entries: rows.slice(0, limit), hasMore };
}

/** Distinct actors that appear in the log (for the actor filter dropdown). */
export async function listAuditActors(): Promise<{ id: number; username: string }[]> {
  const rows = await db
    .selectDistinct({ id: auditLog.actorUserId, username: auditLog.actorUsername })
    .from(auditLog)
    .where(sql`${auditLog.actorUserId} IS NOT NULL`)
    .orderBy(auditLog.actorUsername);
  return rows
    .filter((r): r is { id: number; username: string } => r.id != null && r.username != null)
    .map((r) => ({ id: r.id, username: r.username }));
}

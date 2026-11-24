import "server-only";

/**
 * Instance-wide notification emitters (#13).
 *
 * Four emitters on the shared notification layer, all strictly OPT-IN:
 * nothing is sent unless the admin created an instance-wide webhook config
 * (pageId NULL) AND subscribed to the event kind in its `events` CSV. With
 * no config (or no subscription) every function here is a no-op.
 *
 * - emitSubscriberPing      — new email-capture subscriber
 * - emitAdminEvent          — admin/security events (audit-hooked + backups)
 * - emitUpdatePing          — new release available (+ what's in it)
 * - maybeEmitWeeklyDigest   — trailing-7-day stats, at most once per week
 *
 * NOTE: this module must NOT import from @/server/queries/index —
 * queries/index hooks emitSubscriberPing into addSubscriber, and a
 * queries → here → queries cycle would be fragile. The digest gate reads
 * the settings KV directly instead.
 */

import { db } from "@/db";
import {
  analyticsClicks,
  analyticsPageviews,
  links,
  notificationConfigs,
  settings,
  subscribers,
} from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { instanceDedupeKey } from "@/lib/notifications/events";
import {
  formatDigestMessage,
  weekBucket,
  WEEK_MS,
} from "@/lib/notifications/digest";
import { emitNotification } from "./emit";

// ── Settings KV (local copy of the queries/index helpers — cycle guard) ──

async function kvGet(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (existing[0]) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

/** One instance-wide event to every config subscribed to its kind. */
async function emitInstanceEvent(
  kind: Parameters<typeof instanceDedupeKey>[0],
  unique: string | number,
  payload: {
    type: "subscriber" | "admin" | "update" | "digest";
    title: string;
    message: string;
  },
): Promise<void> {
  await emitNotification({
    type: payload.type,
    pageId: null,
    pageTitle: "",
    slug: null,
    title: payload.title,
    message: payload.message,
    dedupeKey: instanceDedupeKey(kind, unique),
  });
}

/**
 * New-subscriber ping. Called from addSubscriber after a successful insert;
 * `subscriberId` makes the dedupe key unique per real signup. Never throws.
 */
export async function emitSubscriberPing(
  subscriberId: number,
  email: string,
): Promise<void> {
  try {
    const rows = await db.select({ c: sql<number>`count(*)` }).from(subscribers);
    const total = Number(rows[0]?.c ?? 0);
    await emitInstanceEvent("subscribers", subscriberId, {
      type: "subscriber",
      title: "New subscriber",
      message: `${email} joined your mailing list (total: ${total.toLocaleString("en-US")}).`,
    });
  } catch (err) {
    console.error("[notifications] subscriber ping failed:", err);
  }
}

/** Audit scopes worth waking the owner for. Noisy scopes stay out. */
const NOTIFY_AUDIT_SCOPES = new Set([
  "account.created",
  "account.deleted",
  "role.assigned",
  "role.created",
  "role.updated",
  "role.deleted",
  "sso.linked",
  "sso.unlinked",
  "sso.refused",
  "sso.flow_mismatch",
]);

/** Human-readable label per notifying scope (webhook message title line). */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  "account.created": "Account created",
  "account.deleted": "Account deleted",
  "role.assigned": "Role assigned",
  "role.created": "Role created",
  "role.updated": "Role updated",
  "role.deleted": "Role deleted",
  "sso.linked": "SSO identity linked",
  "sso.unlinked": "SSO identity unlinked",
  "sso.refused": "SSO sign-in refused",
  "sso.flow_mismatch": "SSO flow mismatch detected",
};

/** Pure predicate, fixture-testable: should this audit scope notify? */
export function shouldNotifyAuditScope(action: string): boolean {
  return NOTIFY_AUDIT_SCOPES.has(action);
}

/**
 * Admin/security event feed. Called from recordAudit (filtered scopes) and
 * from the backup flows. `unique` must differ per occurrence (audit rows use
 * their id; backups their timestamp).
 */
export async function emitAdminEvent(
  unique: string | number,
  title: string,
  message: string,
): Promise<void> {
  try {
    await emitInstanceEvent("admin", unique, { type: "admin", title, message });
  } catch (err) {
    console.error("[notifications] admin event failed:", err);
  }
}

/**
 * Update ping: a newer release exists. Called from the server-side update
 * check (24h-cached), so at most one ping per version — the dedupe key is
 * the version itself.
 */
export async function emitUpdatePing(
  latestVersion: string,
  currentVersion: string,
  notes: string | null,
  releaseUrl: string | null,
): Promise<void> {
  try {
    const body = notes
      ? notes.length > 800
        ? `${notes.slice(0, 797)}...`
        : notes
      : "See the release notes for what changed.";
    const message = `${body}\nInstalled: v${currentVersion} - Latest: v${latestVersion}${
      releaseUrl ? `\n${releaseUrl}` : ""
    }`;
    await emitInstanceEvent("updates", latestVersion, {
      type: "update",
      title: `LinkBreeze v${latestVersion} is available`,
      message,
    });
  } catch (err) {
    console.error("[notifications] update ping failed:", err);
  }
}

export interface DigestStats {
  views: number;
  clicks: number;
  /** Top links by click count in the window (already capped at 3). */
  topLinks: Array<{ label: string; clicks: number }>;
  newSubscribers: number;
}

/** Cheap in-process throttle: check the digest gate at most every 10 min. */
const DIGEST_CHECK_INTERVAL_MS = 10 * 60 * 1000;
let lastDigestCheckAt = 0;

/**
 * Weekly digest gate + emit. Trailing-7-day stats, at most one emit per
 * epoch-week bucket, checked lazily on traffic and admin settings loads.
 * Returns true when a digest was emitted this call.
 */
export async function maybeEmitWeeklyDigest(
  nowMs: number = Date.now(),
  deps?: { stats?: DigestStats },
): Promise<boolean> {
  try {
    // Cheap in-process throttle first (no DB hit on hot paths).
    if (nowMs - lastDigestCheckAt < DIGEST_CHECK_INTERVAL_MS) return false;
    lastDigestCheckAt = nowMs;

    const bucket = weekBucket(nowMs);
    const lastEmit = await kvGet("lastDigestEmitWeek");
    if (lastEmit && Number(lastEmit) >= bucket) return false;

    // Strict opt-in: digest only fires for configs subscribed to it.
    const configs = await db
      .select({ events: notificationConfigs.events })
      .from(notificationConfigs)
      .where(eq(notificationConfigs.enabled, true));
    const subscribed = configs.some((c) =>
      c.events.split(",").map((s) => s.trim()).includes("digest"),
    );
    if (!subscribed) {
      // Stamp the bucket so we skip the scan until next week.
      await kvSet("lastDigestEmitWeek", String(bucket));
      return false;
    }

    const sinceIso = new Date(nowMs - WEEK_MS).toISOString();
    const untilIso = new Date(nowMs).toISOString();
    const inWindow = (
      col: typeof analyticsPageviews.createdAt | typeof analyticsClicks.createdAt,
    ) => and(gte(col, sinceIso), sql`${col} <= ${untilIso}`);

    const [pv] = await db
      .select({ c: sql<number>`count(*)` })
      .from(analyticsPageviews)
      .where(inWindow(analyticsPageviews.createdAt));
    const [ck] = await db
      .select({ c: sql<number>`count(*)` })
      .from(analyticsClicks)
      .where(inWindow(analyticsClicks.createdAt));
    const top = await db
      .select({
        label: sql<string>`coalesce(${links.title}, ${links.url})`,
        clicks: sql<number>`count(*)`,
      })
      .from(analyticsClicks)
      .innerJoin(links, eq(links.id, analyticsClicks.linkId))
      .where(inWindow(analyticsClicks.createdAt))
      .groupBy(analyticsClicks.linkId)
      .orderBy(sql`count(*) desc`)
      .limit(3);
    const [subs] = await db
      .select({ c: sql<number>`count(*)` })
      .from(subscribers)
      .where(gte(subscribers.createdAt, sinceIso));

    const stats: DigestStats = deps?.stats ?? {
      views: Number(pv?.c ?? 0),
      clicks: Number(ck?.c ?? 0),
      topLinks: top.map((t) => ({ label: t.label, clicks: Number(t.clicks) })),
      newSubscribers: Number(subs?.c ?? 0),
    };

    await emitInstanceEvent("digest", bucket, {
      type: "digest",
      title: "Your weekly LinkBreeze digest",
      message: formatDigestMessage(stats, nowMs),
    });
    await kvSet("lastDigestEmitWeek", String(bucket));
    return true;
  } catch (err) {
    console.error("[notifications] weekly digest failed:", err);
    return false;
  }
}

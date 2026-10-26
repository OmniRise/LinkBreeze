import "server-only";
import { db } from "@/db";
import {
  analyticsClicks,
  analyticsPageviews,
  links,
  notificationConfigs,
  notificationDeliveries,
  pages,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { NotificationProvider } from "@/lib/notifications/events";

export type NotificationConfigRow = typeof notificationConfigs.$inferSelect;
export type NotificationDeliveryRow = typeof notificationDeliveries.$inferSelect;

export interface NotificationConfigInput {
  pageId: number;
  url: string;
  provider: NotificationProvider;
  enabled: boolean;
  clicksThreshold: number | null;
  viewsThreshold: number | null;
}

export async function getNotificationConfigs(): Promise<NotificationConfigRow[]> {
  return db.select().from(notificationConfigs).orderBy(notificationConfigs.id);
}

export async function getNotificationConfig(
  id: number,
): Promise<NotificationConfigRow | null> {
  const rows = await db
    .select()
    .from(notificationConfigs)
    .where(eq(notificationConfigs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** The (single) webhook config for a page, for the settings card. */
export async function getNotificationConfigByPage(
  pageId: number,
): Promise<NotificationConfigRow | null> {
  const rows = await db
    .select()
    .from(notificationConfigs)
    .where(eq(notificationConfigs.pageId, pageId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createNotificationConfig(
  input: NotificationConfigInput,
): Promise<NotificationConfigRow> {
  const rows = await db.insert(notificationConfigs).values(input).returning();
  return rows[0];
}

export async function updateNotificationConfig(
  id: number,
  input: NotificationConfigInput,
): Promise<void> {
  await db.update(notificationConfigs).set(input).where(eq(notificationConfigs.id, id));
}

export async function deleteNotificationConfig(id: number): Promise<void> {
  await db.delete(notificationConfigs).where(eq(notificationConfigs.id, id));
}

/** Remove the page's config (delivery-log rows cascade via FK). */
export async function deleteNotificationConfigForPage(pageId: number): Promise<void> {
  await db.delete(notificationConfigs).where(eq(notificationConfigs.pageId, pageId));
}

/** Last N delivery attempts for one config, newest first (settings UI). */
export async function getRecentDeliveries(
  configId: number,
  limit = 10,
): Promise<NotificationDeliveryRow[]> {
  return db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.configId, configId))
    .orderBy(desc(notificationDeliveries.id))
    .limit(limit);
}

/** Dedupe probe: has this (config, dedupeKey) pair been attempted before? */
export async function deliveryAlreadyFired(
  configId: number,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.configId, configId),
        eq(notificationDeliveries.dedupeKey, dedupeKey),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * CLAIM the dedupe key BEFORE delivery: at-most-once per (config, key), even
 * if the process dies mid-delivery. The claim row IS the delivery-log row —
 * completeDelivery() fills in the outcome afterwards.
 */
export async function claimDelivery(row: {
  configId: number;
  dedupeKey: string;
  provider: NotificationProvider;
}): Promise<NotificationDeliveryRow> {
  const rows = await db
    .insert(notificationDeliveries)
    .values({ ...row, status: "pending", attempt: 0 })
    .returning();
  return rows[0];
}

/** Fill in the outcome on a claimed delivery row. */
export async function completeDelivery(
  id: number,
  outcome: {
    status: "success" | "failed";
    httpStatus: number | null;
    attempt: number;
    error: string | null;
  },
): Promise<void> {
  await db.update(notificationDeliveries).set(outcome).where(eq(notificationDeliveries.id, id));
}

/** All-time click count for a page (outbound clicks only, #93 semantics). */
export async function getPageClickCount(pageId: number): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(
      and(
        eq(analyticsClicks.eventType, "click"),
        sql`${analyticsClicks.linkId} IN (SELECT ${links.id} FROM ${links} WHERE ${links.pageId} = ${pageId})`,
      ),
    );
  return rows[0]?.c ?? 0;
}

/** All-time view count for a page. */
export async function getPageViewCount(pageId: number): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(analyticsPageviews)
    .where(eq(analyticsPageviews.pageId, pageId));
  return rows[0]?.c ?? 0;
}

/** Title + slug for the message body; null when the page is gone. */
export async function getNotificationPage(
  pageId: number,
): Promise<{ title: string; slug: string } | null> {
  const rows = await db
    .select({ title: pages.title, slug: pages.slug })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  return rows[0] ?? null;
}

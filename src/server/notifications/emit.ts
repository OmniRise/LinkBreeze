import "server-only";
import { db } from "@/db";
import { notificationConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  milestoneDedupeKey,
  type NotificationEvent,
  type NotificationProvider,
} from "@/lib/notifications/events";
import { formatWebhookRequest } from "@/lib/notifications/formatters";
import { crossedLevel, thresholdFor } from "@/lib/notifications/thresholds";
import {
  deliverWithRetries,
  type AttemptRecord,
  type DeliveryDeps,
} from "@/lib/notifications/runner";
import {
  claimDelivery,
  completeDelivery,
  deliveryAlreadyFired,
  getNotificationPage,
  getPageClickCount,
  getPageViewCount,
} from "@/server/queries/notifications";

export type NotificationConfigLike = {
  id: number;
  url: string;
  provider: NotificationProvider;
  clicksThreshold: number | null;
  viewsThreshold: number | null;
};

/** Narrow a DB row (provider is `string` there) to the emit-facing shape. */
function toConfigLike(row: {
  id: number;
  url: string;
  provider: string;
  clicksThreshold: number | null;
  viewsThreshold: number | null;
}): NotificationConfigLike {
  return {
    id: row.id,
    url: row.url,
    provider: row.provider as NotificationProvider,
    clicksThreshold: row.clicksThreshold,
    viewsThreshold: row.viewsThreshold,
  };
}

export interface EmitDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Test seam: replaces real webhook delivery. */
  deliverImpl?: (
    config: NotificationConfigLike,
    event: NotificationEvent,
  ) => Promise<void>;
}

// Module-level deps so callers that cannot thread arguments (the record*
// query paths) still get an injection seam for tests. Production never
// calls the setter, so the default (real fetch) applies there.
let injectedDeps: EmitDeps = {};

/** Test seam: override fetch/delivery for everything emitting afterwards. */
export function setEmitDeps(deps: EmitDeps): void {
  injectedDeps = deps;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err).slice(0, 500);
}

/**
 * The ONE emit API. Features call this and can FORGET about it:
 * - never throws (all failures are logged to the server console),
 * - delivery is scheduled fire-and-forget so the caller's request path never
 *   waits on the network,
 * - each (config, dedupeKey) fires at most once: the dedupe key is CLAIMED
 *   before delivery starts, so even a crash mid-delivery cannot double-fire.
 */
export async function emitNotification(
  event: NotificationEvent,
  deps: EmitDeps = injectedDeps,
): Promise<void> {
  try {
    const configs = await db
      .select()
      .from(notificationConfigs)
      .where(eq(notificationConfigs.enabled, true));

    for (const row of configs) {
      if (event.pageId !== null && row.pageId !== event.pageId) continue;
      if (event.metric !== "clicks" && event.metric !== "views") continue;

      const config = toConfigLike(row);
      const threshold = thresholdFor(config, event.metric);
      const level = threshold === null ? 0 : crossedLevel(event.total, threshold);
      if (level <= 0) continue;

      const dedupeKey = milestoneDedupeKey(config.id, event.metric, level);
      if (await deliveryAlreadyFired(config.id, dedupeKey)) continue;

      const claim = await claimDelivery({
        configId: config.id,
        dedupeKey,
        provider: config.provider,
      });
      const resolved: NotificationEvent = { ...event, level, dedupeKey };

      if (deps.deliverImpl) {
        // Test seam — awaited so assertions stay deterministic.
        await finishDelivery(claim.id, config, resolved, deps);
      } else if (deps.fetchImpl || deps.sleep) {
        // Dep-overridden run (tests): awaited for determinism.
        await finishDelivery(claim.id, config, resolved, deps);
      } else {
        // Fire-and-forget: never block the click/view request path.
        void finishDelivery(claim.id, config, resolved, deps).catch((err) => {
          console.error("[notifications] delivery crashed:", err);
        });
      }
    }
  } catch (err) {
    console.error("[notifications] emit failed:", err);
  }
}

/** Deliver and record the outcome on the claim row. Never throws. */
async function finishDelivery(
  claimId: number,
  config: NotificationConfigLike,
  event: NotificationEvent,
  deps: EmitDeps,
): Promise<void> {
  try {
    let ok = false;
    let attempts: AttemptRecord[] = [];
    if (deps.deliverImpl) {
      await deps.deliverImpl(config, event);
      ok = true;
      attempts = [{ attempt: 1, ok: true, httpStatus: null, error: null }];
    } else {
      const outcome = await deliverToWebhook(config, event, deps);
      ok = outcome.ok;
      attempts = outcome.attempts;
    }
    const last = attempts[attempts.length - 1] ?? null;
    await completeDelivery(claimId, {
      status: ok ? "success" : "failed",
      httpStatus: last?.httpStatus ?? null,
      attempt: attempts.length,
      error: ok ? null : (last?.error ?? "delivery failed"),
    });
    if (!ok) {
      console.error(
        `[notifications] delivery for config #${config.id} failed after ${attempts.length} attempt(s)`,
      );
    }
  } catch (err) {
    await completeDelivery(claimId, {
      status: "failed",
      httpStatus: null,
      attempt: 1,
      error: errorText(err),
    }).catch((logErr) => console.error("[notifications] log write failed:", logErr));
    console.error("[notifications] delivery error:", err);
  }
}

/**
 * Real delivery: format per provider, POST with timeout + bounded retries.
 * Returns the attempt records (the caller logs the outcome); never throws.
 */
export async function deliverToWebhook(
  config: NotificationConfigLike,
  event: NotificationEvent,
  deps: EmitDeps = {},
): Promise<{ ok: boolean; attempts: AttemptRecord[] }> {
  const request = formatWebhookRequest(config.provider, config.url, event);
  const runnerDeps: DeliveryDeps = {
    fetchImpl: deps.fetchImpl ?? fetch,
    sleep: deps.sleep ?? defaultSleep,
  };
  return deliverWithRetries(request, runnerDeps);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Milestone emitter: computes all-time counts for a page and pushes the two
 * canonical milestone events through emitNotification. Called from
 * recordClick / recordPageview; never throws.
 */
export async function emitPageMilestones(pageId: number): Promise<void> {
  try {
    const page = await getNotificationPage(pageId);
    if (!page) return;
    const base = {
      type: "milestone" as const,
      pageId,
      pageTitle: page.title,
      slug: page.slug,
    };
    const clicks = await getPageClickCount(pageId);
    if (clicks > 0) {
      await emitNotification({ ...base, metric: "clicks", level: 0, total: clicks, dedupeKey: "" });
    }
    const views = await getPageViewCount(pageId);
    if (views > 0) {
      await emitNotification({ ...base, metric: "views", level: 0, total: views, dedupeKey: "" });
    }
  } catch (err) {
    console.error("[notifications] milestone emit failed:", err);
  }
}

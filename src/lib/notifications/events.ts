/**
 * Canonical notification event (#13).
 *
 * Every feature that wants to notify the owner (analytics milestones today,
 * form submissions with #125 later) builds one of these and hands it to
 * `emitNotification`. The delivery layer treats `dedupeKey` as opaque.
 */

export type NotificationEventType = "milestone" | "test" | "form_submission";

export type NotificationMetric = "clicks" | "views" | "form_submissions";

export type NotificationProvider = "discord" | "slack" | "telegram" | "ntfy";

export interface NotificationEvent {
  type: NotificationEventType;
  /** null = instance-wide event. */
  pageId: number | null;
  /** Human-readable page name used in the message body. */
  pageTitle: string;
  slug: string | null;
  metric: NotificationMetric;
  /** The threshold level crossed (e.g. 100). For tests: 0. */
  level: number;
  /** Current all-time count of the metric. */
  total: number;
  /** Opaque uniqueness key; the same key is delivered at most once per config. */
  dedupeKey: string;
}

/** Build the standard milestone dedupe key. */
export function milestoneDedupeKey(
  configId: number,
  metric: NotificationMetric,
  level: number,
): string {
  return `milestone:${metric}:${configId}:${level}`;
}

/** Build a unique key for per-config test deliveries. */
export function testDedupeKey(configId: number): string {
  return `test:${configId}:${Date.now()}`;
}

/** Human label for a metric, used inside delivery messages. */
export function metricLabel(metric: NotificationMetric): string {
  switch (metric) {
    case "clicks":
      return "clicks";
    case "views":
      return "views";
    case "form_submissions":
      return "form submissions";
  }
}

/** One-line plain-text summary of the event (shared by all formatters). */
export function eventSummary(event: NotificationEvent): string {
  const where = event.pageTitle || (event.slug ? `/${event.slug}` : "your page");
  if (event.type === "test") {
    return `LinkBreeze test notification - webhook is working.`;
  }
  return `${where} hit ${event.level.toLocaleString("en-US")} ${metricLabel(
    event.metric,
  )} (total: ${event.total.toLocaleString("en-US")}).`;
}

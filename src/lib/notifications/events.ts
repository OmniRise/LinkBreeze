/**
 * Canonical notification event (#13).
 *
 * Every feature that wants to notify the owner builds one of these and hands
 * it to `emitNotification`. The delivery layer treats `dedupeKey` as opaque.
 *
 * Two event families share this shape:
 * - PAGE events (milestone, form_submission): bound to one page, thresholded
 *   against click/view totals, delivered to that page's config only.
 * - INSTANCE events (subscriber, admin, update, digest): instance-wide,
 *   delivered to every enabled instance-wide config (pageId NULL) whose
 *   `events` CSV subscribes to the type. `title`/`message` carry the text;
 *   `metric`/`level`/`total` are unused there.
 */

export type NotificationEventType =
  | "milestone"
  | "test"
  | "form_submission"
  | "subscriber"
  | "admin"
  | "update"
  | "digest";

export type NotificationMetric = "clicks" | "views" | "form_submissions";

export type NotificationProvider =
  | "discord"
  | "slack"
  | "telegram"
  | "ntfy"
  | "generic";

/** Event kinds an instance-wide config can subscribe to (the `events` CSV). */
export const INSTANCE_EVENT_KINDS = [
  "subscribers",
  "admin",
  "updates",
  "digest",
] as const;

export type InstanceEventKind = (typeof INSTANCE_EVENT_KINDS)[number];

/** Parse a config's `events` CSV into a set of subscribed kinds. */
export function parseEventSubscription(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Serialize a subscription set back into the canonical (sorted) CSV. */
export function serializeEventSubscription(kinds: Iterable<string>): string {
  return Array.from(new Set(kinds)).sort().join(",");
}

export interface NotificationEvent {
  type: NotificationEventType;
  /** null = instance-wide event. */
  pageId: number | null;
  /** Human-readable page name used in the message body. */
  pageTitle: string;
  slug: string | null;
  /** Milestone events only. */
  metric?: NotificationMetric;
  /** The threshold level crossed (e.g. 100). For tests: 0. */
  level?: number;
  /** Current all-time count of the metric. */
  total?: number;
  /** Instance events: short headline (formatters use it as the title). */
  title?: string;
  /** Instance events: body text. Falls back to the one-line summary. */
  message?: string;
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

/**
 * Dedupe key for instance events. `unique` must differ per real-world
 * occurrence (subscriber id, audit row id, release version, week number).
 */
export function instanceDedupeKey(
  kind: InstanceEventKind,
  unique: string | number,
): string {
  return `${kind}:${unique}`;
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

/** Short headline for an event, used by formatters as the card title. */
export function eventTitle(event: NotificationEvent): string {
  switch (event.type) {
    case "test":
      return "LinkBreeze test notification";
    case "milestone":
      return "LinkBreeze milestone";
    case "form_submission":
      return "LinkBreeze form submission";
    case "subscriber":
      return event.title ?? "LinkBreeze new subscriber";
    case "admin":
      return event.title ?? "LinkBreeze admin event";
    case "update":
      return event.title ?? "LinkBreeze update available";
    case "digest":
      return event.title ?? "LinkBreeze weekly digest";
  }
}

/** One-line plain-text summary of the event (shared by all formatters). */
export function eventSummary(event: NotificationEvent): string {
  const where = event.pageTitle || (event.slug ? `/${event.slug}` : "your page");
  if (event.type === "test") {
    return `LinkBreeze test notification - webhook is working.`;
  }
  if (event.type === "milestone" || event.type === "form_submission") {
    const level = event.level ?? 0;
    const total = event.total ?? 0;
    const metric = event.metric ?? "views";
    return `${where} hit ${level.toLocaleString("en-US")} ${metricLabel(
      metric,
    )} (total: ${total.toLocaleString("en-US")}).`;
  }
  if (event.message) return event.message;
  return event.title ?? "LinkBreeze notification.";
}

/**
 * Weekly digest helpers (#13). PURE: week math and message formatting only —
 * all DB aggregation lives in the server emitters. Fixture-testable.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Epoch-week bucket: the number of whole weeks since the Unix epoch. Stable,
 * monotonic, no timezone or ISO-week edge cases — a digest fires at most
 * once per bucket, on the first eligible check after the week rolls over.
 */
export function weekBucket(nowMs: number): number {
  return Math.floor(nowMs / WEEK_MS);
}

/** The start (ms) of the week bucket containing `nowMs`. */
export function weekBucketStart(nowMs: number): number {
  return weekBucket(nowMs) * WEEK_MS;
}

export interface DigestStats {
  views: number;
  clicks: number;
  /** Top links by click count in the window (already capped by the caller). */
  topLinks: Array<{ label: string; clicks: number }>;
  newSubscribers: number;
}

/** Human window label, e.g. "Nov 10 - Nov 17". */
function windowLabel(sinceMs: number, untilMs: number): string {
  const fmt = (ms: number): string =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(sinceMs)} - ${fmt(untilMs)}`;
}

/**
 * Build the digest body. Multi-line plain text: the same text reaches every
 * provider (Discord embed description, Slack text, Telegram, ntfy body).
 */
export function formatDigestMessage(
  stats: DigestStats,
  nowMs: number,
): string {
  const until = nowMs;
  const since = until - WEEK_MS;
  const ctr = stats.views > 0 ? (stats.clicks / stats.views) * 100 : 0;
  const lines = [
    `Your LinkBreeze instance, ${windowLabel(since, until)}:`,
    `- ${stats.views.toLocaleString("en-US")} page views`,
    `- ${stats.clicks.toLocaleString("en-US")} link clicks (${ctr.toFixed(1)}% CTR)`,
  ];
  if (stats.topLinks.length > 0) {
    lines.push(
      `Top links: ${stats.topLinks
        .map((l) => `${l.label} (${l.clicks.toLocaleString("en-US")})`)
        .join(", ")}`,
    );
  }
  if (stats.newSubscribers > 0) {
    lines.push(
      `- ${stats.newSubscribers.toLocaleString("en-US")} new subscriber${
        stats.newSubscribers === 1 ? "" : "s"
      }`,
    );
  }
  return lines.join("\n");
}

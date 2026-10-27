import "server-only";
import { db } from "@/db";
import { links, analyticsClicks } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getSetting, updateLink } from "@/server/queries";
import { isAllowedLinkUrl } from "@/lib/link-url";
import {
  parseAbConfig,
  serializeAbConfig,
  autoPromotableWinner,
  AB_AUTO_PROMOTE_SETTING,
} from "@/lib/ab-test";
// #81 E.49: the constant lives in the PURE lib module so client surfaces
// can share it without pulling server code into the bundle; re-exported
// here for every existing importer.
export { AB_AUTO_PROMOTE_SETTING };

/**
 * #81 E.1 — auto-promotion scanner.
 *
 * When the settings-KV toggle `abAutoPromote` is "on" (DEFAULT OFF), any
 * RUNNING test with enough variant-labeled clicks and a statistically
 * significant leader gets promoted and archived exactly like the manual
 * button — URL pinned when B wins, full history kept.
 *
 * Throttled like maybeRunScheduledBackup: /go calls this fire-and-forget on
 * every counted click; the module-level throttle means the click path sees at
 * most one setting read per 10 minutes, and the scan only runs when the toggle
 * is on. Never throws into the caller.
 */

const THROTTLE_MS = 10 * 60 * 1000;

let lastCheck = 0;

/** Reset the throttle — tests only. */
export function _resetAbAutoPromoteThrottle(): void {
  lastCheck = 0;
}

export function maybeAutoPromoteAbTests(): void {
  const now = Date.now();
  if (now - lastCheck < THROTTLE_MS) return;
  lastCheck = now;
  // Fire-and-forget: never block or fail the redirect.
  void runAbAutoPromoteScan().catch((err) => {
    console.error("[ab-auto-promote] scan failed", err);
  });
}

/** The scan itself — exported for direct invocation in tests/probes. */
export async function runAbAutoPromoteScan(): Promise<number> {
  const toggle = await getSetting(AB_AUTO_PROMOTE_SETTING);
  if (toggle !== "on") return 0;

  // Cheap prefilter: only rows whose JSON says "running" (the serialized
  // shape always contains this exact fragment; parseAbConfig re-validates).
  const running = await db
    .select()
    .from(links)
    .where(sql`${links.abConfig} LIKE '%"status":"running"%'`);
  let promoted = 0;
  for (const link of running) {
    if (link.type !== "url") continue;
    const config = parseAbConfig(link.abConfig ?? null);
    if (!config || config.status !== "running") continue;
    // E.2: never auto-promote a time-boxed test whose window is still open —
    // promotion archives the test, which would truncate the experiment the
    // operator scheduled. No end bound (or a past one) = eligible.
    if (config.endsAt) {
      const end = Date.parse(config.endsAt);
      if (Number.isFinite(end) && Date.now() < end) continue;
    }

    // All-time variant-labeled clicks — DELIBERATELY un-ranged, unlike the
    // range-scoped detail-page breakdown (getLinkStats): promotion is a
    // PERMANENT decision, so it weighs the whole experiment, not whatever
    // window the dashboard happens to show. Retention pruning only lowers
    // these, which makes the scanner MORE conservative over time, never less.
    const rows = await db
      .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
      .from(analyticsClicks)
      .where(and(eq(analyticsClicks.linkId, link.id), isNotNull(analyticsClicks.variant)))
      .groupBy(analyticsClicks.variant);
    let a = 0;
    let b = 0;
    for (const r of rows) {
      if (r.variant === "A") a = Number(r.c);
      else if (r.variant === "B") b = Number(r.c);
    }

    const winner = autoPromotableWinner(a, b, config.weightA);
    if (!winner) continue;

    // Same defense as the manual promote action: never pin a URL that no
    // longer passes the allowlist (validator may have tightened since save).
    if (winner === "B" && !isAllowedLinkUrl("url", config.urlB)) continue;

    const archived = serializeAbConfig({ ...config, status: "archived", winner });
    await updateLink(link.id, winner === "B"
      ? { url: config.urlB, abConfig: archived }
      : { abConfig: archived });
    promoted++;
    console.info(
      `[ab-auto-promote] link ${link.id}: promoted ${winner} (${a} vs ${b} clicks)`,
    );
  }
  return promoted;
}

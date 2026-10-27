/**
 * Integration tests: #81 A/B per-variant click attribution.
 *
 * recordClick() tags rows with the variant label; getLinkStats() aggregates
 * per-variant counts range-scoped; links WITHOUT a test keep the exact
 * pre-#81 behavior (null variant, unified totals). Promote-to-winner
 * semantics (test archived, history kept) are covered in the action tests.
 */
import { describe, it, expect } from "vitest";
import "./integration-setup";
import { db, seedLink } from "./integration-setup";
import { recordClick, getLinkStats, getLink } from "@/server/queries";
import { analyticsClicks } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

function countVariantRows(linkId: number): { variant: string | null; c: number }[] {
  return db
    .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(eq(analyticsClicks.linkId, linkId))
    .groupBy(analyticsClicks.variant)
    .all() as { variant: string | null; c: number }[];
}

describe("per-variant click attribution (#81)", () => {
  it("tags clicks with their variant and keeps untagged clicks null", async () => {
    const link = seedLink({ abConfig: JSON.stringify({ v: 1, status: "running", labelA: null, labelB: null, urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null }) });

    await recordClick(link.id, "visitor-1", null, "click", "A");
    await recordClick(link.id, "visitor-2", null, "click", "B");
    await recordClick(link.id, "visitor-3", null, "click", "B");
    // A popup open with no variant stays null and must not inflate counters.
    await recordClick(link.id, "visitor-4", null, "open");

    const rows = countVariantRows(link.id);
    const byVariant = new Map(rows.map((r) => [r.variant, Number(r.c)]));
    expect(byVariant.get("A")).toBe(1);
    expect(byVariant.get("B")).toBe(2);
    expect(byVariant.get(null)).toBe(1); // the 'open' row
  });

  it("no-variant links: clicks default to null variant, totals unified (regression)", async () => {
    const link = seedLink(); // no abConfig
    await recordClick(link.id, "v1", null);
    await recordClick(link.id, "v2", null);
    const rows = countVariantRows(link.id);
    expect(rows).toEqual([{ variant: null, c: 2 }]);

    const stats = await getLinkStats(link.id, "30d");
    expect(stats).not.toBeNull();
    expect(stats!.totalClicks).toBe(2);
    expect(stats!.variants).toEqual({ a: 0, b: 0 });
  });

  it("getLinkStats reports range-scoped per-variant counts", async () => {
    const link = seedLink({ abConfig: JSON.stringify({ v: 1, status: "running", labelA: "control", labelB: "variant", urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null }) });
    await recordClick(link.id, "v1", null, "click", "A");
    await recordClick(link.id, "v2", null, "click", "A");
    await recordClick(link.id, "v3", null, "click", "B");

    const stats = await getLinkStats(link.id, "30d");
    expect(stats!.variants).toEqual({ a: 2, b: 1 });
    expect(stats!.totalClicks).toBe(3);
  });

  it("promote-to-winner history: archived config, variant labels survive", async () => {
    const archived = JSON.stringify({ v: 1, status: "archived", labelA: "old", labelB: "new", urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: "B" });
    const link = seedLink({ url: "https://example.com/b", abConfig: archived });
    await recordClick(link.id, "v1", null, "click", "A");
    await recordClick(link.id, "v2", null, "click", "B");

    // After promotion the URL is pinned to B; the click history keeps both
    // variant labels so the archived view still renders the comparison.
    const stats = await getLinkStats(link.id, "30d");
    expect(stats!.link.url).toBe("https://example.com/b");
    expect(stats!.variants).toEqual({ a: 1, b: 1 });
    expect(countVariantRows(link.id).map((r) => r.variant).sort()).toEqual(["A", "B"]);
  });

  it("count integrity: variant labels never inflate or double-count clicks", async () => {
    // E.7 security pass: one row per click either way; the denormalized
    // links.clicksCount bumps exactly once per CLICK (variant or not) and
    // opens never reach it; the variant breakdown partitions the total.
    const link = seedLink({
      abConfig: JSON.stringify({ v: 1, status: "running", labelA: null, labelB: null, urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null }),
    });
    await recordClick(link.id, "ci-1", null, "click", "A");
    await recordClick(link.id, "ci-2", null, "click", "B");
    await recordClick(link.id, "ci-3", null, "click", "B");
    await recordClick(link.id, "ci-4", null); // untagged click (no test path)
    await recordClick(link.id, "ci-5", null, "open", "B"); // open never counts

    const stats = await getLinkStats(link.id, "30d");
    const row = await getLink(link.id);
    // Row total (opens excluded by the clicks-only stats) = tagged + untagged.
    expect(stats!.totalClicks).toBe(4);
    expect(stats!.variants.a + stats!.variants.b).toBe(3); // tagged subset
    expect(stats!.variants).toEqual({ a: 1, b: 2 });
    // Denormalized counter matches the row total exactly (4 clicks, +1 each,
    // the variant-labeled open added nothing).
    expect(row?.clicksCount).toBe(4);
  });

  it("E.22: the variants breakdown is RANGE-scoped like the total (old clicks excluded from both)", async () => {
    // The #81 variants GROUP BY carries the same range filter as the total —
    // the breakdown must partition the RANGE total, never all history.
    const link = seedLink({
      abConfig: JSON.stringify({ v: 1, status: "running", labelA: null, labelB: null, urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null }),
    });
    await recordClick(link.id, "old-1", null, "click", "A");
    await recordClick(link.id, "old-2", null, "click", "B");
    await recordClick(link.id, "old-3", null, "click", "B");
    // Backdate them far outside any selectable range (direct row UPDATE —
    // recordClick stamps now; the boundary is what's under test).
    await db
      .update(analyticsClicks)
      .set({ createdAt: "2020-01-01 00:00:00" })
      .where(eq(analyticsClicks.linkId, link.id));
    // One fresh in-range click.
    await recordClick(link.id, "fresh-1", null, "click", "A");

    const stats = await getLinkStats(link.id, "30d");
    expect(stats!.totalClicks).toBe(1); // old three excluded
    expect(stats!.variants).toEqual({ a: 1, b: 0 }); // breakdown matches the RANGE total
  });

  it("E.32: pruned clicks shrink the breakdown with the total; clicksCount stays lifetime", async () => {
    // Retention physically removes rows: the detail card's row-driven stats
    // (total + variant breakdown) shrink TOGETHER, while the denormalized
    // clicksCount badge keeps the lifetime number — two different contracts,
    // both asserted so neither drifts.
    const link = seedLink({
      abConfig: JSON.stringify({ v: 1, status: "running", labelA: null, labelB: null, urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null }),
    });
    await recordClick(link.id, "keep-a", null, "click", "A");
    await recordClick(link.id, "keep-b", null, "click", "B");
    await recordClick(link.id, "keep-b2", null, "click", "B");
    await recordClick(link.id, "old-a", null, "click", "A");
    await recordClick(link.id, "old-b", null, "click", "B");
    expect((await getLink(link.id))?.clicksCount).toBe(5); // lifetime so far

    // Retention removes the two "old" rows (same delete semantics as the
    // real opportunistic pruner — see retention.integration.test.ts).
    const allRows = db
      .select({ id: analyticsClicks.id, visitorHash: analyticsClicks.visitorHash })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .all();
    const toDelete = allRows.filter((r) => r.visitorHash.startsWith("old-")).map((r) => r.id);
    expect(toDelete).toHaveLength(2);
    db.delete(analyticsClicks).where(inArray(analyticsClicks.id, toDelete)).run();

    const stats = await getLinkStats(link.id, "30d");
    expect(stats!.totalClicks).toBe(3); // row-driven: shrank with the delete
    expect(stats!.variants).toEqual({ a: 1, b: 2 }); // breakdown shrank in lockstep
    expect((await getLink(link.id))?.clicksCount).toBe(5); // badge: lifetime, unchanged
  });

  it("E.41: cross-link isolation - each link's variant breakdown never bleeds across links", async () => {
    // Same visitor, two A/B links, OPPOSITE label mixes fired back to back:
    // the aggregation must stay per-link (WHERE link_id), so link A's
    // stats can never absorb link B's labeled rows even though both live in
    // the same table in the same session.
    const cfg = JSON.stringify({ v: 1, status: "running", labelA: null, labelB: null, urlB: "https://example.com/b", weightA: 50, weightB: 50, winner: null });
    const linkA = seedLink({ title: "Isolation A", abConfig: cfg });
    const linkB = seedLink({ title: "Isolation B", abConfig: cfg });

    await recordClick(linkA.id, "same-visitor", null, "click", "A");
    await recordClick(linkA.id, "same-visitor", null, "click", "A");
    await recordClick(linkA.id, "same-visitor", null, "click", "A");
    await recordClick(linkA.id, "same-visitor", null, "click", "B");
    await recordClick(linkB.id, "same-visitor", null, "click", "A");
    await recordClick(linkB.id, "same-visitor", null, "click", "B");
    await recordClick(linkB.id, "same-visitor", null, "click", "B");
    await recordClick(linkB.id, "same-visitor", null, "click", "B");

    const statsA = await getLinkStats(linkA.id, "30d");
    const statsB = await getLinkStats(linkB.id, "30d");
    expect(statsA!.totalClicks).toBe(4);
    expect(statsA!.variants).toEqual({ a: 3, b: 1 }); // never saw B's mix
    expect(statsB!.totalClicks).toBe(4);
    expect(statsB!.variants).toEqual({ a: 1, b: 3 }); // never saw A's mix
  });
});

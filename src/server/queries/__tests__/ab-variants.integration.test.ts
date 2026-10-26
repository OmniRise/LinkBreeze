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
import { recordClick, getLinkStats } from "@/server/queries";
import { analyticsClicks } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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
});

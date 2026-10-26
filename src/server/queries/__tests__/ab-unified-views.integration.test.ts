/**
 * #81 E.16 — unified-view regression: no A/B surface leaks into the
 * dashboard/index data paths.
 *
 * The #81 contract: totals stay UNIFIED (one link, one row, combined
 * clicks) while only the DETAIL page fans out per variant. These tests pin
 * the invariants that could plausibly regress when variant labels exist:
 *   1. getDashboardStats.topLinks counts an A/B link ONCE with its combined
 *      labeled + unlabeled clicks (never one row per variant).
 *   2. getDashboardStats query count is FLAT as link count grows 20x —
 *      the GROUP BY aggregates per link, never per link x variant (N+1).
 *   3. getActiveLinks/getAllLinks (index + public page) hand back rows with
 *      abConfig riding as a plain column, no extra queries, no variant data.
 */
import { describe, it, expect } from "vitest";
import "./integration-setup";
import { db, seedPage, seedLink } from "./integration-setup";
import {
  getDashboardStats,
  getActiveLinks,
  getAllLinks,
  recordClick,
} from "@/server/queries";
import { serializeAbConfig } from "@/lib/ab-test";

type Session = { prepareQuery: (...args: unknown[]) => unknown };
const session = (db as unknown as { session: Session }).session;
const originalPrepare = session.prepareQuery;

async function countQueries(fn: () => unknown): Promise<number> {
  let count = 0;
  session.prepareQuery = (...args: unknown[]) => {
    count++;
    return originalPrepare.apply(session, args);
  };
  try {
    await fn();
  } finally {
    session.prepareQuery = originalPrepare;
  }
  return count;
}

const runningConfig = serializeAbConfig({
  v: 1,
  status: "running",
  labelA: null,
  labelB: null,
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
  startsAt: null,
  endsAt: null,
});

describe("unified views stay unified (#81 E.16)", () => {
  it("topLinks shows an A/B link ONCE with combined clicks", async () => {
    seedPage();
    const plain = seedLink({ title: "Plain", url: "https://example.com/p" });
    const tested = seedLink({
      title: "Tested",
      url: "https://example.com/t",
      abConfig: runningConfig,
    });

    for (let i = 0; i < 3; i++) await recordClick(plain.id, `p-${i}`, null);
    // Labeled A + labeled B + one unlabeled — all five count toward the ONE
    // unified row on the dashboard.
    for (let i = 0; i < 2; i++) await recordClick(tested.id, `ta-${i}`, null, "click", "A");
    for (let i = 0; i < 2; i++) await recordClick(tested.id, `tb-${i}`, null, "click", "B");
    await recordClick(tested.id, "tu-0", null);

    const stats = await getDashboardStats("30d");
    const testedRows = stats.topLinks.filter((l) => l.id === tested.id);
    expect(testedRows).toHaveLength(1); // ONE row, never one per variant
    expect(testedRows[0].clicks).toBe(5); // 2A + 2B + 1 unlabeled
    const plainRow = stats.topLinks.find((l) => l.id === plain.id);
    expect(plainRow?.clicks).toBe(3);
  });

  it("topLinks query count is FLAT as link count grows 20x (per-link GROUP BY)", async () => {
    // Measure the already-seeded world (2 links from the previous test in
    // this file — the sql.js DB is shared), then grow it 20x and re-measure.
    const baseline = await countQueries(() => getDashboardStats("30d"));
    expect(baseline).toBeGreaterThanOrEqual(3); // sanity: hook saw queries

    for (let i = 0; i < 40; i++) {
      const l = seedLink({
        title: `Extra ${i}`,
        url: `https://example.com/extra-${i}`,
        orderIndex: 100 + i,
        abConfig: i % 2 === 0 ? runningConfig : null,
      });
      for (let j = 0; j < 5; j++) {
        await recordClick(l.id, `e-${i}-${j}`, null, "click", j % 2 ? "A" : "B");
      }
    }

    const grown = await countQueries(() => getDashboardStats("30d"));
    expect(grown).toBe(baseline); // flat — aggregation is per link, not per link x variant
  });

  it("index/public link lists hand back abConfig as a plain column (no extra queries, no variants)", async () => {
    const baselineActive = await countQueries(() => getActiveLinks());
    const baselineAll = await countQueries(() => getAllLinks());
    expect(baselineActive + baselineAll).toBeGreaterThanOrEqual(2);

    // Growing the A/B population must not change either count — the lists
    // select whole rows (abConfig included) and never fan out variants.
    for (let i = 0; i < 10; i++) {
      seedLink({
        title: `Listed ${i}`,
        url: `https://example.com/listed-${i}`,
        orderIndex: 500 + i,
        abConfig: runningConfig,
      });
    }
    const activeAfter = await countQueries(() => getActiveLinks());
    const allAfter = await countQueries(() => getAllLinks());
    expect(activeAfter).toBe(baselineActive);
    expect(allAfter).toBe(baselineAll);

    // The config rides the row verbatim for the DETAIL page to interpret.
    const rows = await getAllLinks();
    const withConfig = rows.filter((r) => r.abConfig === runningConfig);
    expect(withConfig.length).toBeGreaterThan(0);
  });
});

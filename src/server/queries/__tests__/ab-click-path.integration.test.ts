/**
 * #81 E.5 — click-path query-count regression harness.
 *
 * WHY: /go is THE hot path. The A/B feature promised zero extra queries on
 * it, and nothing until now would fail if someone later added a per-click
 * lookup (ab_config re-fetch, variant row query, per-link N+1...). This
 * harness counts queries at the single choke point every drizzle/sql.js
 * statement passes through (SQLJsSession.prepareQuery) and asserts:
 *
 *   1. SANITY: the patched hook actually sees the queries (count >= 1) —
 *      a wrong patch point must fail loudly, not pass vacuously at 0.
 *   2. EQUALITY: clicking a link WITH a running A/B test costs EXACTLY the
 *      same number of queries as a plain link (assignment is pure), and
 *      recording a variant-labeled click costs the same as a plain one.
 *   3. FLAT: the per-click count does not grow when the links table or the
 *      click history grows 10x (the N+1 tripwire).
 *   4. CEILING: absolute bounds on each step, so gross regressions fail
 *      even if all comparison sides drift together.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./integration-setup";
import { db, seedLink } from "./integration-setup";
import { getLinkByRef, recordClick, getLinkStats } from "@/server/queries";
import { serializeAbConfig } from "@/lib/ab-test";

type Session = {
  prepareQuery: (...args: unknown[]) => unknown;
};

const session = (db as unknown as { session: Session }).session;
const originalPrepare = session.prepareQuery;

/** Run `fn` with query counting hooked; restores the hook even on throw. */
async function countQueries(fn: () => Promise<void> | void): Promise<number> {
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

beforeEach(async () => {
  // Always restore the hook between tests (a failed fn would otherwise leak).
  session.prepareQuery = originalPrepare;
  // Warm-up OUTSIDE measurement: the first lookup/write pays one-time costs
  // (statement cache init), which made plain=7 vs variant=6 in early runs —
  // an artifact, not an attribution query. Both sides must measure WARM.
  const scratch = seedLink({ url: "https://example.com/warmup" });
  await getLinkByRef(String(scratch.id));
  await recordClick(scratch.id, "perf-warmup", null);
  await getLinkStats(scratch.id, "30d"); // E.14: warm the detail-page path too
});

describe("click-path query count (#81 E.5)", () => {
  it("getLinkByRef costs the SAME with and without an A/B config (no config re-fetch)", async () => {
    const plain = seedLink({ url: "https://example.com/plain" });
    const tested = seedLink({
      url: "https://example.com/tested",
      abConfig: runningConfig,
    });

    const plainCount = await countQueries(async () => {
      const l = await getLinkByRef(String(plain.id));
      expect(l).not.toBeNull();
    });
    const testedCount = await countQueries(async () => {
      const l = await getLinkByRef(String(tested.id));
      expect(l).not.toBeNull();
      expect(l?.abConfig).toBe(runningConfig); // rides the SAME row
    });

    // Sanity: the hook sees queries at all (guards against a hollow test).
    expect(plainCount).toBeGreaterThanOrEqual(1);
    expect(testedCount).toBe(plainCount); // equality — the #81 promise
    // Warm measured = 1 (a single SELECT of the whole row). Exact pin.
    expect(testedCount).toBe(1);
  });

  it("recordClick costs the SAME with a variant label as without (no attribution query)", async () => {
    const link = seedLink({ abConfig: runningConfig });

    const plainCount = await countQueries(() => recordClick(link.id, "perf-plain", null));
    const variantCount = await countQueries(() =>
      recordClick(link.id, "perf-variant", null, "click", "B"),
    );

    expect(plainCount).toBeGreaterThanOrEqual(1);
    expect(variantCount).toBe(plainCount); // label rides the same INSERT
    // Measured warm cost = 6 (tx begin/commit + click insert + counter bump
    // + dedup/lookup internals). Exact, not a range: any added query fails
    // this line and forces a conscious ceiling update = the regression gate.
    expect(variantCount).toBe(6);
  });

  it("per-click cost is FLAT as link count and click history grow 10x (N+1 tripwire)", async () => {
    // Small world: 1 link, no history.
    const lone = seedLink({ url: "https://example.com/lone" });
    const baseline = await countQueries(async () => {
      const l = await getLinkByRef(String(lone.id));
      if (l) await recordClick(l.id, "perf-base", null, "click", "A");
    });

    // 10x world: 40 more links + a deep click history.
    const big = seedLink({ url: "https://example.com/big", abConfig: runningConfig });
    for (let i = 0; i < 40; i++) {
      seedLink({ url: `https://example.com/extra-${i}`, orderIndex: i + 1 });
    }
    for (let i = 0; i < 200; i++) {
      await recordClick(big.id, `hist-${i}`, null, "click", i % 2 ? "B" : "A");
    }

    const grown = await countQueries(async () => {
      const l = await getLinkByRef(String(big.id));
      if (l) await recordClick(l.id, "perf-grown", null, "click", "B");
    });

    expect(baseline).toBeGreaterThanOrEqual(2); // sanity: both ops seen
    expect(grown).toBe(baseline); // flat — no N+1, no history scan
    // Warm measured total = 7 (getLinkByRef 1 + recordClick 6). Exact pin:
    // history/link growth must not move it, and an N+1 fails it immediately.
    expect(grown).toBe(7);
  });

  it("E.14: getLinkStats costs the same with a test as without, flat vs history", async () => {
    // The #81 variants GROUP BY runs unconditionally, so a link WITH a
    // running config must cost exactly what a plain link costs (no
    // config-dependent branch), and click-history size must not move it.
    const plain = seedLink({ url: "https://example.com/stats-plain" });
    const tested = seedLink({
      url: "https://example.com/stats-tested",
      abConfig: runningConfig,
    });

    const plainCount = await countQueries(async () => {
      const s = await getLinkStats(plain.id, "30d");
      expect(s).not.toBeNull();
    });
    const testedCount = await countQueries(async () => {
      const s = await getLinkStats(tested.id, "30d");
      expect(s?.variants).toEqual({ a: 0, b: 0 });
    });

    expect(plainCount).toBeGreaterThanOrEqual(1); // sanity: hook saw queries
    expect(testedCount).toBe(plainCount); // equality — the #81 promise
    // Warm measured = 5 (link row + total + per-day + top-referrers + the
    // unconditional variants GROUP BY; the day series is computed in memory).
    expect(testedCount).toBe(5);

    // Flat vs history: 200 labeled clicks must not move the count.
    for (let i = 0; i < 200; i++) {
      await recordClick(tested.id, `stats-hist-${i}`, null, "click", i % 2 ? "A" : "B");
    }
    const grownCount = await countQueries(async () => {
      const s = await getLinkStats(tested.id, "30d");
      expect((s?.variants.a ?? 0) + (s?.variants.b ?? 0)).toBe(200); // all labeled
    });
    expect(grownCount).toBe(testedCount);
  });
});

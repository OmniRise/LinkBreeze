/**
 * Integration tests: #81 E.1 auto-promotion scanner.
 *
 * The scanner runs against the sql.js harness (real queries, no real file).
 * Toggle gating (settings KV), throttle behavior, promotion semantics and the
 * allowlist defense are exercised end to end through runAbAutoPromoteScan().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "./integration-setup";
import { db, seedLink } from "./integration-setup";
import { recordClick, updateSetting, getLink, getLinkStats } from "@/server/queries";
import { analyticsClicks, links } from "@/db/schema";
import { runAbAutoPromoteScan, maybeAutoPromoteAbTests, _resetAbAutoPromoteThrottle, AB_AUTO_PROMOTE_SETTING } from "@/server/ab-auto-promote";
import { parseAbConfig, serializeAbConfig, autoPromotableWinner, AB_AUTO_PROMOTE_MIN_CLICKS, type AbConfig } from "@/lib/ab-test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";

const running: AbConfig = {
  v: 1,
  status: "running",
  labelA: null,
  labelB: null,
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
};

// E.47 query-cost pin — local countQueries per the repo convention (copied
// from ab-unified-views: each integration file owns its own harness copy).
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

async function seedRunningTest(overrides: Partial<AbConfig> = {}) {
  return seedLink({ abConfig: serializeAbConfig({ ...running, ...overrides }) });
}

async function clickVariants(linkId: number, a: number, b: number) {
  for (let i = 0; i < a; i++) await recordClick(linkId, `va-${i}`, null, "click", "A");
  for (let i = 0; i < b; i++) await recordClick(linkId, `vb-${i}`, null, "click", "B");
}

beforeEach(async () => {
  _resetAbAutoPromoteThrottle();
  await updateSetting(AB_AUTO_PROMOTE_SETTING, "off");
  // The sql.js DB is shared across tests in this file: wipe links + clicks
  // so each case starts from a clean slate (test 1's link otherwise gets
  // promoted during test 2's scan — caught by "promotes B" seeing 2).
  await db.delete(analyticsClicks);
  await db.delete(links);
});

describe("auto-promotion scanner (#81 E.1)", () => {
  it("does nothing when the toggle is off (default)", async () => {
    const link = await seedRunningTest();
    await clickVariants(link.id, 50, 150); // would be promotable
    expect(await runAbAutoPromoteScan()).toBe(0);
    const row = await getLink(link.id);
    expect(parseAbConfig(row?.abConfig ?? null)?.status).toBe("running");
  });

  it("promotes B and pins the URL when the toggle is on", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 50, 150);
    expect(await runAbAutoPromoteScan()).toBe(1);
    const row = await getLink(link.id);
    const cfg = parseAbConfig(row?.abConfig ?? null);
    expect(cfg?.status).toBe("archived");
    expect(cfg?.winner).toBe("B");
    expect(row?.url).toBe("https://example.com/b");

    // E.50: promotion archives the TEST but never rewrites click history —
    // the permanent labels the CSV export reads stay A:50/B:150 intact.
    const remaining = db
      .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .groupBy(analyticsClicks.variant)
      .all();
    expect(remaining).toEqual([
      { variant: "A", c: 50 },
      { variant: "B", c: 150 },
    ]);
  });

  it("promotes A without touching the URL", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 150, 50);
    expect(await runAbAutoPromoteScan()).toBe(1);
    const row = await getLink(link.id);
    const cfg = parseAbConfig(row?.abConfig ?? null);
    expect(cfg?.winner).toBe("A");
    expect(row?.url).toBe("https://example.com");
  });

  it("leaves small-sample tests running", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 2, 18);
    expect(await runAbAutoPromoteScan()).toBe(0);
    expect(parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status).toBe("running");
  });

  it("leaves noise-level splits running", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 510, 490);
    expect(await runAbAutoPromoteScan()).toBe(0);
  });

  it("leaves PAUSED tests alone even with a significant margin", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest({ status: "paused" });
    await clickVariants(link.id, 50, 150);
    expect(await runAbAutoPromoteScan()).toBe(0);
    expect(parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status).toBe("paused");
  });

  it("never pins a variant B that fails the allowlist (backup/tamper defense)", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest({ urlB: "javascript:alert(1)" });
    await clickVariants(link.id, 50, 150);
    expect(await runAbAutoPromoteScan()).toBe(0);
    const row = await getLink(link.id);
    // Untouched proven at the RAW level: since E.82 the schema itself
    // rejects this config (parse → null), so byte-identity of the stored
    // JSON is the honest "scanner never wrote to it" assertion.
    expect(row?.abConfig).toBe(
      serializeAbConfig({ ...running, urlB: "javascript:alert(1)" }),
    );
    expect(row?.url).toBe("https://example.com");
  });

  it("skips plain links without configs", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const plain = seedLink(); // no abConfig
    await clickVariants(plain.id, 10, 400);
    expect(await runAbAutoPromoteScan()).toBe(0);
  });

  it("only promotes each test once (archived configs are never rescanned)", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 50, 150);
    expect(await runAbAutoPromoteScan()).toBe(1);
    _resetAbAutoPromoteThrottle();
    expect(await runAbAutoPromoteScan()).toBe(0); // already archived
  });

  it("E.2: never auto-promotes a time-boxed test whose window is still open", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    const link = await seedRunningTest({ endsAt: future });
    await clickVariants(link.id, 50, 150); // would be promotable
    expect(await runAbAutoPromoteScan()).toBe(0);
    expect(parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status).toBe("running");
  });

  it("E.2: promotes once the window has closed", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    const link = await seedRunningTest({ endsAt: past });
    await clickVariants(link.id, 50, 150);
    expect(await runAbAutoPromoteScan()).toBe(1);
    expect(parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status).toBe("archived");
  });

  it("E.20: maybeAutoPromoteAbTests' module throttle suppresses a second call; reset re-arms it", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");

    // The fire-and-forget entry point must never throw synchronously
    // (it swallows scan errors into console.error by design).
    expect(() => maybeAutoPromoteAbTests()).not.toThrow();
    _resetAbAutoPromoteThrottle(); // the assertion above consumed the first slot

    const first = await seedRunningTest();
    await clickVariants(first.id, 50, 150);
    maybeAutoPromoteAbTests(); // starts the scan + arms the 10-min throttle
    await vi.waitFor(
      async () => {
        expect(parseAbConfig((await getLink(first.id))?.abConfig ?? null)?.status).toBe("archived");
      },
      { timeout: 3000 },
    );

    // Second promotable link, second call IMMEDIATELY — the throttle (armed
    // by the call above) must suppress the scan, so this one survives.
    const second = await seedRunningTest();
    await clickVariants(second.id, 50, 150);
    expect(() => maybeAutoPromoteAbTests()).not.toThrow();
    await new Promise((r) => setTimeout(r, 300)); // give a would-be scan time
    expect(
      parseAbConfig((await getLink(second.id))?.abConfig ?? null)?.status,
    ).toBe("running");

    // Re-arming the throttle re-enables the scanner.
    _resetAbAutoPromoteThrottle();
    maybeAutoPromoteAbTests();
    await vi.waitFor(
      async () => {
        expect(parseAbConfig((await getLink(second.id))?.abConfig ?? null)?.status).toBe("archived");
      },
      { timeout: 3000 },
    );
  });

  it("E.79: throttle expires by TIME (not reset) at the exact 10-min boundary; re-scan after expiry is idempotent", async () => {
    // The throttle is MODULE MEMORY (like maybeRunScheduledBackup), NOT a
    // KV timestamp — there is no persisted stamp to manipulate, and a KV
    // one would defeat the point (the click path must read settings at
    // most once per 10 min). E.20 pinned the reset path; this pins the
    // unpinned NATURAL EXPIRY path (now - lastCheck >= THROTTLE_MS) with
    // a controlled clock instead of sleeping 10 minutes, plus a direct
    // re-scan proving an expiry/restart re-fire never double-promotes.
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    _resetAbAutoPromoteThrottle();

    const t0 = Date.now();
    let offset = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => t0 + offset);
    const status = async (id: number) =>
      parseAbConfig((await getLink(id))?.abConfig ?? null)?.status;
    // Poll on UN-spied performance.now so the frozen clock can't hang it.
    const waitUntil = async (cond: () => Promise<boolean>, ms = 3000) => {
      const deadline = performance.now() + ms;
      while (performance.now() < deadline) {
        if (await cond()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("waitUntil timed out");
    };

    try {
      // 1) First fire arms the throttle at t0 and promotes link #1.
      const first = await seedRunningTest();
      await clickVariants(first.id, 50, 150);
      maybeAutoPromoteAbTests();
      await waitUntil(async () => (await status(first.id)) === "archived");

      // 2) Still INSIDE the window (t0 + THROTTLE - 1ms): suppressed.
      const second = await seedRunningTest();
      await clickVariants(second.id, 50, 150);
      offset = 10 * 60 * 1000 - 1; // one millisecond before expiry
      expect(() => maybeAutoPromoteAbTests()).not.toThrow();
      await new Promise((r) => setTimeout(r, 300)); // would-be scan time
      expect(await status(second.id)).toBe("running"); // suppressed

      // 3) The EXACT boundary fires with NO reset — natural time expiry.
      offset = 10 * 60 * 1000; // now - lastCheck === THROTTLE_MS
      expect(() => maybeAutoPromoteAbTests()).not.toThrow();
      await waitUntil(async () => (await status(second.id)) === "archived");

      // 4) Direct re-scan (fresh-process shape: throttle bypassed, as a
      //    restart re-arm would) must be IDEMPOTENT: nothing left to
      //    promote, both configs byte-stable, nothing un-archived.
      const raw1 = (await getLink(first.id))?.abConfig ?? null;
      const raw2 = (await getLink(second.id))?.abConfig ?? null;
      expect(await runAbAutoPromoteScan()).toBe(0);
      expect((await getLink(first.id))?.abConfig ?? null).toBe(raw1);
      expect((await getLink(second.id))?.abConfig ?? null).toBe(raw2);
    } finally {
      spy.mockRestore();
    }
  });

  it("E.23: promotion weighs ALL-TIME clicks (backdated history still fires the scanner)", async () => {
    // Deliberately un-ranged: promotion is permanent, so the whole
    // experiment counts — contrast with the range-scoped detail breakdown.
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 50, 150); // exactly 200 = the floor
    // Backdate ALL clicks a year: a range-scoped count would see zero.
    await db
      .update(analyticsClicks)
      .set({ createdAt: "2020-01-01 00:00:00" })
      .where(eq(analyticsClicks.linkId, link.id));
    expect(await runAbAutoPromoteScan()).toBe(1);
    const cfg = parseAbConfig((await getLink(link.id))?.abConfig ?? null);
    expect(cfg?.status).toBe("archived");
    expect(cfg?.winner).toBe("B");
  });

  it("E.64: breakdown==scanner when the range covers all; scanner follows rows when the three surfaces diverge", async () => {
    // Three count surfaces exist: the range-scoped detail breakdown
    // (getLinkStats), the lifetime denormalized clicksCount, and the
    // scanner's ALL-TIME row counts. Pin their relationship end-to-end:
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 60, 140); // 200 rows, all recent

    // (a) EQUALITY: range(7d) covers everything and nothing was pruned ->
    // breakdown == raw rows == clicksCount == the scanner's input pool.
    const s0 = await getLinkStats(link.id, "7d");
    expect(s0!.variants).toEqual({ a: 60, b: 140 });
    expect(s0!.totalClicks).toBe(200);
    const raw0 = db
      .select({ c: sql<number>`count(*)` })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .get();
    expect(raw0?.c).toBe(200);
    expect((await getLink(link.id))?.clicksCount).toBe(200);

    // (b) DIVERGE: backdate 30 A rows past the 7d window.
    const oldA = db
      .select({ id: analyticsClicks.id })
      .from(analyticsClicks)
      .where(and(eq(analyticsClicks.linkId, link.id), eq(analyticsClicks.variant, "A")))
      .limit(30)
      .all()
      .map((r) => r.id);
    expect(oldA).toHaveLength(30);
    await db
      .update(analyticsClicks)
      .set({ createdAt: "2020-01-01 00:00:00" })
      .where(inArray(analyticsClicks.id, oldA));

    const s1 = await getLinkStats(link.id, "7d");
    expect(s1!.variants).toEqual({ a: 30, b: 140 }); // range now 170
    expect(s1!.totalClicks).toBe(170);
    expect((await getLink(link.id))?.clicksCount).toBe(200); // lifetime untouched

    // (c) The scanner must follow the ALL-TIME rows: the range view
    // (170 < the 200 floor) would refuse; all-time (exactly 200,
    // 60/140 significant) promotes. If the scanner read the breakdown
    // OR any rolled-up counter instead of rows, this would return 0.
    expect(await runAbAutoPromoteScan()).toBe(1);
    const cfg = parseAbConfig((await getLink(link.id))?.abConfig ?? null);
    expect(cfg?.status).toBe("archived");
    expect(cfg?.winner).toBe("B");

    // The archived view keeps its range-scoped numbers (never rewritten).
    const s2 = await getLinkStats(link.id, "7d");
    expect(s2!.variants).toEqual({ a: 30, b: 140 });
  });

  it("E.77: prefilter property sweep - LIKE hit-set == running configs over generated shapes (drift-proofed)", async () => {
    // Property, not fixtures: over a combinatorial sweep of editor-shaped
    // configs (status x version x adversarial labels x window x winner),
    // the scanner's SQL prefilter must hit EXACTLY the status:"running"
    // rows — adversarial label/url text must never false-match (JSON
    // escapes quotes, so the structural substring is unforgeable inside
    // values), paused/archived never match, bare (NULL) never match.
    // v:2 RUNNING rows DO match the LIKE by design — parse re-validation
    // rejects them at scan level (pinned by E.26); prefilter-level truth
    // is version-blind and pinned here.
    const prodSrc = readFileSync(
      resolve(process.cwd(), "src/server/ab-auto-promote.ts"),
      "utf8",
    );
    const predicate = `LIKE '%"status":"running"%'`;
    expect(prodSrc, "test predicate drifted from production prefilter").toContain(
      predicate,
    );

    const statuses = ["running", "paused", "archived"] as const;
    const versions = [1, 2] as const;
    const labels = ["control", "running", 'x","status":"running', '"status":"running"'];
    const windows = [false, true] as const;
    const winners = [null, "B"] as const;

    const expected: number[] = [];
    let i = 0;
    for (const status of statuses) {
      for (const v of versions) {
        for (const labelA of labels) {
          for (const useWindow of windows) {
            for (const winner of winners) {
              const row = seedLink({
                url: `https://example.com/p${i}`,
                abConfig: JSON.stringify({
                  v,
                  status,
                  labelA,
                  labelB: "short",
                  urlB: "https://example.com/b",
                  weightA: 50,
                  weightB: 50,
                  winner,
                  ...(useWindow
                    ? { startsAt: "2026-11-01T10:00", endsAt: "2026-11-08T10:00" }
                    : {}),
                }),
              });
              if (status === "running") expected.push(row.id);
              i++;
            }
          }
        }
      }
    }
    // Bare links: no config at all (NULL must never match).
    const bare = [seedLink({ url: "https://example.com/bare-0" }), seedLink({ url: "https://example.com/bare-1" })];
    expect(i).toBe(96);

    const matched = db
      .select({ id: links.id })
      .from(links)
      .where(sql`${links.abConfig} LIKE '%\"status\":\"running\"%'`)
      .all()
      .map((r) => r.id);
    expect(matched.sort((a, b) => a - b)).toEqual(expected.sort((a, b) => a - b));
    expect(matched).toHaveLength(32); // 2v x 4labels x 2windows x 2winners
    for (const b of bare) expect(matched).not.toContain(b.id);
  });

  it("E.26: a future-version (v:2) config is never scanned — prefilter matches, re-parse rejects", async () => {
    // The interesting half-apply risk: v:2 JSON still contains the LIKE
    // prefilter fragment, so the scanner FINDS the row — its parse-level
    // re-validation must then reject it (0 promoted, config untouched).
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = seedLink({
      abConfig: JSON.stringify({ ...running, v: 2 }),
    });
    await clickVariants(link.id, 150, 350); // way past every floor
    expect(await runAbAutoPromoteScan()).toBe(0);
    const raw = (await getLink(link.id))?.abConfig ?? null;
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).v).toBe(2); // untouched, not rewritten to v:1
    expect(parseAbConfig(raw)).toBeNull();
  });

  it("E.32: retention pruning can only REMOVE promotability (scanner stays conservative)", async () => {
    // The E.23 comment's claim: retention deletes only LOWER the all-time
    // count, so pruning may flip a promotable test to un-promotable but
    // never the other way. (The real retention delete path — opportunistic
    // inside recordClick — is covered by retention.integration.test.ts;
    // here we simulate its exact effect: rows older than the window gone.)
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const link = await seedRunningTest();
    await clickVariants(link.id, 60, 240); // 300 total, significant, B leads

    // Before pruning: promotable by the same math the scanner uses.
    expect(autoPromotableWinner(60, 240, 50, AB_AUTO_PROMOTE_MIN_CLICKS)).toBe("B");

    // Simulate retention: delete 110 rows (whatever retention would have
    // dropped as "old") — leaves 190 < the 200 floor.
    const ids = db
      .select({ id: analyticsClicks.id })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .all()
      .slice(0, 110)
      .map((r) => r.id);
    expect(ids).toHaveLength(110);
    db.delete(analyticsClicks).where(inArray(analyticsClicks.id, ids)).run();

    // Remaining counts from the actual rows (split depends on which ids went).
    const rows = db
      .select({ variant: analyticsClicks.variant })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .all();
    const a = rows.filter((r) => r.variant === "A").length;
    const b = rows.filter((r) => r.variant === "B").length;
    expect(a + b).toBe(190);
    // The pure decision now refuses (below floor) — pruning direction only.
    expect(autoPromotableWinner(a, b, 50, AB_AUTO_PROMOTE_MIN_CLICKS)).toBeNull();

    // And the live scanner agrees: no promotion, config untouched.
    expect(await runAbAutoPromoteScan()).toBe(0);
    expect(parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status).toBe("running");
  });

  it("E.47: scan query cost is exact - 1 when off, 1+1+N for N running links, zero cost for the rest", async () => {
    // The scanner is a background/throttled job, but its cost model must be
    // pinned like the hot paths (E.5/E.14): toggle-off is ONE getSetting
    // and nothing else; with the toggle on it is setting + LIKE prefilter
    // + ONE grouped count per RUNNING link — non-running rows must cost
    // ZERO (the prefilter's whole point), and no winner here means no
    // updateLink queries either.
    expect(await countQueries(() => runAbAutoPromoteScan())).toBe(1);

    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");

    const N = 8;
    for (let i = 0; i < N; i++) await seedRunningTest();
    for (let i = 0; i < 45; i++) seedLink({ title: `Plain ${i}` }); // no abConfig -> prefiltered out

    const q = await countQueries(() => runAbAutoPromoteScan());
    expect(q).toBe(2 + N); // getSetting + prefilter + N grouped counts; 45 plain rows free
  });
});

describe("scanner eligibility truth table (#81 E.86)", () => {
  // One visible matrix consolidating every eligibility rule the scanner
  // applies (E.2 window, E.23 all-time counts, E.26 v-contract, E.32
  // prefilter, E.64 count surfaces): 17 cells seeded into ONE database,
  // ONE scan, then each row's fate asserted individually — 6 promote,
  // 11 skip. Individual rules stay covered by their own tests above;
  // this pins that they compose to the correct TOTAL behavior.
  type Cell = {
    name: string;
    expect: "promote-A" | "promote-B" | "skip";
    seed: { abConfig: string; type?: "url" | "email"; url?: string };
    clicks: { a: number; b: number; unlabeled?: number };
  };

  const cfg = (o: Partial<AbConfig> = {}) => serializeAbConfig({ ...running, ...o });
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();

  const CELLS: Cell[] = [
    { name: "paused (prefilter miss)", expect: "skip", seed: { abConfig: cfg({ status: "paused" }) }, clicks: { a: 150, b: 50 } },
    { name: "archived (prefilter miss)", expect: "skip", seed: { abConfig: cfg({ status: "archived", winner: "A" }) }, clicks: { a: 150, b: 50 } },
    { name: "future version v:2 (parse reject)", expect: "skip", seed: { abConfig: JSON.stringify({ ...running, v: 2 }) }, clicks: { a: 150, b: 50 } },
    { name: "non-url link type", expect: "skip", seed: { abConfig: cfg(), type: "email" }, clicks: { a: 150, b: 50 } },
    { name: "window still open (endsAt future)", expect: "skip", seed: { abConfig: cfg({ endsAt: future }) }, clicks: { a: 150, b: 50 } },
    { name: "window closed (endsAt past)", expect: "promote-A", seed: { abConfig: cfg({ endsAt: past }) }, clicks: { a: 150, b: 50 } },
    { name: "no window bounds", expect: "promote-A", seed: { abConfig: cfg() }, clicks: { a: 150, b: 50 } },
    // The scanner gates ONLY on the end bound (E.2's rule): a future
    // start with no end is still eligible — actual behavior, pinned.
    { name: "startsAt future, no endsAt (end-bound-only gate)", expect: "promote-A", seed: { abConfig: cfg({ startsAt: future }) }, clicks: { a: 150, b: 50 } },
    { name: "below floor (n=110)", expect: "skip", seed: { abConfig: cfg() }, clicks: { a: 50, b: 60 } },
    { name: "tie at floor (100/100, z=0)", expect: "skip", seed: { abConfig: cfg() }, clicks: { a: 100, b: 100 } },
    { name: "floor met, not significant (99/101)", expect: "skip", seed: { abConfig: cfg() }, clicks: { a: 99, b: 101 } },
    { name: "weight-aware: leader at expected rate (w90, 180/20)", expect: "skip", seed: { abConfig: cfg({ weightA: 90, weightB: 10 }) }, clicks: { a: 180, b: 20 } },
    { name: "weight-aware: leader beyond expected (w90, 195/5)", expect: "promote-A", seed: { abConfig: cfg({ weightA: 90, weightB: 10 }) }, clicks: { a: 195, b: 5 } },
    { name: "significant but below floor (15/5)", expect: "skip", seed: { abConfig: cfg() }, clicks: { a: 15, b: 5 } },
    { name: "unlabeled clicks excluded (150/50 + 500 unlabeled)", expect: "promote-A", seed: { abConfig: cfg() }, clicks: { a: 150, b: 50, unlabeled: 500 } },
    { name: "poisoned urlB (E.82 parse reject)", expect: "skip", seed: { abConfig: cfg({ urlB: "javascript:alert(1)" }) }, clicks: { a: 150, b: 50 } },
    { name: "B leader promotes + pins url", expect: "promote-B", seed: { abConfig: cfg() }, clicks: { a: 50, b: 150 } },
  ];

  it("runs all 17 cells through ONE scan and asserts each row's fate", async () => {
    await updateSetting(AB_AUTO_PROMOTE_SETTING, "on");
    const seeded: Array<{ cell: Cell; id: number; config: string; url: string }> = [];
    for (const [i, cell] of CELLS.entries()) {
      const link = seedLink({ ...cell.seed, title: `Cell ${i}: ${cell.name}` });
      for (let k = 0; k < cell.clicks.a; k++) await recordClick(link.id, `e86-${i}-a${k}`, null, "click", "A");
      for (let k = 0; k < cell.clicks.b; k++) await recordClick(link.id, `e86-${i}-b${k}`, null, "click", "B");
      for (let k = 0; k < (cell.clicks.unlabeled ?? 0); k++) await recordClick(link.id, `e86-${i}-u${k}`, null, "click");
      seeded.push({ cell, id: link.id, config: link.abConfig ?? "", url: link.url });
    }

    const promoted = await runAbAutoPromoteScan();
    expect(promoted).toBe(CELLS.filter((c) => c.expect !== "skip").length); // 6

    for (const { cell, id, config, url } of seeded) {
      const row = await getLink(id);
      const parsed = parseAbConfig(row?.abConfig ?? null);
      if (cell.expect === "skip") {
        // Untouched: byte-identical config + same URL (either never
        // fetched by the prefilter, rejected at parse, or gated by
        // type/window/count rules after the fetch).
        expect(row?.abConfig, cell.name).toBe(config);
        expect(row?.url, cell.name).toBe(url);
      } else if (cell.expect === "promote-A") {
        expect(parsed?.status, cell.name).toBe("archived");
        expect(parsed?.winner, cell.name).toBe("A");
        expect(row?.url, cell.name).toBe(url); // A never touches the URL
      } else {
        expect(parsed?.status, cell.name).toBe("archived");
        expect(parsed?.winner, cell.name).toBe("B");
        expect(row?.url, cell.name).toBe("https://example.com/b"); // pinned
      }
    }
  }, 60_000); // ~3,200 real recordClick inserts across the 17 cells
});

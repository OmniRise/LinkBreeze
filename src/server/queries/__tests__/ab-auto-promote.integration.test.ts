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
import { recordClick, updateSetting, getLink } from "@/server/queries";
import { analyticsClicks, links } from "@/db/schema";
import { runAbAutoPromoteScan, maybeAutoPromoteAbTests, _resetAbAutoPromoteThrottle, AB_AUTO_PROMOTE_SETTING } from "@/server/ab-auto-promote";
import { parseAbConfig, serializeAbConfig, autoPromotableWinner, AB_AUTO_PROMOTE_MIN_CLICKS, type AbConfig } from "@/lib/ab-test";
import { eq, inArray } from "drizzle-orm";

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
    expect(parseAbConfig(row?.abConfig ?? null)?.status).toBe("running");
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

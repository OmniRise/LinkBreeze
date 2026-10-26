/**
 * Integration tests: #81 E.1 auto-promotion scanner.
 *
 * The scanner runs against the sql.js harness (real queries, no real file).
 * Toggle gating (settings KV), throttle behavior, promotion semantics and the
 * allowlist defense are exercised end to end through runAbAutoPromoteScan().
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./integration-setup";
import { db, seedLink } from "./integration-setup";
import { recordClick, updateSetting, getLink } from "@/server/queries";
import { analyticsClicks, links } from "@/db/schema";
import { runAbAutoPromoteScan, _resetAbAutoPromoteThrottle, AB_AUTO_PROMOTE_SETTING } from "@/server/ab-auto-promote";
import { parseAbConfig, serializeAbConfig, type AbConfig } from "@/lib/ab-test";

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
});

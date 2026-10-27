/**
 * #81 E.59 — weight-change mid-run semantics.
 *
 * Re-saving a RUNNING test with new weights (setAbTest) is a CONFIG write
 * only:
 *   1. NOTHING retroactive: already-recorded click rows keep the variant
 *      labels they were recorded under (the A/B history is append-only —
 *      promote/archive/weight-changes never rewrite it).
 *   2. The NEXT request uses the NEW weights: assignment is pure and reads
 *      the CURRENT config per request, so the very same visitor can flip
 *      sides after a weight change — stickiness is per-config, not eternal.
 *
 * Harness: REAL sql.js db + REAL action + REAL /go route (auth/demo/side
 * paths mocked per repo convention — the E.31 lesson: backup-scheduler and
 * the auto-promote trigger are stubbed because /go fires them).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({
    userId: 1,
    username: "admin",
    exp: Date.now() + 60000,
    pv: 1,
  })),
}));
vi.mock("@/lib/demo", () => ({ demoBlock: vi.fn(() => null) }));
vi.mock("@/lib/visitor", () => ({
  getVisitorHash: vi.fn(() => "unset"),
  stripReferrer: vi.fn((r: string | null) => r ?? ""),
}));
vi.mock("@/lib/bot-detect", () => ({ isBot: vi.fn(() => false) }));
vi.mock("@/server/backup-scheduler", () => ({ maybeRunScheduledBackup: vi.fn() }));
vi.mock("@/server/ab-auto-promote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ab-auto-promote")>()),
  maybeAutoPromoteAbTests: vi.fn(),
}));

import "./integration-setup";
import { seedLink } from "./integration-setup";
import { recordClick } from "@/server/queries";
import { analyticsClicks, links } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { assignVariant, parseAbConfig, serializeAbConfig, type AbConfig } from "@/lib/ab-test";
import { setAbTest } from "@/server/actions/links";
import { getVisitorHash } from "@/lib/visitor";
import { isBot } from "@/lib/bot-detect";
import { GET as goGET } from "@/app/go/[id]/route";
import { NextRequest } from "next/server";

const running5050: AbConfig = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short",
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
};

function variantCounts(linkId: number) {
  return db
    .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(eq(analyticsClicks.linkId, linkId))
    .groupBy(analyticsClicks.variant)
    .all();
}

// db import kept local to the helper's module scope via integration-setup.
import { db } from "./integration-setup";

async function go(id: number, visitor: string) {
  vi.mocked(getVisitorHash).mockReturnValueOnce(visitor);
  return goGET(new NextRequest(`http://localhost:3000/go/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
}

describe("[integration] weight change mid-run (#81 E.59)", () => {
  it("re-save does NOT rewrite history; the NEXT request serves the NEW split", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);

    const link = seedLink({
      url: "https://example.com/a",
      abConfig: serializeAbConfig(running5050),
    });

    // One visitor living on BOTH sides across the two configs: A at 50/50
    // (bucket b < 50) and B at 1/99 (bucket b >= 1) -> b in [1, 49].
    const visitor = Array.from({ length: 200 }, (_, i) => `e59-v-${i}`).find(
      (v) =>
        assignVariant(v, link.id, 50, 50) === "A" &&
        assignVariant(v, link.id, 1, 99) === "B",
    );
    expect(visitor).toBeDefined();

    // Recorded history under the OLD weights: A×2 + B×3.
    await recordClick(link.id, "hist-a-1", null, "click", "A");
    await recordClick(link.id, "hist-a-2", null, "click", "A");
    await recordClick(link.id, "hist-b-1", null, "click", "B");
    await recordClick(link.id, "hist-b-2", null, "click", "B");
    await recordClick(link.id, "hist-b-3", null, "click", "B");
    expect(variantCounts(link.id)).toEqual([
      { variant: "A", c: 2 },
      { variant: "B", c: 3 },
    ]);

    // BEFORE: old 50/50 config serves visitor -> A (own url), and the
    // human click is RECORDED under the old config's label.
    const before = await go(link.id, visitor!);
    expect(before.headers.get("location")).toBe("https://example.com/a");
    expect(variantCounts(link.id)).toEqual([
      { variant: "A", c: 3 }, // 2 direct + 1 from the before-GET (old label A)
      { variant: "B", c: 3 },
    ]);
    const preResave = variantCounts(link.id);

    // Re-save during the RUNNING test: flip to 1/99.
    const fd = new FormData();
    fd.set("id", String(link.id));
    fd.set("weightA", "1");
    fd.set("urlB", "https://example.com/b");
    fd.set("labelA", "control");
    fd.set("labelB", "short");
    fd.set("startsAt", "");
    fd.set("endsAt", "");
    const res = await setAbTest(fd);
    if (!res.success) throw new Error(`setAbTest failed: ${res.error}`);

    // Config is the new one, still RUNNING (re-save preserves status).
    const stored = parseAbConfig(
      db.select({ abConfig: links.abConfig }).from(links).where(eq(links.id, link.id)).get()
        ?.abConfig ?? null,
    );
    expect(stored?.weightA).toBe(1);
    expect(stored?.weightB).toBe(99);
    expect(stored?.status).toBe("running");

    // CLAIM 1: history untouched — identical to the pre-resave snapshot
    // (the before-GET's recorded click stays under its OLD label).
    expect(variantCounts(link.id)).toEqual(preResave);

    // CLAIM 2: SAME visitor, NEXT request -> the NEW split (now B side).
    const after = await go(link.id, visitor!);
    expect(after.headers.get("location")).toBe("https://example.com/b");

    vi.unstubAllEnvs();
  });
});

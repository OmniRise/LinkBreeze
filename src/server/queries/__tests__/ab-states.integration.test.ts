/**
 * #81 E.61 — the three non-running states, end-to-end on REAL DB rows.
 *
 * route.test covers these states against a MOCKED link row; this file
 * seeds real sql.js rows and serves them through the REAL /go route to
 * pin the DB-level truth (stored JSON parsing, type guards, recording):
 *   - paused    -> BOTH visitors get link.url (no split), click UNLABELED
 *   - archived  -> link.url (the pinned winner URL) regardless of visitor,
 *                  NEVER the config's urlB field (stale configs can't move it)
 *   - out-of-window running -> link.url for everyone, click UNLABELED
 *     ("outside the window the link serves variant A only, clicks stay
 *      unlabeled" — the CHANGELOG contract)
 *
 * Each state is served to a visitor pair picked as OPPOSITE buckets ON
 * THAT LINK's id — if the state wrongly split traffic, the two requests
 * would land on different URLs and the single-url assertion would fail.
 *
 * Harness identical to ab-weights/ab-restore (E.31 lesson: backup +
 * auto-promote triggers stubbed; visitor mocked only for determinism).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({
    userId: 1,
    username: "admin",
    exp: Date.now() + 60000,
    pv: 1,
  })),
}));
vi.mock("@/lib/demo", () => ({ demoBlock: vi.fn(() => null) }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
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
import { db, seedLink } from "./integration-setup";
import { analyticsClicks, links } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { assignVariant, parseAbConfig, serializeAbConfig, type AbConfig } from "@/lib/ab-test";
import { setAbTest, setAbTestStatus, promoteAbVariant, removeAbTest } from "@/server/actions/links";
import { getLink, recordClick, getLinkStats } from "@/server/queries";
import { getVisitorHash } from "@/lib/visitor";
import { isBot } from "@/lib/bot-detect";
import { GET as goGET } from "@/app/go/[id]/route";
import { NextRequest } from "next/server";

const base: AbConfig = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short",
  urlB: "https://example.com/short",
  weightA: 50,
  weightB: 50,
  winner: null,
};

/** Opposite-bucket visitor pair for THIS link id (proven by construction). */
function oppositePair(linkId: number) {
  const pool = (p: string) => Array.from({ length: 200 }, (_, i) => `${p}-${i}`);
  const a = pool("e61-va").find((v) => assignVariant(v, linkId, 50, 50) === "A");
  const b = pool("e61-vb").find((v) => assignVariant(v, linkId, 50, 50) === "B");
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  return { a: a!, b: b! };
}

function counts(linkId: number) {
  return db
    .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(eq(analyticsClicks.linkId, linkId))
    .groupBy(analyticsClicks.variant)
    .all();
}

async function go(id: number, visitor: string) {
  vi.mocked(getVisitorHash).mockReturnValueOnce(visitor);
  return goGET(new NextRequest(`http://localhost:3000/go/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
}

/** Both opposite-side visitors must receive the SAME url (no split). */
async function bothGet(linkId: number, ownUrl: string) {
  const { a, b } = oppositePair(linkId);
  expect((await go(linkId, a)).headers.get("location")).toBe(ownUrl);
  expect((await go(linkId, b)).headers.get("location")).toBe(ownUrl);
}

describe("[integration] non-running states serve link.url, unlabeled (#81 E.61)", () => {
  it("PAUSED: both sides get link.url; clicks recorded UNLABELED", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const link = seedLink({
      url: "https://example.com/own",
      abConfig: serializeAbConfig({ ...base, status: "paused" }),
    });
    await bothGet(link.id, "https://example.com/own");
    expect(counts(link.id)).toEqual([{ variant: null, c: 2 }]);
    vi.unstubAllEnvs();
  });

  it("ARCHIVED: link.url (pinned winner) wins over the config's urlB, unlabeled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    // Stale/edited config: urlB points somewhere ELSE than the pinned
    // winner URL promote left on link.url — archived must never consult it.
    const link = seedLink({
      url: "https://example.com/pinned-winner",
      abConfig: serializeAbConfig({
        ...base,
        status: "archived",
        winner: "B",
        urlB: "https://example.com/short",
      }),
    });
    await bothGet(link.id, "https://example.com/pinned-winner");
    expect(counts(link.id)).toEqual([{ variant: null, c: 2 }]);
    vi.unstubAllEnvs();
  });

  it("OUT-OF-WINDOW running: both sides get link.url; clicks stay UNLABELED", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    // Whole window in the past (valid schema: end after start) -> closed.
    const link = seedLink({
      url: "https://example.com/own-window",
      abConfig: serializeAbConfig({
        ...base,
        startsAt: "2026-01-01T00:00",
        endsAt: "2026-02-01T00:00",
      }),
    });
    await bothGet(link.id, "https://example.com/own-window");
    expect(counts(link.id)).toEqual([{ variant: null, c: 2 }]);
    vi.unstubAllEnvs();
  });

  it("E.67: setAbTestStatus flip — pause kills the split for the SAME visitors, resume brings it back", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const link = seedLink({
      url: "https://example.com/own-flip",
      abConfig: serializeAbConfig(base),
    });
    const { a, b } = oppositePair(link.id);
    const tally = () =>
      Object.fromEntries(counts(link.id).map((r) => [String(r.variant), r.c]));

    // RUNNING: split serves (opposite visitors → opposite urls), labeled.
    expect((await go(link.id, a)).headers.get("location")).toBe(
      "https://example.com/own-flip",
    );
    expect((await go(link.id, b)).headers.get("location")).toBe(base.urlB);
    expect(tally()).toEqual({ A: 1, B: 1 });

    // PAUSE through the REAL action -> config flips, split stops for the
    // SAME visitors on their very next requests (both → link.url) and
    // those clicks are recorded UNLABELED (the state contract of E.61).
    const statusFd = (id: number, status: string) => {
      const f = new FormData();
      f.set("id", String(id));
      f.set("status", status);
      return f;
    };
    const paused = await setAbTestStatus(statusFd(link.id, "paused"));
    if (!paused.success) throw new Error(`pause failed: ${paused.error}`);
    expect(
      parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status,
    ).toBe("paused");

    expect((await go(link.id, a)).headers.get("location")).toBe(
      "https://example.com/own-flip",
    );
    expect((await go(link.id, b)).headers.get("location")).toBe(
      "https://example.com/own-flip",
    );
    expect(tally()).toEqual({ A: 1, B: 1, null: 2 });

    // RESUME: split returns for the SAME pair; new clicks label again.
    const resumed = await setAbTestStatus(statusFd(link.id, "running"));
    if (!resumed.success) throw new Error(`resume failed: ${resumed.error}`);
    expect(
      parseAbConfig((await getLink(link.id))?.abConfig ?? null)?.status,
    ).toBe("running");

    expect((await go(link.id, a)).headers.get("location")).toBe(
      "https://example.com/own-flip",
    );
    expect((await go(link.id, b)).headers.get("location")).toBe(base.urlB);
    expect(tally()).toEqual({ A: 2, B: 2, null: 2 });

    vi.unstubAllEnvs();
  });

  it("E.70: removeAbTest through the real action -> /go serves the bare link, history labels survive", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const link = seedLink({
      url: "https://example.com/own-plain",
      abConfig: serializeAbConfig(base),
    });
    const { a, b } = oppositePair(link.id);
    const tally = () =>
      Object.fromEntries(counts(link.id).map((r) => [String(r.variant), r.c]));

    // RUNNING: split serves, both labels recorded.
    expect((await go(link.id, a)).headers.get("location")).toBe(
      "https://example.com/own-plain",
    );
    expect((await go(link.id, b)).headers.get("location")).toBe(base.urlB);
    expect(tally()).toEqual({ A: 1, B: 1 });

    // REMOVE through the REAL action -> config NULL in the DB.
    const fd = new FormData();
    fd.set("id", String(link.id));
    const res = await removeAbTest(fd);
    if (!res.success) throw new Error(`remove failed: ${res.error}`);
    expect((await getLink(link.id))?.abConfig ?? null).toBeNull();

    // The SAME visitors next get the bare link (no split ever again) and
    // record UNLABELED; the pre-removal labels are NOT rewritten/deleted.
    expect((await go(link.id, a)).headers.get("location")).toBe(
      "https://example.com/own-plain",
    );
    expect((await go(link.id, b)).headers.get("location")).toBe(
      "https://example.com/own-plain",
    );
    expect(tally()).toEqual({ A: 1, B: 1, null: 2 });

    vi.unstubAllEnvs();
  });

  it("E.73: full action lifecycle on ONE link — exactly one row ever, analytics never touched by actions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);

    // Seed: ONE link row, no config, no analytics.
    const seeded = seedLink({ url: "https://example.com/a" });

    // Row-count helpers (the invariant under test).
    const linkRows = () =>
      db
        .select({ c: sql<number>`count(*)` })
        .from(links)
        .where(eq(links.id, seeded.id))
        .get()!.c;
    const analyticsRows = () =>
      db
        .select({ c: sql<number>`count(*)` })
        .from(analyticsClicks)
        .where(eq(analyticsClicks.linkId, seeded.id))
        .get()!.c;
    const cfg = async () =>
      parseAbConfig((await getLink(seeded.id))?.abConfig ?? null);

    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };

    expect(linkRows()).toBe(1);
    expect(await cfg()).toBeNull();
    expect(analyticsRows()).toBe(0);

    // 1) CREATE.
    const created = await setAbTest(
      fd({
        id: String(seeded.id),
        urlB: "https://example.com/b",
        labelA: "control",
        labelB: "short",
        weightA: "50",
      }),
    );
    if (!created.success) throw new Error(`setAbTest: ${created.error}`);
    expect(linkRows()).toBe(1);
    expect((await cfg())?.status).toBe("running");

    // Clicks arrive (route-equivalent recording) — actions must NEVER
    // delete or duplicate these from here on.
    await recordClick(seeded.id, "e73-a-1", null, "click", "A");
    await recordClick(seeded.id, "e73-a-2", null, "click", "A");
    await recordClick(seeded.id, "e73-b-1", null, "click", "B");
    await recordClick(seeded.id, "e73-b-2", null, "click", "B");
    await recordClick(seeded.id, "e73-b-3", null, "click", "B");
    expect(analyticsRows()).toBe(5);

    // 2) PAUSE, 3) RESUME — each step re-asserts BOTH row counts.
    const pause = await setAbTestStatus(fd({ id: String(seeded.id), status: "paused" }));
    if (!pause.success) throw new Error(`pause: ${pause.error}`);
    expect(linkRows()).toBe(1);
    expect((await cfg())?.status).toBe("paused");
    expect(analyticsRows()).toBe(5);

    const resume = await setAbTestStatus(fd({ id: String(seeded.id), status: "running" }));
    if (!resume.success) throw new Error(`resume: ${resume.error}`);
    expect(linkRows()).toBe(1);
    expect((await cfg())?.status).toBe("running");
    expect(analyticsRows()).toBe(5);

    // 4) PROMOTE B — url pinned, config archived; still ONE row, history intact.
    const promoted = await promoteAbVariant(fd({ id: String(seeded.id), winner: "B" }));
    if (!promoted.success) throw new Error(`promote: ${promoted.error}`);
    expect(linkRows()).toBe(1);
    const promotedCfg = await cfg();
    expect(promotedCfg?.status).toBe("archived");
    expect(promotedCfg?.winner).toBe("B");
    expect((await getLink(seeded.id))?.url).toBe("https://example.com/b");
    expect(analyticsRows()).toBe(5);

    // 5) REMOVE — config gone, row and history stay.
    const removed = await removeAbTest(fd({ id: String(seeded.id) }));
    if (!removed.success) throw new Error(`remove: ${removed.error}`);
    expect(linkRows()).toBe(1);
    expect(await cfg()).toBeNull();
    expect(analyticsRows()).toBe(5);

    // 6) RE-CREATE on the same link — a full cycle must not duplicate rows.
    const recreated = await setAbTest(
      fd({
        id: String(seeded.id),
        urlB: "https://example.com/b",
        labelA: "control",
        labelB: "short",
        weightA: "50",
      }),
    );
    if (!recreated.success) throw new Error(`recreate: ${recreated.error}`);
    expect(linkRows()).toBe(1);
    expect((await cfg())?.status).toBe("running");
    expect(analyticsRows()).toBe(5);

    vi.unstubAllEnvs();
  });

  it("E.76: double-submit setAbTest is byte-idempotent; double promote pins behavior", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const seeded = seedLink({ url: "https://example.com/a" });
    const raw = async () => (await getLink(seeded.id))?.abConfig ?? null;
    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };
    const payload = fd({
      id: String(seeded.id),
      urlB: "https://example.com/b",
      labelA: "control",
      labelB: "short",
      weightA: "70",
      startsAt: "2026-11-01T10:00",
      endsAt: "2026-11-08T10:00",
    });

    // 1) DOUBLE SUBMIT: the same payload twice must produce byte-identical
    // ab_config (derived weightB, preserved status/winner, window fields).
    const first = await setAbTest(payload);
    if (!first.success) throw new Error(`first: ${first.error}`);
    const raw1 = await raw();
    expect(raw1).not.toBeNull();
    const second = await setAbTest(payload);
    if (!second.success) throw new Error(`second: ${second.error}`);
    expect(await raw()).toBe(raw1); // byte-identical, zero drift

    // 2) DOUBLE PROMOTE, SAME winner: idempotent — byte-identical config,
    // url pinned once, still archived/B.
    const p1 = await promoteAbVariant(fd({ id: String(seeded.id), winner: "B" }));
    if (!p1.success) throw new Error(`p1: ${p1.error}`);
    const rawP1 = await raw();
    const p2 = await promoteAbVariant(fd({ id: String(seeded.id), winner: "B" }));
    if (!p2.success) throw new Error(`p2: ${p2.error}`);
    expect(await raw()).toBe(rawP1); // idempotent
    expect((await getLink(seeded.id))?.url).toBe("https://example.com/b");

    // 3) CROSS-WINNER second promote — ACTUAL behavior pinned: the action
    // has no archived guard, so the winner field is overwritten while the
    // url stays pinned from the FIRST promote (A wins the label, B's url
    // serves). UI hides this (archived shows no promote buttons); a
    // session-holder could still call it — logged as a finding, no
    // behavior change this late (conservative Decision authority).
    const p3 = await promoteAbVariant(fd({ id: String(seeded.id), winner: "A" }));
    if (!p3.success) throw new Error(`p3: ${p3.error}`);
    const cfg3 = parseAbConfig(await raw());
    expect(cfg3?.winner).toBe("A"); // overwritten
    expect(cfg3?.status).toBe("archived");
    expect((await getLink(seeded.id))?.url).toBe("https://example.com/b"); // NOT re-pinned

    vi.unstubAllEnvs();
  });

  it("E.80: getLinkStats.link AGREES with getLink at every lifecycle checkpoint", async () => {
    // The stats detail page and the links table must render the SAME row:
    // deep-equal the embedded link row against the raw fetch after every
    // lifecycle action, plus explicit url/status cross-checks where an
    // action has side effects.
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const seeded = seedLink({ url: "https://example.com/own-stats" });
    const checkpoint = async (label: string) => {
      const raw = await getLink(seeded.id);
      const stats = await getLinkStats(seeded.id, "7d");
      expect(stats, `${label}: stats missing`).not.toBeNull();
      expect(stats!.link, `${label}: stats link != raw link`).toEqual(raw);
    };
    const fd = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };

    await checkpoint("seed");

    const created = await setAbTest(
      fd({
        id: String(seeded.id),
        urlB: "https://example.com/b",
        labelA: "control",
        labelB: "short",
        weightA: "50",
      }),
    );
    if (!created.success) throw new Error(`create: ${created.error}`);
    await checkpoint("created");
    expect(
      parseAbConfig((await getLinkStats(seeded.id, "7d"))!.link.abConfig ?? null)
        ?.status,
    ).toBe("running");

    const paused = await setAbTestStatus(fd({ id: String(seeded.id), status: "paused" }));
    if (!paused.success) throw new Error(`pause: ${paused.error}`);
    await checkpoint("paused");

    const resumed = await setAbTestStatus(fd({ id: String(seeded.id), status: "running" }));
    if (!resumed.success) throw new Error(`resume: ${resumed.error}`);
    await checkpoint("resumed");

    const promoted = await promoteAbVariant(fd({ id: String(seeded.id), winner: "B" }));
    if (!promoted.success) throw new Error(`promote: ${promoted.error}`);
    await checkpoint("promoted");
    // Both surfaces show the SAME pinned url after the promote side effect.
    const statsAfterPromote = (await getLinkStats(seeded.id, "7d"))!.link;
    expect(statsAfterPromote.url).toBe("https://example.com/b");
    expect(statsAfterPromote.url).toBe((await getLink(seeded.id))?.url);

    const removed = await removeAbTest(fd({ id: String(seeded.id) }));
    if (!removed.success) throw new Error(`remove: ${removed.error}`);
    await checkpoint("removed");
    expect(
      (await getLinkStats(seeded.id, "7d"))!.link.abConfig ?? null,
    ).toBeNull();

    vi.unstubAllEnvs();
  });
});

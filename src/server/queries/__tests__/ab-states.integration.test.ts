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
import { analyticsClicks } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { assignVariant, serializeAbConfig, type AbConfig } from "@/lib/ab-test";
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
});

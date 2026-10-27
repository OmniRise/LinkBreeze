/**
 * #81 E.62 — analytics-integrity re-pass on the recording path.
 *
 * Can a visitor inflate ONE variant's count?
 *   1. Repeated hits from ONE visitor (same identity) must record ONE
 *      consistent label across N requests — never mix labels, never drift
 *      from the pure assignment, and the denormalized clicksCount must
 *      track the row count exactly (recordClick is transactional).
 *   2. Forged request inputs (x-variant header, ?variant query, lb_variant
 *      cookie) repeated N times must NEVER move the recorded label off the
 *      pure server-side assignment (E.37 pinned this single-shot; re-passed
 *      here across repetitions, with location and recorded label both
 *      checked against the pure prediction).
 *
 * Out of scope by logged decision (E.37): rotating UA/XFF to mint new
 * visitor identities — inherent to cookieless fingerprinting, bounded by
 * the per-IP 60/min rate limit, and correct behind a proxy that overwrites
 * XFF. No behavior change made here.
 *
 * Harness identical to ab-states (E.31 lesson: backup + auto-promote
 * triggers stubbed; visitor mocked only for determinism).
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
import { analyticsClicks, links } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { assignVariant, serializeAbConfig, type AbConfig } from "@/lib/ab-test";
import { getVisitorHash } from "@/lib/visitor";
import { isBot } from "@/lib/bot-detect";
import { GET as goGET } from "@/app/go/[id]/route";
import { NextRequest } from "next/server";

const running: AbConfig = {
  v: 1,
  status: "running",
  labelA: "control",
  labelB: "short",
  urlB: "https://example.com/b",
  weightA: 50,
  weightB: 50,
  winner: null,
};

function counts(linkId: number) {
  return db
    .select({ variant: analyticsClicks.variant, c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(eq(analyticsClicks.linkId, linkId))
    .groupBy(analyticsClicks.variant)
    .all();
}

async function hits(id: number, visitor: string, n: number, extra?: ConstructorParameters<typeof NextRequest>[1]) {
  const results = [];
  for (let i = 0; i < n; i++) {
    vi.mocked(getVisitorHash).mockReturnValueOnce(visitor);
    results.push(
      await goGET(
        new NextRequest(`http://localhost:3000/go/${id}`, extra),
        { params: Promise.resolve({ id: String(id) }) },
      ),
    );
  }
  return results;
}

describe("[integration] recording integrity under repeated hits (#81 E.62)", () => {
  it("N hits from one visitor record ONE consistent label; clicksCount tracks rows", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const link = seedLink({
      url: "https://example.com/a",
      abConfig: serializeAbConfig(running),
    });
    const expected = assignVariant("e62-visitor", link.id, 50, 50);
    const expectedUrl =
      expected === "B" ? "https://example.com/b" : "https://example.com/a";

    const N = 6;
    const res = await hits(link.id, "e62-visitor", N);

    // Every redirect identical and matching the PURE assignment...
    for (const r of res) expect(r.headers.get("location")).toBe(expectedUrl);

    // ...and every recorded row carries that ONE label (no mixing).
    expect(counts(link.id)).toEqual([{ variant: expected, c: N }]);

    // Transactional denormalization: clicksCount == recorded row count.
    const row = db
      .select({ clicksCount: links.clicksCount })
      .from(links)
      .where(eq(links.id, link.id))
      .get();
    expect(row?.clicksCount).toBe(N);

    vi.unstubAllEnvs();
  });

  it("forged variant inputs repeated N times never move the recorded label", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    const link = seedLink({
      url: "https://example.com/a",
      abConfig: serializeAbConfig(running),
    });
    const expected = assignVariant("e62-forge", link.id, 50, 50);
    const expectedUrl =
      expected === "B" ? "https://example.com/b" : "https://example.com/a";

    // Hammer with every request-input claim pointing at "A" — E.37's
    // injection surface, now repeated with location+recorded cross-checks.
    const forged = {
      headers: { "x-variant": "A", cookie: "lb_variant=A" },
    };
    const res = [];
    for (let i = 0; i < 4; i++) {
      vi.mocked(getVisitorHash).mockReturnValueOnce("e62-forge");
      res.push(
        await goGET(
          new NextRequest(`http://localhost:3000/go/${link.id}?variant=A`, forged),
          { params: Promise.resolve({ id: String(link.id) }) },
        ),
      );
    }
    for (const r of res) expect(r.headers.get("location")).toBe(expectedUrl);
    expect(counts(link.id)).toEqual([{ variant: expected, c: 4 }]);

    vi.unstubAllEnvs();
  });
});

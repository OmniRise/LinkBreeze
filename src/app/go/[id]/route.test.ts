/**
 * #96 — /go/[id] route behavior: numeric id (unchanged), slug resolution
 * (case-insensitive), unknown ref 404, and a deactivated link WITH a slug
 * 302-redirecting to its public page instead of a bare 404.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getLinkByRef: vi.fn(),
  getPageById: vi.fn(),
  recordClick: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
}));

vi.mock("@/server/queries", () => ({
  getLinkByRef: mocks.getLinkByRef,
  getPageById: mocks.getPageById,
  recordClick: mocks.recordClick,
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, remaining: 59, resetAt: Date.now() + 60000 })),
}));
vi.mock("@/lib/bot-detect", () => ({ isBot: vi.fn(() => false) }));
vi.mock("@/server/backup-scheduler", () => ({ maybeRunScheduledBackup: vi.fn() }));
vi.mock("@/server/ab-auto-promote", () => ({ maybeAutoPromoteAbTests: vi.fn() }));
vi.mock("@/lib/visitor", () => ({
  getVisitorHash: vi.fn(() => "hash"),
  stripReferrer: vi.fn((r: string) => r),
}));

import { GET } from "@/app/go/[id]/route";
import { assignVariant } from "@/lib/ab-test";
import { isBot } from "@/lib/bot-detect";
import { rateLimit } from "@/lib/rate-limit";
import { maybeAutoPromoteAbTests } from "@/server/ab-auto-promote";
import { NextRequest } from "next/server";

function makeRequest(ref: string) {
  return new NextRequest(`http://localhost:3000/go/${ref}`);
}

function activeLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    pageId: 1,
    title: "Link",
    url: "https://example.com",
    isActive: true,
    redirectSlug: null,
    ...overrides,
  };
}

describe("GET /go/[ref] (#96)", () => {
  it("resolves a numeric ref by id (behavior unchanged)", async () => {
    mocks.getLinkByRef.mockResolvedValue(activeLink({ id: 7, url: "https://example.com/x" }));
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/x");
    expect(mocks.getLinkByRef).toHaveBeenCalledWith("7");
  });

  it("resolves a slug ref and redirects to the link URL", async () => {
    mocks.getLinkByRef.mockResolvedValue(activeLink({ id: 9, url: "https://example.com/y", redirectSlug: "my-consulting" }));
    const res = await GET(makeRequest("my-consulting"), { params: Promise.resolve({ id: "my-consulting" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/y");
  });

  it("resolves slug refs case-insensitively", async () => {
    mocks.getLinkByRef.mockResolvedValue(activeLink({ id: 9, url: "https://example.com/y", redirectSlug: "my-consulting" }));
    const res = await GET(makeRequest("MY-CONSULTING"), { params: Promise.resolve({ id: "MY-CONSULTING" }) });
    expect(res.status).toBe(302);
    expect(mocks.getLinkByRef).toHaveBeenCalledWith("MY-CONSULTING");
  });

  it("404s an unknown ref", async () => {
    mocks.getLinkByRef.mockResolvedValue(null);
    const res = await GET(makeRequest("nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("a deactivated link WITHOUT a slug still 404s", async () => {
    mocks.getLinkByRef.mockResolvedValue(activeLink({ isActive: false, redirectSlug: null }));
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(404);
  });

  it("a deactivated link WITH a slug 302s to its public page", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ isActive: false, redirectSlug: "paused-slug", pageId: 3 }),
    );
    mocks.getPageById.mockResolvedValue({ id: 3, slug: "about-me" });
    const res = await GET(makeRequest("paused-slug"), { params: Promise.resolve({ id: "paused-slug" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/about-me");
    // The click must NOT be recorded — this is not a link click-through.
    expect(mocks.recordClick).not.toHaveBeenCalled();
  });

  it("E.88: BOTH redirect sites send Cache-Control: no-store (no intermediary caches a split)", async () => {
    // Split site: a CDN/proxy caching one visitor's variant redirect would
    // serve it to everyone — assignment must never be cacheable.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({
        id: 7,
        url: "https://example.com/a",
        // Running config, split site (helpers are local to other tests).
        abConfig: JSON.stringify({
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
        }),
      }),
    );
    const split = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(split.status).toBe(302);
    expect(split.headers.get("location")).not.toBeNull(); // it IS a redirect
    expect(split.headers.get("cache-control")).toBe("no-store");

    // Off-link re-redirect site: a cached redirect could keep pinning a
    // deactivated link to its old slug after it is fixed.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ id: 8, isActive: false, redirectSlug: "paused-slug", pageId: 3 }),
    );
    mocks.getPageById.mockResolvedValue({ id: 3, slug: "about-me" });
    const off = await GET(makeRequest("8"), { params: Promise.resolve({ id: "8" }) });
    expect(off.status).toBe(302);
    expect(off.headers.get("cache-control")).toBe("no-store");
  });

  it("a deactivated link whose page is gone falls back to 404", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ isActive: false, redirectSlug: "orphan-slug", pageId: 99 }),
    );
    mocks.getPageById.mockResolvedValue(null);
    const res = await GET(makeRequest("orphan-slug"), { params: Promise.resolve({ id: "orphan-slug" }) });
    expect(res.status).toBe(404);
  });
});

/**
 * #81 A/B split on the serving path. getVisitorHash is mocked to a constant
 * ("hash"), so assignment for a given link id + weights is deterministic —
 * expectations below compute the SAME bucket via the real pure helpers,
 * proving the route wires visitorHash/linkId/weights through correctly.
 * The analytics write is production-gated, so these tests assert the
 * Location header only; per-variant COUNTING is covered by the sql.js
 * integration tests.
 */
describe("GET /go/[ref] A/B split (#81)", () => {
  const abConfig = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      status: "running",
      labelA: null,
      labelB: null,
      urlB: "https://example.com/b",
      weightA: 50,
      weightB: 50,
      winner: null,
      ...overrides,
    });
  // The mocked visitor hash is a constant, so SOME weight pair always puts
  // this visitor on B — forcing B makes "splits to urlB" a real assertion
  // instead of one that passes vacuously when the bucket lands on A.
  const weightAForB = Array.from({ length: 99 }, (_, i) => i + 1).find(
    (w) => assignVariant("hash", 7, w, 100 - w) === "B",
  )!;
  const bWeights = { weightA: weightAForB, weightB: 100 - weightAForB };

  it("a running test splits traffic to the deterministic variant URL", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig(bWeights) }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(302);
    // Forced onto B: must go to urlB, NOT the link's own url.
    expect(res.headers.get("location")).toBe("https://example.com/b");
    // And the bucket the route computed matches the pure helper exactly.
    expect(assignVariant("hash", 7, weightAForB, 100 - weightAForB)).toBe("B");
  });

  it("is sticky: repeated requests keep the same variant", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig() }),
    );
    const first = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    for (let i = 0; i < 5; i++) {
      const again = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
      expect(again.headers.get("location")).toBe(first.headers.get("location"));
    }
  });

  it("E.26: a future-version (v:2) config degrades to plain serving (variant A, no split)", async () => {
    // Version forward-compat: parseAbConfig rejects v:2, so the route sees
    // no test — it must serve variant A's URL like a link with no config,
    // never half-apply a schema this build doesn't understand.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig({ v: 2 }) }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a");
  });

  it("paused and archived tests serve variant A only", async () => {
    for (const status of ["paused", "archived"]) {
      mocks.getLinkByRef.mockResolvedValue(
        activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig({ status }) }),
      );
      const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
      expect(res.headers.get("location")).toBe("https://example.com/a");
    }
  });

  it("links without a config are untouched (regression)", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url" }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a");
  });

  it("non-url link types never split even with a config present (scope guard)", async () => {
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "email", abConfig: abConfig() }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a");
  });

  it("defense-in-depth: a javascript: variant B degrades to the bare link (E.82 schema rejects it first)", async () => {
    // Since E.82 abConfigSchema itself refuses non-http(s) urlB, so
    // parseAbConfig returns null and /go serves the bare link — the
    // visitor-safe degrade documented in parseAbConfig's docblock, one
    // layer BEFORE the route's own target validation.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({
        url: "https://example.com/a",
        type: "url",
        abConfig: abConfig({ urlB: "javascript:alert(1)", ...bWeights }),
      }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a"); // no split, own url
  });

  it("defense-in-depth: a poisoned non-http(s) TARGET still 400s at the serve boundary", async () => {
    // Row-level poison OUTSIDE the config (link.url itself): the route's
    // own http(s) gate on the CHOSEN target must still fire.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "javascript:alert(1)", type: "url", abConfig: null }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(400);
  });

  it("E.2: serves A before the window opens and after it closes", async () => {
    const fmt = (d: Date) => d.toISOString().slice(0, 16);
    const futureEnd = fmt(new Date(Date.now() + 7 * 86400_000));
    const pastStart = fmt(new Date(Date.now() - 7 * 86400_000));
    const pastEnd = fmt(new Date(Date.now() - 86400_000));
    const futureStart = fmt(new Date(Date.now() + 86400_000));

    // Start in the future -> not yet splitting.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig({ startsAt: futureStart }) }),
    );
    let res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a");

    // End in the past -> window over, back to A.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfig({ endsAt: pastEnd }) }),
    );
    res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/a");

    // Elapsed window (start past, end future) -> splitting again; weights
    // force the bucket onto B so the assertion can't pass vacuously.
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({
        url: "https://example.com/a",
        type: "url",
        abConfig: abConfig({ startsAt: pastStart, endsAt: futureEnd, ...bWeights }),
      }),
    );
    res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/b");
  });
});

describe("bot/crawler interaction (#41 x #81, E.31)", () => {
  // Recording only happens when NODE_ENV=production — never stubbed anywhere
  // in this suite before, so no existing test observed recordClick firing at
  // all (the one not-called assertion at the redirectSlug case passed
  // trivially). Stub it here to exercise the real analytics gate.
  const wForB = Array.from({ length: 99 }, (_, i) => i + 1).find(
    (w) => assignVariant("hash", 7, w, 100 - w) === "B",
  )!;
  const abConfigJson = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      status: "running",
      labelA: null,
      labelB: null,
      urlB: "https://example.com/b",
      weightA: 50,
      weightB: 50,
      winner: null,
      ...overrides,
    });
  const forcedBLink = () =>
    activeLink({
      url: "https://example.com/a",
      type: "url",
      abConfig: abConfigJson({ weightA: wForB, weightB: 100 - wForB }),
    });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(isBot).mockReturnValue(false);
  });

  it("a human click in production is recorded and attributed to its variant", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    mocks.getLinkByRef.mockResolvedValue(forcedBLink());
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.headers.get("location")).toBe("https://example.com/b");
    expect(mocks.recordClick).toHaveBeenCalledTimes(1);
    expect(mocks.recordClick).toHaveBeenCalledWith(7, "hash", "", "click", "B");
  });

  it("a crawler still gets a fair split but its click is never recorded (guide FAQ claim)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(true);
    mocks.getLinkByRef.mockResolvedValue(forcedBLink());
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    // Assignment is computed for EVERY visitor (fair split, logged
    // orchestrator decision) — only the analytics WRITE is gated.
    expect(res.headers.get("location")).toBe("https://example.com/b");
    expect(mocks.recordClick).not.toHaveBeenCalled();
  });

  it("E.92: a rate-limited request records nothing but still serves the split, uncached", async () => {
    // The IP throttle bounds the RECORDED events (60/min/IP) — it must
    // never break the redirect itself (the redirect IS the product), and
    // the denied response must carry nothing cacheable. With production
    // env + human UA, recordClick WOULD fire — the denial is what blocks it.
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    vi.mocked(rateLimit).mockReturnValueOnce({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    mocks.getLinkByRef.mockResolvedValue(forcedBLink());

    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(302); // serving continues for the visitor
    expect(res.headers.get("location")).toBe("https://example.com/b"); // fair split
    expect(res.headers.get("cache-control")).toBe("no-store"); // nothing cacheable
    expect(mocks.recordClick).not.toHaveBeenCalled(); // throttled write
    expect(maybeAutoPromoteAbTests).not.toHaveBeenCalled(); // triggers ride with recording
    expect(rateLimit).toHaveBeenCalledWith("go:0.0.0.0", 60, 60_000); // the 60/min/IP bound
  });

  it("E.34: assignment ignores cookies entirely (nothing to clear or tamper with)", async () => {
    // Guide claim: "there is nothing to clear, tamper with, or block; the
    // split works with JavaScript disabled" — visitor identity is IP+UA
    // only (getVisitorHash never sees a cookie jar). A forged cookie jar
    // (fake lb_session + fake variant claims) must not steer the bucket:
    // same visitor, cookie vs no cookie -> same destination, and the
    // destination equals the pure helper's decision for that hash.
    vi.mocked(isBot).mockReturnValue(false);
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({ url: "https://example.com/a", type: "url", abConfig: abConfigJson() }),
    );

    const plain = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    const plainLoc = plain.headers.get("location");

    const forged = new NextRequest("http://localhost:3000/go/7", {
      headers: { cookie: "lb_session=forged-admin; lb_variant=B; ab_variant=B" },
    });
    const res2 = await GET(forged, { params: Promise.resolve({ id: "7" }) });
    expect(res2.headers.get("location")).toBe(plainLoc);

    // The observed split is exactly the pure assignment for this visitor.
    expect(plainLoc).toBe(
      assignVariant("hash", 7, 50, 50) === "B"
        ? "https://example.com/b"
        : "https://example.com/a",
    );
  });

  it("E.37: no request input can reach recordClick's variant (forged ?variant/x-variant claims ignored)", async () => {
    // Security re-pass: the route reads ONLY headers + params.id — no
    // searchParams, no body, no request field feeds `variant`. The label
    // must be the pure server-side assignment result even when the visitor
    // forges every plausible channel (query param, custom header, cookie).
    // Forced-B weights make the expected outcome deterministic: B wins
    // regardless of the forged claims.
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);
    mocks.getLinkByRef.mockResolvedValue(forcedBLink());

    const forged = new NextRequest(
      "http://localhost:3000/go/7?variant=A&ab_variant=A",
      { headers: { "x-variant": "A", cookie: "lb_variant=A" } },
    );
    const res = await GET(forged, { params: Promise.resolve({ id: "7" }) });

    expect(res.headers.get("location")).toBe("https://example.com/b");
    expect(mocks.recordClick).toHaveBeenCalledTimes(1);
    // Server assignment, not any forged claim, reaches the analytics write.
    expect(mocks.recordClick).toHaveBeenCalledWith(7, "hash", "", "click", "B");
  });

  it("E.41: interleaved /go requests keep each link's label in its own request (no cross-link leak)", async () => {
    // variant is per-request local state passed positionally to recordClick;
    // this pins that contract against a future regression that hoists it to
    // module scope or memoizes an assignment across requests. Two links are
    // forced to OPPOSITE outcomes and fired concurrently; every recorded
    // tuple must match ITS OWN link's pure assignment, never the other's.
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(isBot).mockReturnValue(false);

    // Deterministic at runtime: pick the first sequential id whose default
    // 50/50 outcome OPPOSES link 7's forced-B outcome, so the two links are
    // guaranteed to carry different labels in this run.
    const exp7 = assignVariant("hash", 7, 50, 50); // any bucket; forced-B overrides below
    const otherId = Array.from({ length: 8 }, (_, i) => i + 8).find(
      (id) => assignVariant("hash", id, 50, 50) !== exp7,
    );
    expect(otherId).toBeDefined();
    const expOther = assignVariant("hash", otherId!, 50, 50); // pure outcome, 50/50 weights

    const link7 = forcedBLink(); // id 7 -> forced "B" (proven by wForB)
    const linkOther = activeLink({
      id: otherId,
      url: "https://example.com/other",
      type: "url",
      abConfig: abConfigJson(), // default 50/50
    });
    mocks.getLinkByRef.mockImplementation((ref: unknown) =>
      Promise.resolve(String(ref) === String(otherId) ? linkOther : link7),
    );

    const results = await Promise.all([
      GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) }),
      GET(makeRequest(String(otherId)), { params: Promise.resolve({ id: String(otherId) }) }),
      GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) }),
      GET(makeRequest(String(otherId)), { params: Promise.resolve({ id: String(otherId) }) }),
    ]);
    // Variant A resolves to EACH LINK'S OWN url (link7: /a, other: /other);
    // variant B is the shared urlB.
    const locOther = expOther === "B" ? "https://example.com/b" : "https://example.com/other";
    expect(results.map((r) => r.headers.get("location"))).toEqual([
      "https://example.com/b",
      locOther,
      "https://example.com/b",
      locOther,
    ]);

    // Order-independent tuple check: 2x (7,B) + 2x (other, expOther), and
    // critically NEVER (7, anything-but-B) or (other, the opposite label).
    const tuples = mocks.recordClick.mock.calls.map((c) => {
      const a = c as unknown[];
      return [a[0], a[4]] as [unknown, unknown];
    });
    expect(tuples).toHaveLength(4);
    expect(tuples.filter(([id]) => id === 7)).toEqual([[7, "B"], [7, "B"]]);
    expect(tuples.filter(([id]) => id === otherId)).toEqual([
      [otherId, expOther],
      [otherId, expOther],
    ]);
  });

  it("E.56: /go emits no document head and no config strings for ANY variant or crawler", () => {
    // Route Handlers never render a document: crawler-facing metadata for
    // an A/B link lives ONLY in the public page's generateMetadata (which
    // reads page fields alone — verified by audit) — /go must stay a pure
    // redirect whose only config-derived output is the destination itself.
    // Pin: non-HTML content-type, empty body, admin labels never present in
    // ANY header, for variant A, variant B, and a crawler.
    const withLabels = abConfigJson({
      labelA: "CONTROL-ZONE-LEAK",
      labelB: "SHORT-ZONE-LEAK",
    });
    const wForA = Array.from({ length: 99 }, (_, i) => i + 1).find(
      (w) => assignVariant("hash", 7, w, 100 - w) === "A",
    )!;
    const mkLink = (w: number) =>
      activeLink({
        url: "https://example.com/a",
        type: "url",
        abConfig: JSON.stringify({
          ...JSON.parse(withLabels),
          weightA: w,
          weightB: 100 - w,
        }),
      });

    const check = async (res: Response) => {
      expect(res.headers.get("content-type") ?? "").not.toContain("text/html");
      expect(await res.text()).toBe(""); // redirects carry no document
      const allHeaders = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
      expect(allHeaders).not.toContain("CONTROL-ZONE-LEAK");
      expect(allHeaders).not.toContain("SHORT-ZONE-LEAK");
    };

    return (async () => {
      vi.stubEnv("NODE_ENV", "production");

      vi.mocked(isBot).mockReturnValue(false);
      mocks.getLinkByRef.mockResolvedValue(mkLink(wForA));
      await check(await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) }));

      vi.mocked(isBot).mockReturnValue(false);
      mocks.getLinkByRef.mockResolvedValue(mkLink(wForB));
      await check(await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) }));

      vi.mocked(isBot).mockReturnValue(true);
      mocks.getLinkByRef.mockResolvedValue(mkLink(wForB));
      await check(await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) }));
    })();
  });
});

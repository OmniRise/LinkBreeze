/**
 * #96 — /go/[id] route behavior: numeric id (unchanged), slug resolution
 * (case-insensitive), unknown ref 404, and a deactivated link WITH a slug
 * 302-redirecting to its public page instead of a bare 404.
 */
import { describe, it, expect, vi } from "vitest";

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
vi.mock("@/lib/visitor", () => ({
  getVisitorHash: vi.fn(() => "hash"),
  stripReferrer: vi.fn((r: string) => r),
}));

import { GET } from "@/app/go/[id]/route";
import { assignVariant } from "@/lib/ab-test";
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

  it("defense-in-depth: a javascript: variant B 400s the CHOSEN target", async () => {
    // bWeights forces the deterministic bucket onto B (see above).
    mocks.getLinkByRef.mockResolvedValue(
      activeLink({
        url: "https://example.com/a",
        type: "url",
        abConfig: abConfig({ urlB: "javascript:alert(1)", ...bWeights }),
      }),
    );
    const res = await GET(makeRequest("7"), { params: Promise.resolve({ id: "7" }) });
    // B is chosen here; the chosen target is non-http(s) -> rejected.
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

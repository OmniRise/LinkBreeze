/**
 * #81 / E.3 — CSV export route tests (the touched export surface).
 *
 * Mocks @/db with a chainable select (from/leftJoin/where -> rows) so the
 * route's query shape is exercised without a real DB. Covers: auth gate,
 * the clicks header gaining the #81 `variant` column, null variants
 * exporting as empty cells, and csvCell escaping/injection guard on the
 * attacker-controlled referrer field.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async (): Promise<unknown> => ({ userId: 1 })),
  rows: [] as unknown[],
  select: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mocks.select(...args);
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => Promise.resolve(mocks.rows),
      };
      return chain;
    },
  },
}));
// Schema + operators are just identifiers for the mocked chain; keep the
// REAL csv/analytics-range logic (that's what these tests assert on).
vi.mock("@/db/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/schema")>();
  return {
    analyticsPageviews: actual.analyticsPageviews,
    analyticsClicks: actual.analyticsClicks,
    links: actual.links,
  };
});

import { GET } from "@/app/api/analytics/export/route";
import { NextRequest } from "next/server";

function req(query: string) {
  return new NextRequest(`http://localhost:3000/api/analytics/export${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ userId: 1 });
  mocks.rows = [];
});

describe("GET /api/analytics/export", () => {
  it("401s without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET(req("?metric=clicks"));
    expect(res.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("clicks CSV carries the #81 variant column (null -> empty cell)", async () => {
    mocks.rows = [
      {
        createdAt: "2026-06-01 10:00:00",
        visitorHash: "h1",
        referrer: null,
        title: "My link",
        url: "https://example.com",
        variant: "B",
      },
      {
        createdAt: "2026-06-01 11:00:00",
        visitorHash: "h2",
        referrer: "https://news.ycombinator.com",
        title: "Other",
        url: "https://example.org",
        variant: null, // no test active -> empty cell, not "null"
      },
    ];
    const res = await GET(req("?metric=clicks&range=30d"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain(
      "linkbreeze-clicks-30d.csv",
    );
    const body = await res.text();
    const lines = body.split("\n");
    expect(lines[0]).toBe(
      "timestamp,visitor_hash,referrer,link_title,link_url,variant",
    );
    expect(lines[1]).toContain(",B");
    expect(lines[2].endsWith(",")).toBe(true); // null variant -> empty cell
    expect(lines[2]).not.toContain("null");
  });

  it("escapes and defuses attacker-controlled referrers (csvCell)", async () => {
    mocks.rows = [
      {
        createdAt: "2026-06-01 10:00:00",
        visitorHash: "h1",
        referrer: '=cmd|"/c calc"!A1', // formula injection
        title: 'Link, with "quotes"',
        url: "https://example.com",
        variant: null,
      },
    ];
    const res = await GET(req("?metric=clicks"));
    const body = await res.text();
    // csvCell prefixes formula-leading cells with a quote and RFC4180-quotes.
    expect(body).toContain("'=");
    expect(body).toContain('"Link, with ""quotes"""');
  });

  it("views CSV keeps its header (no variant column for pageviews)", async () => {
    mocks.rows = [];
    const res = await GET(req("?metric=views"));
    const body = await res.text();
    expect(body.split("\n")[0]).toBe(
      "timestamp,visitor_hash,referrer,country,device",
    );
  });
});

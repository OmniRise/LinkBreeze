/**
 * Integration: #81 E.95 — analytics export CSV variant-column fidelity.
 *
 * The unit tests in route.test.ts MOCK the query chain (formatting only);
 * this drives the REAL GET handler against the sql.js harness so the
 * actual SELECT → row → csvCell mapping is what gets asserted: every
 * CSV row's variant cell must equal the raw analytics_clicks.variant
 * of the same click — label spelling ("A"/"B"), null → "" mapping,
 * and row count included. The route has no ORDER BY (rowid order), so
 * the CSV rows and a mirrored raw select come back in the SAME order
 * and can be compared directly, row for row.
 */
import { describe, it, expect, vi } from "vitest";
import "./integration-setup";
import { db, seedLink } from "./integration-setup";
import { recordClick } from "@/server/queries";
import { analyticsClicks } from "@/db/schema";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ userId: 1 })),
}));

import { GET } from "@/app/api/analytics/export/route";
import { NextRequest } from "next/server";

describe("export CSV variant fidelity (#81 E.95)", () => {
  it("every CSV variant cell equals the raw analytics_clicks.variant (labeled + unlabeled)", async () => {
    await db.delete(analyticsClicks);
    const link = seedLink({ title: "Export fidelity", url: "https://example.com/x" });

    // Deterministic mix across the six columns the route emits; referrer
    // kept null and fields comma-free so a plain split(",") is exact.
    const seeds: Array<{ h: string; v: "A" | "B" | null }> = [
      { h: "e95-a1", v: "A" },
      { h: "e95-b1", v: "B" },
      { h: "e95-u1", v: null },
      { h: "e95-a2", v: "A" },
      { h: "e95-b2", v: "B" },
      { h: "e95-u2", v: null },
    ];
    for (const s of seeds) {
      await recordClick(link.id, s.h, null, "click", s.v);
    }

    const res = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=clicks&range=30d"),
    );
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\n").filter(Boolean);
    expect(lines[0]).toBe(
      "timestamp,visitor_hash,referrer,link_title,link_url,variant",
    );

    // Raw truth: the same rows the route's SELECT returned, straight
    // from analytics_clicks (no join, no formatting).
    const raw = await db
      .select({ h: analyticsClicks.visitorHash, v: analyticsClicks.variant })
      .from(analyticsClicks);
    expect(raw.length).toBe(seeds.length); // every click exported exactly once

    const csvRows = lines.slice(1).map((line) => {
      const cols = line.split(",");
      expect(cols.length).toBe(6); // constant column count (E.50 invariant)
      return { h: cols[1], v: cols[5] };
    });

    // Row-for-row: CSV (visitor, variant) must equal raw (visitor, variant)
    // in the SAME order — spelling, null→"" mapping, nothing dropped.
    for (let i = 0; i < raw.length; i++) {
      expect(csvRows[i].h, `row ${i} visitor`).toBe(raw[i].h);
      expect(csvRows[i].v, `row ${i} variant`).toBe(raw[i].v ?? "");
    }

    // Non-vacuity on both sides of the mapping.
    expect(csvRows.filter((r) => r.v === "A").length).toBe(2);
    expect(csvRows.filter((r) => r.v === "B").length).toBe(2);
    expect(csvRows.filter((r) => r.v === "").length).toBe(2); // null -> ""
  });
});

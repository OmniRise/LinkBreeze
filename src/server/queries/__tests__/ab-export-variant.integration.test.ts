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
import { recordClick, getLinkStats, recordPageview } from "@/server/queries";
import { analyticsClicks, analyticsPageviews } from "@/db/schema";
import { inArray, like, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("E.103: stats range-breakdown and the SAME-range CSV export tell one story", async () => {
    // Both surfaces build their window from the SAME sinceExpr(range) with
    // the SAME strict gt() operator — so one range token means one window.
    // Grounded difference pinned here too: getLinkStats filters
    // eventType='click' while the export is RAW analytics rows (docblock),
    // and /api/track writes 'open' rows that carry NO variant label — so
    // variant counts must agree exactly, while the raw CSV shows the
    // unlabeled open row the clicks-scoped stats deliberately omits.
    await db.delete(analyticsClicks);
    const title = "E103-window-story";
    const link = seedLink({ title, url: "https://example.com/e103" });

    // In-window (fresh): 2 A, 1 B, 1 unlabeled click, 1 'open' event.
    const fresh = [
      { h: "e103-i-a1", v: "A" as const },
      { h: "e103-i-a2", v: "A" as const },
      { h: "e103-i-b1", v: "B" as const },
      { h: "e103-i-u", v: null },
    ];
    for (const s of fresh) await recordClick(link.id, s.h, null, "click", s.v);
    await recordClick(link.id, "e103-open", null, "open"); // unlabeled, raw-only

    // Out-of-window: 5 A + 1 B backdated 60 days (past the 30d range).
    const out = [
      { h: "e103-o-a1", v: "A" as const },
      { h: "e103-o-a2", v: "A" as const },
      { h: "e103-o-a3", v: "A" as const },
      { h: "e103-o-a4", v: "A" as const },
      { h: "e103-o-a5", v: "A" as const },
      { h: "e103-o-b1", v: "B" as const },
    ];
    for (const s of out) await recordClick(link.id, s.h, null, "click", s.v);
    const outIds = db
      .select({ id: analyticsClicks.id })
      .from(analyticsClicks)
      .where(like(analyticsClicks.visitorHash, "e103-o-%"))
      .all()
      .map((r) => r.id);
    const stamp60 = new Date(Date.now() - 60 * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    db.update(analyticsClicks)
      .set({ createdAt: stamp60 })
      .where(inArray(analyticsClicks.id, outIds))
      .run();

    // Surface 1: the stats page's range-scoped breakdown.
    const stats = (await getLinkStats(link.id, "30d"))!;
    expect(stats.variants).toEqual({ a: 2, b: 1 });
    expect(stats.totalClicks).toBe(4); // clicks only: open excluded

    // Surface 2: the REAL export over the SAME range token.
    const res = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=clicks&range=30d"),
    );
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\n").slice(1).filter(Boolean);
    const mine = lines.filter((l) => l.split(",")[3] === title);
    const cells = mine.map((l) => l.split(",")[5]);

    // ONE story on the variant breakdown — equal across surfaces...
    expect(cells.filter((v) => v === "A").length).toBe(stats.variants.a);
    expect(cells.filter((v) => v === "B").length).toBe(stats.variants.b);
    // ...and the out-of-window rows are excluded from BOTH (6 old rows gone).
    expect(cells.filter((v) => v === "A" || v === "B").length).toBe(3);

    // ...while the RAW export legitimately shows the unlabeled 'open' row
    // the clicks-scoped stats omits (raw-rows vs clicks by design).
    expect(cells.filter((v) => v === "").length).toBe(2); // unlabeled click + open
    expect(mine.length).toBe(stats.totalClicks + 1); // exactly the one open
  });

  it("E.106: stored createdAt TEXT matches sinceExpr's format (lexicographic windows hold)", async () => {
    // BOTH sides of every window comparison are SQLite TEXT: rows default
    // to datetime('now') (schema.ts:297) and sinceExpr emits
    // datetime('now','-N days') — the same 'YYYY-MM-DD HH:MM:SS' UTC shape,
    // so gt() TEXT comparison orders correctly. A writer storing ISO-with-T
    // or a JS Date string would silently mis-order — pinned here.
    const SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    await db.delete(analyticsClicks);
    const link = seedLink({ title: "E106-format" });
    await recordClick(link.id, "e106-fresh", null, "click");
    const stored = db
      .select({ createdAt: analyticsClicks.createdAt })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.visitorHash, "e106-fresh"))
      .get()!.createdAt;
    expect(String(stored)).toMatch(SHAPE); // datetime('now') shape, no T

    // The boundary every 30d query compares against, in the SAME shape
    // (UTC, second precision — identical to datetime('now','-30 days')).
    const boundary = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    expect(boundary).toMatch(SHAPE); // shape identity with the stored value
    expect(String(stored) > boundary).toBe(true); // fresh row inside window
    const stamp60 = new Date(Date.now() - 60 * 86_400_000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    expect(stamp60 < boundary).toBe(true); // backdated row outside window

    // ...and sinceExpr's SOURCE really is the SQLite expression of the
    // same shape (not a JS date rendered into the query).
    const rangeSrc = readFileSync(resolve(process.cwd(), "src/lib/analytics-range.ts"), "utf8");
    expect(rangeSrc).toContain("datetime('now'");
    expect(rangeSrc).not.toContain("toISOString");
  });

  it("E.109: views CSV maps raw analytics_pageviews rows correctly (incl. nulls)", async () => {
    // The mirror of E.95's clicks-side pin: the views branch was only ever
    // exercised with mocked rows (header + formatting). Drive the REAL
    // route over pageviews seeded through the real recordPageview — with
    // null country/device AND filled values — and compare row-for-row with
    // the raw table (no ORDER BY → rowid order on both sides).
    await db.delete(analyticsPageviews);
    const seeds: Array<{ h: string; r: string | null; d: string | null; c: string | null }> = [
      { h: "e109-a", r: null, d: null, c: null },
      { h: "e109-b", r: "https://news.example.com", d: "desktop", c: "MA" },
      { h: "e109-c", r: "https://blog.example.org/post", d: "mobile", c: null },
    ];
    for (const s of seeds) await recordPageview(s.h, s.r, s.d, s.c);

    const res = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=views&range=30d"),
    );
    expect(res.status).toBe(200);
    const lines = (await res.text()).split("\n").filter(Boolean);
    expect(lines[0]).toBe("timestamp,visitor_hash,referrer,country,device");

    const raw = await db
      .select({
        h: analyticsPageviews.visitorHash,
        c: analyticsPageviews.country,
        d: analyticsPageviews.deviceType,
      })
      .from(analyticsPageviews);
    expect(raw.length).toBe(seeds.length); // every pageview exported once

    const rows = lines.slice(1).map((l) => {
      const cols = l.split(",");
      expect(cols.length).toBe(5); // constant column count (comma-free seeds)
      return { h: cols[1], c: cols[3], d: cols[4] };
    });
    for (let i = 0; i < raw.length; i++) {
      expect(rows[i].h, `row ${i} visitor`).toBe(raw[i].h);
      expect(rows[i].c, `row ${i} country`).toBe(raw[i].c ?? ""); // null -> empty
      expect(rows[i].d, `row ${i} device`).toBe(raw[i].d ?? "");
    }
    // Non-vacuity on both null and filled cells.
    expect(rows[0].c).toBe("");
    expect(rows[0].d).toBe("");
    expect(rows[1].c).toBe("MA");
    expect(rows[1].d).toBe("desktop");
  });

  it("E.110: all 6 metric×range combos 200 with exact filenames; unknown inputs fall back per parseRange", async () => {
    // parseRange: only VALID tokens pass through, everything else → "7d";
    // the route: metric === "clicks" ? "clicks" : "views" (any other token
    // → views). The filename echoes the PARSED values, so fallbacks are
    // observable from the Content-Disposition alone.
    for (const metric of ["clicks", "views"]) {
      for (const range of ["7d", "30d", "90d"]) {
        const res = await GET(
          new NextRequest(`http://localhost:3000/api/analytics/export?metric=${metric}&range=${range}`),
        );
        expect(res.status, `${metric}/${range}`).toBe(200);
        expect(res.headers.get("Content-Disposition"), `${metric}/${range}`).toContain(
          `linkbreeze-${metric}-${range}.csv`,
        );
        expect(res.headers.get("Cache-Control"), `${metric}/${range}`).toBe("no-store");
      }
    }

    // Unknown range token → 7d (parseRange fallback), visible in the filename.
    const badRange = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=clicks&range=999d"),
    );
    expect(badRange.status).toBe(200);
    expect(badRange.headers.get("Content-Disposition")).toContain("linkbreeze-clicks-7d.csv");

    // Missing range param → also 7d.
    const noRange = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=clicks"),
    );
    expect(noRange.headers.get("Content-Disposition")).toContain("linkbreeze-clicks-7d.csv");

    // Unknown metric token → views (the route's ternary), pinned as actual behavior.
    const bogusMetric = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=bogus&range=7d"),
    );
    expect(bogusMetric.headers.get("Content-Disposition")).toContain("linkbreeze-views-7d.csv");
  });

  it("E.118: attacker-controlled cells are neutralized in the REAL export (formula injection)", async () => {
    // The mocked escaping test covers csvCell itself; this pins the REAL
    // route end to end: an admin-set title and visitor-controlled referrers
    // starting with = + - @ must reach the CSV apostrophe-guarded (spreadsheets
    // treat the cell as text), on BOTH metrics.
    await db.delete(analyticsClicks);
    await db.delete(analyticsPageviews);
    const link = seedLink({ title: "=EVIL_TITLE", url: "https://example.com/x" });
    await recordClick(link.id, "e118-a", "=clickFormula", "click", "A");
    await recordPageview("e118-p", "=viewFormula", "desktop", "MA");

    const cRes = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=clicks&range=30d"),
    );
    const cLines = (await cRes.text()).split("\n").slice(1).filter(Boolean);
    expect(cLines.length).toBe(1);
    const cCols = cLines[0].split(",");
    expect(cCols[2], "referrer guarded").toBe("'=clickFormula");
    expect(cCols[3], "title guarded").toBe("'=EVIL_TITLE");

    const vRes = await GET(
      new NextRequest("http://localhost:3000/api/analytics/export?metric=views&range=30d"),
    );
    const vLines = (await vRes.text()).split("\n").slice(1).filter(Boolean);
    expect(vLines.length).toBe(1);
    expect(vLines[0].split(",")[2], "pageview referrer guarded").toBe("'=viewFormula");

    // Universal claim over both files: NO emitted cell starts with a raw
    // formula character (all seeds are comma/quote-free, so split is exact).
    for (const line of [...cLines, ...vLines]) {
      for (const cell of line.split(",")) {
        expect(/^[=+\-@\t\r]/.test(cell), `raw formula start: ${cell}`).toBe(false);
      }
    }
  });
});

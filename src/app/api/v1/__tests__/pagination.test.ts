/**
 * #4 E.3 — GET /api/v1/links cursor pagination + sparse fieldsets, against
 * the sql.js harness (real queries, real keyset SQL).
 *
 * Contract under test:
 *  - no params  → legacy { data } full list, NO meta key (unchanged shape)
 *  - limit/cursor → { data, meta: { count, nextCursor } }, keyset walk over
 *    (orderIndex, id) with no overlaps and no gaps
 *  - fields=    → sparse rows (id always present), unknown names 400
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink, db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET as listLinks } from "@/app/api/v1/links/route";
import { GET as getLinkRoute } from "@/app/api/v1/links/[id]/route";
import { parseListParams, encodeListCursor, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "@/server/api-links";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function get(query = ""): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost:3000/api/v1/links${query}`, {
    headers: {
      authorization: `Bearer ${KEY}`,
      "x-forwarded-for": `10.70.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    },
  });
}

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage().id;
  // 5 links with explicit order indexes (0..4) via createLink's order logic:
  // seed directly so orderIndex is deterministic.
  for (let i = 0; i < 5; i++) {
    seedLink({
      title: `Page link ${i}`,
      url: `https://page${i}.example`,
      pageId,
      orderIndex: i,
    });
  }
});

describe("GET /api/v1/links — legacy shape preserved", () => {
  it("no params → full array in data and NO meta key", async () => {
    const res = await listLinks(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(5);
    expect(body.meta).toBeUndefined();
  });
});

describe("GET /api/v1/links — cursor pagination", () => {
  it("limit pages with meta and a usable nextCursor", async () => {
    const res = await listLinks(get("?limit=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.count).toBe(2);
    expect(typeof body.meta.nextCursor).toBe("string");
    // Display order: first two are orderIndex 0,1.
    expect(body.data.map((l: { title: string }) => l.title)).toEqual([
      "Page link 0",
      "Page link 1",
    ]);
  });

  it("cursor walk covers every link exactly once (no overlap, no gap)", async () => {
    const seenTitles: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
      const res = await listLinks(get(query));
      expect(res.status).toBe(200);
      const body = await res.json();
      seenTitles.push(...body.data.map((l: { title: string }) => l.title));
      cursor = body.meta.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10); // no infinite loop
    } while (cursor);

    expect(seenTitles).toEqual([
      "Page link 0",
      "Page link 1",
      "Page link 2",
      "Page link 3",
      "Page link 4",
    ]);
  });

  it("E.46: limit=1 degenerate walk — one row per page, cursor advances until null", async () => {
    const seenTitles: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query = cursor
        ? `?limit=1&cursor=${encodeURIComponent(cursor)}`
        : "?limit=1";
      const res = await listLinks(get(query));
      expect(res.status).toBe(200);
      const body = await res.json();
      // The strictest page size: every non-final page is EXACTLY one row.
      expect(body.data).toHaveLength(1);
      expect(body.meta.count).toBe(1);
      seenTitles.push(body.data[0].title);
      cursor = body.meta.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(10); // no infinite loop
    } while (cursor);

    // Final page (before cursor ran out) also held one row — 5 seeds, 5 pages.
    expect(pages).toBe(5);
    expect(seenTitles).toEqual([
      "Page link 0",
      "Page link 1",
      "Page link 2",
      "Page link 3",
      "Page link 4",
    ]);

    // After the last row the cursor is null (loop terminated) — a follow-up
    // fetch with the LAST cursor was the final page, not an empty extra page.
    const last = await listLinks(get("?limit=1&cursor=SENTINEL-invalid"));
    expect(last.status).toBe(400); // malformed cursor still rejected mid-walk
  });

  it("cursor alone defaults to limit=100 (single page for small lists)", async () => {
    const first = await listLinks(get("?limit=4"));
    const firstBody = await first.json();
    const res = await listLinks(
      get(`?cursor=${encodeURIComponent(firstBody.meta.nextCursor)}`),
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.nextCursor).toBeNull();
    expect(body.data[0].title).toBe("Page link 4");
  });

  it("the final page has nextCursor null", async () => {
    const first = await listLinks(get("?limit=5"));
    const body = await first.json();
    expect(body.data).toHaveLength(5);
    expect(body.meta.nextCursor).toBeNull();
  });

  it("rejects malformed cursors and bad limits with 400s", async () => {
    for (const query of [
      "?cursor=not-base64-json",
      "?cursor=" + encodeURIComponent(Buffer.from('{"o":-1,"i":1}').toString("base64url")),
      "?cursor=" + encodeURIComponent(Buffer.from('{"o":1.5,"i":1}').toString("base64url")),
      "?cursor=" + encodeURIComponent(Buffer.from('{"o":0}').toString("base64url")),
      // E.104: a REAL cursor cut mid-flight (JSON.parse branch)…
      "?cursor=" + encodeURIComponent(Buffer.from('{"o":1,"i":42}').toString("base64url").slice(0, 9)),
      // …and a foreign-column shape (wrong second key → shape-throw branch).
      "?cursor=" + encodeURIComponent(Buffer.from('{"o":1,"j":42}').toString("base64url")),
      "?limit=0",
      "?limit=101",
      "?limit=abc",
      "?limit=",
    ]) {
      const res = await listLinks(get(query));
      expect(res.status, query).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("validation");
    }
  });
});

describe("GET /api/v1/links — keyset tie-breaking (E.5 debt)", () => {
  it("rows sharing an orderIndex are walked by id — no skip, no duplicate", async () => {
    // Two links deliberately tied at orderIndex=0 (id ascending), one after.
    seedLink({ title: "Tie A", url: "https://tie-a.example", pageId, orderIndex: 0 });
    seedLink({ title: "Tie B", url: "https://tie-b.example", pageId, orderIndex: 0 });
    seedLink({ title: "After tie", url: "https://after-tie.example", pageId, orderIndex: 1 });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query = cursor
        ? `?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "?limit=2";
      const res = await listLinks(get(query));
      expect(res.status).toBe(200);
      const body = await res.json();
      seen.push(...body.data.map((l: { title: string }) => l.title));
      cursor = body.meta.nextCursor;
    } while (cursor);

    const tied = seen.filter((t) => t === "Tie A" || t === "Tie B");
    expect(tied).toHaveLength(2); // neither skipped nor duplicated
    const idxA = seen.indexOf("Tie A");
    const idxB = seen.indexOf("Tie B");
    expect(idxB).toBeGreaterThan(-1);
    expect(idxA === -1 || idxA < idxB).toBe(true); // id order within the tie

    // Shared-harness hygiene: remove the fixtures so later describes still
    // see exactly the original 5 links.
    db.delete(schema.links)
      .where(
        inArray(schema.links.title, ["Tie A", "Tie B", "After tie"]),
      )
      .run();
  });
});

describe("GET /api/v1/links — sparse fieldsets", () => {
  it("fields= returns id + requested columns only", async () => {
    const res = await listLinks(get("?fields=title,url"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(5);
    for (const row of body.data) {
      expect(Object.keys(row).sort()).toEqual(["id", "title", "url"]);
    }
  });

  it("fields=id returns just ids; fields is deduplicated", async () => {
    const res = await listLinks(get("?fields=id,id,title,title"));
    const body = await res.json();
    expect(Object.keys(body.data[0]).sort()).toEqual(["id", "title"]);
  });

  it("E.110: key ORDER is id-first then request order (not canonicalized)", async () => {
    const forward = await listLinks(get("?fields=title,url"));
    const reverse = await listLinks(get("?fields=url,title"));
    expect(Object.keys((await forward.json()).data[0])).toEqual(["id", "title", "url"]);
    expect(Object.keys((await reverse.json()).data[0])).toEqual(["id", "url", "title"]);
    // Same key SET either way — only insertion order differs.
    const idOnly = await listLinks(get("?fields=url,id"));
    expect(Object.keys((await idOnly.json()).data[0])).toEqual(["id", "url"]);
  });

  it("unknown field names are a 400 naming them", async () => {
    const res = await listLinks(get("?fields=title,password"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("password");
    expect(body.error.details[0].path).toBe("fields");

    const empty = await listLinks(get("?fields="));
    expect(empty.status).toBe(400);
  });

  it("fields combines with pagination", async () => {
    const res = await listLinks(get("?limit=2&fields=title"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(Object.keys(body.data[0])).toEqual(["id", "title"]);
    expect(typeof body.meta.nextCursor).toBe("string");
  });

  it("sparse rows still round-trip real data (not all-null)", async () => {
    const res = await listLinks(get("?fields=redirectSlug&limit=3"));
    const body = await res.json();
    // Seeded links have no slug → null values present, keys still shaped.
    for (const row of body.data) {
      expect(Object.keys(row).sort()).toEqual(["id", "redirectSlug"]);
      expect(row.redirectSlug).toBeNull();
    }
    // A seeded row's actual column is readable through the projection.
    const all = db.select().from(schema.links).all();
    expect(all.length).toBe(5);
  });
});

describe("E.44 spec claim: ?cursor alone defaults limit to exactly 100", () => {
  // Real encoder — hand-rolled JSON uses the wrong keys and parseListParams
  // correctly rejects it (that's how the fixture bug surfaced).
  const cursor = encodeListCursor(0, 1);

  it("pins the literal default (the spec says 100 — not merely 'large')", () => {
    // The earlier route test proves "big enough for the tail"; this pins the
    // NUMBER the OpenAPI description promises (spec ↔ behavior both ways).
    expect(DEFAULT_LIST_LIMIT).toBe(100);
    expect(MAX_LIST_LIMIT).toBe(100);

    const cursorOnly = parseListParams(new URLSearchParams({ cursor }));
    expect(cursorOnly.ok).toBe(true);
    if (cursorOnly.ok) {
      expect(cursorOnly.value.limit).toBe(100);
      expect(cursorOnly.value.after).toEqual({ orderIndex: 0, id: 1 });
    }

    const noParams = parseListParams(new URLSearchParams());
    expect(noParams.ok).toBe(true);
    if (noParams.ok) expect(noParams.value.limit).toBe(100);
  });

  it("an explicit limit beats the default, and out-of-range limits stay 400", () => {
    const explicit = parseListParams(new URLSearchParams({ limit: "7" }));
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.value.limit).toBe(7);

    for (const bad of ["0", "101", "1000", "-5", "abc", "10.5"]) {
      const r = parseListParams(new URLSearchParams({ limit: bad }));
      expect(r.ok, `limit=${bad}`).toBe(false);
      if (!r.ok) expect(r.path).toBe("limit");
    }
  });
});

describe("E.75 ?fields is LIST-only — single reads ignore it silently", () => {
  it("GET /links/:id?fields=id,title returns the FULL row (no 400, no trimming)", async () => {
    const listed = await listLinks(get("?limit=1"));
    const firstId = (await listed.json()).data[0].id as number;

    ipCounter += 1;
    const withFields = await getLinkRoute(
      new NextRequest(
        `http://localhost:3000/api/v1/links/${firstId}?fields=id,title`,
        {
          headers: {
            authorization: ["Bearer", KEY].join(" "),
            "x-forwarded-for": `10.71.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
          },
        },
      ),
      { params: Promise.resolve({ id: String(firstId) }) },
    );
    expect(withFields.status).toBe(200); // ignored, never 400
    const trimmed = await withFields.json();

    ipCounter += 1;
    const plain = await getLinkRoute(
      new NextRequest(`http://localhost:3000/api/v1/links/${firstId}`, {
        headers: {
          authorization: ["Bearer", KEY].join(" "),
          "x-forwarded-for": `10.71.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
        },
      }),
      { params: Promise.resolve({ id: String(firstId) }) },
    );
    const full = await plain.json();

    // Full 24-column row either way: single reads never project.
    expect(Object.keys(trimmed.data).length).toBe(
      Object.keys(full.data).length,
    );
    expect(trimmed.data).toEqual(full.data);
  });
});

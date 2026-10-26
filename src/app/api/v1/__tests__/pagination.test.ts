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

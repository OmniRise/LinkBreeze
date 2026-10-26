/**
 * #4 E.10 — POST /api/v1/links/import: envelope validation, happy batch,
 * partial-failure reporting (one bad entry never aborts the batch),
 * per-item mass-assignment stripping, auth + demo gates, exports surface.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/favicon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/favicon")>()),
  fetchAndCacheFavicon: vi.fn(async () => "https://cdn.example/icon.png"),
}));
vi.mock("@/lib/og-fetcher", () => ({
  fetchOgData: vi.fn(async () => ({ description: null, imageUrl: null })),
}));

import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let ipCounter = 0;

function req(
  body: unknown,
  opts: { auth?: boolean; method?: string } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": `10.100.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (opts.auth !== false) headers.authorization = ["Bearer", KEY].join(" ");
  return new NextRequest("http://localhost:3000/api/v1/links/import", {
    method: opts.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validItem = (n: number) => ({
  title: `Imported ${n}`,
  url: `https://imported${n}.example`,
});

const linkCount = () => db.select().from(schema.links).all().length;

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  seedPage({ slug: "import-page", title: "Import Page" });
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("envelope validation (400s before any work)", () => {
  it("rejects missing/non-array/empty/oversized items", async () => {
    for (const body of [
      {},
      { items: "nope" },
      { items: { 0: validItem(1) } },
      { items: 5 },
      { items: [] },
      { items: Array.from({ length: 101 }, (_, i) => validItem(i)) },
    ]) {
      const res = await importRoute(req(body));
      expect(res.status, JSON.stringify(Object.keys(body))).toBe(400);
      const parsed = await res.json();
      expect(parsed.error.code).toBe("validation");
    }
    expect(linkCount()).toBe(0); // nothing was written by rejected envelopes
  });

  it("401s without a key and 403s in demo mode", async () => {
    const noKey = await importRoute(req({ items: [validItem(1)] }, { auth: false }));
    expect(noKey.status).toBe(401);

    process.env.DEMO_MODE = "true";
    const demo = await importRoute(req({ items: [validItem(1)] }));
    expect(demo.status).toBe(403);
    expect((await demo.json()).error.code).toBe("demo");
  });
});

describe("batch behavior", () => {
  it("creates every valid item and reports ids in order", async () => {
    const before = linkCount();
    const res = await importRoute(
      req({ items: [validItem(10), validItem(11), validItem(12)] }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(3);
    expect(body.failed).toBe(0);
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      "created",
      "created",
      "created",
    ]);
    const ids = body.results.map((r: { id: number }) => r.id);
    expect(new Set(ids).size).toBe(3);

    expect(linkCount()).toBe(before + 3);
    const rows = db.select().from(schema.links).all();
    for (const id of ids) {
      expect(rows.find((r) => r.id === id)).toBeTruthy();
    }
    // Items with no pageId land on the default page (shared pipeline rule).
    const created = rows.find((r) => r.id === ids[0])!;
    expect(created.pageId).toBeGreaterThan(0);
    expect(created.title).toBe("Imported 10");
  });

  it("PARTIAL failure: bad entries error individually, the batch completes", async () => {
    const before = linkCount();
    const res = await importRoute(
      req({
        items: [
          validItem(20),
          { title: "Bad scheme", url: "javascript:alert(1)" },
          { title: "", url: "https://empty-title.example" },
          "not-an-object",
          { title: "No url" },
          validItem(21),
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(2);
    expect(body.failed).toBe(4);
    expect(body.results).toHaveLength(6);

    expect(body.results[0]).toMatchObject({ index: 0, status: "created" });
    expect(body.results[5]).toMatchObject({ index: 5, status: "created" });
    for (const i of [1, 2, 3, 4]) {
      expect(body.results[i].index).toBe(i);
      expect(body.results[i].status).toBe("error");
      expect(body.results[i].error.code).toBe("validation");
      expect(typeof body.results[i].error.message).toBe("string");
    }
    expect(linkCount()).toBe(before + 2);
  });

  it("strips id-shaped fields from every item (URL owns ids)", async () => {
    const res = await importRoute(
      req({
        items: [
          { ...validItem(30), id: 99999, orderIndex: 77, clicksCount: 12345 },
        ],
      }),
    );
    const body = (await res.json()).data;
    expect(body.created).toBe(1);
    const id = body.results[0].id;
    expect(id).not.toBe(99999);
    const row = db
      .select()
      .from(schema.links)
      .all()
      .find((r) => r.id === id)!;
    expect(row.clicksCount).not.toBe(12345);
  });
});

describe("route exports surface", () => {
  it("exports ONLY POST (405 dispatch is router-level)", async () => {
    const mod = await import("@/app/api/v1/links/import/route");
    const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
    expect(
      Object.keys(mod).filter((k) => METHODS.has(k)),
    ).toEqual(["POST"]);
  });
});

describe("E.13 import edge battery", () => {
  it("same-batch duplicate redirectSlug: first wins, second is a per-item conflict", async () => {
    const res = await importRoute(
      req({
        items: [
          { title: "Slug first", url: "https://slug-a.example", redirectSlug: "batch-edge-slug" },
          { title: "Slug second", url: "https://slug-b.example", redirectSlug: "batch-edge-slug" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results[0]).toMatchObject({ index: 0, status: "created" });
    expect(body.results[1].status).toBe("error");
    expect(body.results[1].error.code).toBe("validation");
    expect(body.results[1].error.details?.[0]?.path).toBe("redirectSlug");

    // The winner actually holds the slug.
    const winner = db
      .select()
      .from(schema.links)
      .all()
      .find((r) => r.id === body.results[0].id)!;
    expect(winner.redirectSlug).toBe("batch-edge-slug");
  });

  it("iconMode custom is rejected per-item (upload stays UI-only)", async () => {
    const before = linkCount();
    const res = await importRoute(
      req({
        items: [
          { title: "Custom icon try", url: "https://custom-icon.example", iconMode: "custom" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.results[0].error.code).toBe("validation");
    expect(body.results[0].error.message.length).toBeGreaterThan(0);
    expect(linkCount()).toBe(before); // rejected before any insert
  });

  it("accepts exactly 100 items (the cap)", async () => {
    const before = linkCount();
    const items = Array.from({ length: 100 }, (_, i) => validItem(1000 + i));
    const res = await importRoute(req({ items }));
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(100);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(100);
    expect(linkCount()).toBe(before + 100);
  });

  it("deeply nested junk: unknown keys stripped, wrong-typed title and array entries error", async () => {
    const before = linkCount();
    const res = await importRoute(
      req({
        items: [
          {
            title: "Nested junk",
            url: "https://nested-junk.example",
            junk: { a: { b: { c: [1, { d: 2 }, { e: { f: "deep" } }] } } },
          },
          { title: { a: { b: { c: 1 } } }, url: "https://wrong-type.example" },
          [[1, 2, 3]],
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.created).toBe(1);
    expect(body.failed).toBe(2);

    const winner = db
      .select()
      .from(schema.links)
      .all()
      .find((r) => r.id === body.results[0].id)!;
    expect(winner.title).toBe("Nested junk");
    expect("junk" in winner).toBe(false); // zod stripped it at the boundary
    expect(body.results[1].error.code).toBe("validation");
    expect(body.results[2].error.message).toContain("JSON object");
    expect(linkCount()).toBe(before + 1);
  });
});

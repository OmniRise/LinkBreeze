/**
 * #4 E.35 — wire-contract snapshot: EXACT key sets for one representative
 * success per response family. A renamed, added, or removed field breaks
 * this test (and therefore CI) before it breaks an API consumer. Wrapper
 * keys are pinned literally; row shapes are pinned against the schema's
 * column list AND cross-checked for consistency between endpoints.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
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

import { GET as listLinks, POST as createLinkRoute } from "@/app/api/v1/links/route";
import { GET as getLinkRoute, DELETE as deleteLinkRoute } from "@/app/api/v1/links/[id]/route";
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { GET as listSections, POST as createSectionRoute } from "@/app/api/v1/sections/route";
import { DELETE as deleteSectionRoute } from "@/app/api/v1/sections/[id]/route";
import { GET as getProfileRoute } from "@/app/api/v1/profile/route";
import { GET as getAnalyticsRoute } from "@/app/api/v1/analytics/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function req(url: string): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost:3000${url}`, {
    headers: {
      authorization: ["Bearer", KEY].join(" "),
      "x-forwarded-for": `10.240.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    },
  });
}
const idParams = (id: number | string) => ({
  params: Promise.resolve({ id: String(id) }),
});
const keysOf = (o: unknown): string[] => Object.keys(o as object).sort();

/** Exact schema column contract for link rows (from src/db/schema.ts). */
const LINK_ROW_KEYS = [
  "id", "pageId", "sectionId", "orderIndex", "type", "title", "description",
  "url", "icon", "iconUrl", "customIconUrl", "iconMode", "autoIcon", "imageUrl",
  "isHighlighted", "isActive", "scheduleStart", "scheduleEnd", "clicksCount",
  "cardStyle", "popupText", "ctaLabel", "redirectSlug", "createdAt",
].sort();
const SECTION_ROW_KEYS = ["id", "pageId", "title", "icon", "orderIndex", "createdAt"].sort();
const PROFILE_KEYS = ["displayName", "bio", "badgeText", "avatarUrl", "socialLinks"].sort();
const ANALYTICS_KEYS = [
  "range", "since", "exportedAt", "retentionDays", "totalViews",
  "uniqueVisitors", "totalClicks", "ctr", "topLinks", "viewsPerDay",
].sort();

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage({ slug: "contract-page", title: "Contract Page" }).id;
});

describe("E.35 wire contract snapshots", () => {
  it("links list (legacy) and single-link share one exact row shape", async () => {
    const created = await POSTas("Contract link", "https://contract.example");
    expect(created.status).toBe(201);
    const createdData = (await created.json()).data as Record<string, unknown>;
    expect(keysOf(createdData)).toEqual(LINK_ROW_KEYS);

    const list = await listLinks(req("/api/v1/links"));
    const listBody = await list.json();
    expect(Object.keys(listBody)).toEqual(["data"]);
    const rows = listBody.data as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(keysOf(rows[0])).toEqual(LINK_ROW_KEYS); // exact, not subset

    const single = await getLinkRoute(req(`/api/v1/links/${createdData.id}`), idParams(createdData.id as number));
    const singleBody = await single.json();
    expect(Object.keys(singleBody)).toEqual(["data"]);
    expect(keysOf(singleBody.data)).toEqual(LINK_ROW_KEYS);
    // list row and single row are byte-shape identical for the same id
    const sameListRow = rows.find((r) => r.id === createdData.id)!;
    expect(keysOf(singleBody.data)).toEqual(keysOf(sameListRow));
  });

  it("links list (paginated) pins { data, meta } and meta's exact keys", async () => {
    const res = await listLinks(req("/api/v1/links?limit=2"));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
    expect(keysOf(body.meta)).toEqual(["count", "nextCursor"]);
    expect(typeof body.meta.count).toBe("number");
    expect(["string", "object"]).toContain(typeof body.meta.nextCursor); // string or null
    for (const row of body.data) expect(keysOf(row)).toEqual(LINK_ROW_KEYS);
  });

  it("sections list/create share one exact row shape", async () => {
    const created = await POSTsection("Contract section");
    expect(created.status).toBe(201);
    expect(keysOf((await created.json()).data)).toEqual(SECTION_ROW_KEYS);

    const list = await listSections(req("/api/v1/sections"));
    const body = await list.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(keysOf(body.data[0])).toEqual(SECTION_ROW_KEYS);
  });

  it("profile pins its five display keys exactly", async () => {
    // insert (profile row exists for this harness db or not — shape on 200)
    db.insert(schema.profile)
      .values({
        displayName: "Contract",
        bio: "Bio",
        badgeText: null,
        avatarUrl: null,
        socialLinks: "[]",
      })
      .run();
    const res = await getProfileRoute(req("/api/v1/profile"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(keysOf(body.data)).toEqual(PROFILE_KEYS);
  });

  it("analytics pins its ten metric keys exactly", async () => {
    const res = await getAnalyticsRoute(req("/api/v1/analytics?range=7d"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(keysOf(body.data)).toEqual(ANALYTICS_KEYS);
  });

  it("import results pin { results, created, failed } and per-entry shapes", async () => {
    const res = await importRoute(
      new NextRequest("http://localhost:3000/api/v1/links/import", {
        method: "POST",
        headers: {
          authorization: ["Bearer", KEY].join(" "),
          "content-type": "application/json",
          "x-forwarded-for": "10.241.0.1",
        },
        body: JSON.stringify({
          items: [
            { title: "Contract bulk", url: "https://contract-bulk.example" },
            { title: "", url: "https://bad.example" },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(keysOf(body.data)).toEqual(["created", "failed", "results"].sort());

    const [ok, err] = body.data.results;
    expect(keysOf(ok)).toEqual(["id", "index", "status"].sort());
    expect(keysOf(err)).toEqual(["error", "index", "status"].sort());
    // error object: code + message always, details optional (present here)
    expect(keysOf(err.error)).toEqual(["code", "details", "message"].sort());
    expect(keysOf(err.error.details[0])).toEqual(["message", "path"].sort());
  });

  it("raw db row and wire row agree for a link (no projection surprises)", async () => {
    const raw = db.select().from(schema.links).all()[0];
    expect(keysOf(raw)).toEqual(LINK_ROW_KEYS); // wire == schema columns
  });
});

/** helper: build the POST request inline (avoids import-cycle noise) */
async function POSTas(title: string, url: string): Promise<Response> {
  return createLinkRoute(
    new NextRequest("http://localhost:3000/api/v1/links", {
      method: "POST",
      headers: {
        authorization: ["Bearer", KEY].join(" "),
        "content-type": "application/json",
        "x-forwarded-for": `10.242.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      },
      body: JSON.stringify({ title, url }),
    }),
  );
}
async function POSTsection(title: string): Promise<Response> {
  ipCounter += 1;
  return createSectionRoute(
    new NextRequest("http://localhost:3000/api/v1/sections", {
      method: "POST",
      headers: {
        authorization: ["Bearer", KEY].join(" "),
        "content-type": "application/json",
        "x-forwarded-for": `10.243.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      },
      body: JSON.stringify({ pageId, title }),
    }),
  );
}

describe("E.72 DELETE wire contracts", () => {
  // This file's req() is GET-only; mutations build their own requests.
  const reqM = (
    url: string,
    init: { method: string; body?: string },
  ): NextRequest => {
    ipCounter += 1;
    return new NextRequest(`http://localhost:3000${url}`, {
      method: init.method,
      headers: {
        authorization: ["Bearer", KEY].join(" "),
        "content-type": "application/json",
        "x-forwarded-for": `10.244.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      },
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
  };

  it("links DELETE: data is exactly {deleted}", async () => {
    const created = await createLinkRoute(
      reqM("/api/v1/links", {
        method: "POST",
        body: JSON.stringify({ title: "Del contract", url: "https://del.example", pageId }),
      }),
    );
    const { data: link } = await created.json();

    const res = await deleteLinkRoute(
      reqM(`/api/v1/links/${link.id}`, { method: "DELETE" }),
      idParams(link.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Deliberate asymmetry, spec-mirrored: links return {deleted}; sections
    // return {id, deleted}. Both are documented — this pin makes the shape
    // a conscious choice instead of an accident.
    expect(Object.keys(body.data)).toEqual(["deleted"]);
    expect(body.data.deleted).toBe(true);

    // and the row is really gone
    const after = await getLinkRoute(req(`/api/v1/links/${link.id}`), idParams(link.id));
    expect(after.status).toBe(404);
  });

  it("sections DELETE: data is exactly {deleted, id}", async () => {
    const sectionRes = await POSTsection("Del section");
    const { data: section } = await sectionRes.json();
    const res = await deleteSectionRoute(
      reqM(`/api/v1/sections/${section.id}`, { method: "DELETE" }),
      idParams(section.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.data).sort()).toEqual(["deleted", "id"]);
    expect(body.data.deleted).toBe(true);
    expect(body.data.id).toBe(section.id);

    const after = await listSections(req("/api/v1/sections"));
    const rows = (await after.json()).data as Array<{ id: number }>;
    expect(rows.some((s) => s.id === section.id)).toBe(false);
  });
});

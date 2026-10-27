/**
 * #4 E.26 — public-page staleness proof: every API write is visible to a
 * FRESH read through the queries layer (the same entry points the public
 * pages render from), with no admin involvement anywhere in the path. The
 * routes' own response assertions can't prove this — they re-enter through
 * the same handler family; here the reader is a direct query call.
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

import { POST as createLinkRoute, GET as listLinksRoute } from "@/app/api/v1/links/route";
import {
  PUT as updateLinkRoute,
  DELETE as deleteLinkRoute,
} from "@/app/api/v1/links/[id]/route";
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { POST as createSectionRoute } from "@/app/api/v1/sections/route";
import {
  PUT as updateSectionRoute,
  DELETE as deleteSectionRoute,
} from "@/app/api/v1/sections/[id]/route";
import { createApiKey } from "@/server/api-keys";
// The READ side: exactly what a public page / admin list renders from.
import {
  getLink,
  getAllLinks,
  getSectionById,
  getSectionsByPage,
} from "@/server/queries";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function req(
  url: string,
  init: { method?: string; body?: unknown } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    authorization: ["Bearer", KEY].join(" "),
    "x-forwarded-for": `10.210.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}
const idParams = (id: number | string) => ({
  params: Promise.resolve({ id: String(id) }),
});

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage({ slug: "stale-page", title: "Stale Page" }).id;
});

describe("E.26 API writes are immediately visible through the queries layer", () => {
  it("create → fresh getLink/getAllLinks read (no admin, no route re-entry)", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Persisted one", url: "https://persisted.example" },
      }),
    );
    expect(res.status).toBe(201);
    const id = (await res.json()).data.id as number;

    const fresh = await getLink(id);
    expect(fresh?.title).toBe("Persisted one");
    expect((await getAllLinks()).some((r) => r.id === id)).toBe(true);
  });

  it("update → fresh read shows the new value", async () => {
    const created = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Before update", url: "https://update.example" },
      }),
    );
    const id = (await created.json()).data.id as number;

    const put = await updateLinkRoute(
      req(`/api/v1/links/${id}`, { method: "PUT", body: { title: "After update" } }),
      idParams(id),
    );
    expect(put.status).toBe(200);
    expect((await getLink(id))?.title).toBe("After update");
  });

  it("delete → fresh read returns nothing", async () => {
    const created = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Doomed", url: "https://doomed.example" },
      }),
    );
    const id = (await created.json()).data.id as number;

    const del = await deleteLinkRoute(
      req(`/api/v1/links/${id}`, { method: "DELETE" }),
      idParams(id),
    );
    expect(del.status).toBe(200);
    expect(await getLink(id)).toBeFalsy();
  });

  it("bulk import → fresh reads see every created item", async () => {
    const before = (await getAllLinks()).length;
    const res = await importRoute(
      req("/api/v1/links/import", {
        method: "POST",
        body: {
          items: [
            { title: "Bulk persisted A", url: "https://bulk-pa.example" },
            { title: "Bulk persisted B", url: "https://bulk-pb.example" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const all = await getAllLinks();
    expect(all.length).toBe(before + 2);
    expect(all.some((r) => r.title === "Bulk persisted A")).toBe(true);
    expect(all.some((r) => r.title === "Bulk persisted B")).toBe(true);
  });

  it("sections create/update/delete → getSectionById and page list track every step", async () => {
    const created = await createSectionRoute(
      req("/api/v1/sections", {
        method: "POST",
        body: { pageId, title: "Stale section" },
      }),
    );
    expect(created.status).toBe(201);
    const id = (await created.json()).data.id as number;

    expect((await getSectionById(id))?.title).toBe("Stale section");
    expect(
      (await getSectionsByPage(pageId)).some((s) => s.id === id),
    ).toBe(true);

    await updateSectionRoute(
      req(`/api/v1/sections/${id}`, { method: "PUT", body: { title: "Renamed section" } }),
      idParams(id),
    );
    expect((await getSectionById(id))?.title).toBe("Renamed section");

    await deleteSectionRoute(
      req(`/api/v1/sections/${id}`, { method: "DELETE" }),
      idParams(id),
    );
    expect(await getSectionById(id)).toBeFalsy();
    expect((await getSectionsByPage(pageId)).some((s) => s.id === id)).toBe(false);
  });

  it("the list route and the queries layer agree (same rows, same order source)", async () => {
    const viaRoute = await listLinksRoute(req("/api/v1/links"));
    const routeRows = (await viaRoute.json()).data as Array<{ id: number }>;
    const viaQueries = await getAllLinks();
    expect(routeRows.map((r) => r.id)).toEqual(viaQueries.map((r) => r.id));
    // sanity: the db is real
    expect(db.select().from(schema.links).all().length).toBe(viaQueries.length);
  });
});

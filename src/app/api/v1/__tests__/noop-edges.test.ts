/**
 * #4 E.64 — no-op / empty-body mutation edges, pinned at the route level:
 * PUT with `{}` (no fields changed), PUT with only unknown/body-id keys,
 * import `{items: []}`, and a partial PUT against a blank profile. These
 * document what the merge semantics INTEND, not what a bug might do.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink } from "../../../../server/queries/__tests__/integration-setup";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/favicon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/favicon")>()),
  fetchAndCacheFavicon: vi.fn(async () => null),
}));

import { GET as getLinkRoute, PUT as putLinkRoute } from "@/app/api/v1/links/[id]/route";
import { PUT as putSectionRoute } from "@/app/api/v1/sections/[id]/route";
import { GET as listSectionsRoute } from "@/app/api/v1/sections/route";
import { PUT as putProfileRoute } from "@/app/api/v1/profile/route";
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { createApiKey } from "@/server/api-keys";
import { createSection } from "@/server/queries";

let KEY = "";
let linkId = 0;
let sectionId = 0;
let ipCounter = 0;

function req(
  url: string,
  opts: { method?: string; body?: string } = {},
): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    headers: {
      authorization: ["Bearer", KEY].join(" "),
      "content-type": "application/json",
      "x-forwarded-for": `10.80.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    },
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
}

const idParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  const pageId = seedPage({ slug: "noop-page", title: "Noop Page" }).id;
  linkId = seedLink({
    title: "Noop link",
    url: "https://noop.example",
    pageId,
    orderIndex: 0,
  }).id;
  sectionId = (await createSection({ pageId, title: "Noop section" })).id;
});

describe("E.64 no-op mutation edges", () => {
  it("PUT /links/:id with {} is a 200 no-op — the row comes back byte-identical", async () => {
    const before = await (
      await getLinkRoute(req(`/api/v1/links/${linkId}`), idParams(linkId))
    ).json();
    const res = await putLinkRoute(
      req(`/api/v1/links/${linkId}`, { method: "PUT", body: "{}" }),
      idParams(linkId),
    );
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after.data).toEqual(before.data);
  });

  it("PUT /links/:id with only unknown keys + a body id is STILL a 200 no-op (strip, URL id wins)", async () => {
    const before = await (
      await getLinkRoute(req(`/api/v1/links/${linkId}`), idParams(linkId))
    ).json();
    const res = await putLinkRoute(
      req(`/api/v1/links/${linkId}`, {
        method: "PUT",
        body: JSON.stringify({ junk: "x", id: 99999, orderIndex: -1 }),
      }),
      idParams(linkId),
    );
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after.data).toEqual(before.data); // nothing took effect
  });

  it("PUT /sections/:id with {} is a 200 no-op", async () => {
    const before = await (await listSectionsRoute(req("/api/v1/sections"))).json();
    const row = before.data.find((s: { id: number }) => s.id === sectionId);
    expect(row).toBeTruthy();

    const res = await putSectionRoute(
      req(`/api/v1/sections/${sectionId}`, { method: "PUT", body: "{}" }),
      idParams(sectionId),
    );
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after.data).toEqual(row);
  });

  it("PUT /profile {} is a 200 no-op once a profile exists", async () => {
    const created = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName: "Noop user" }),
      }),
    );
    expect(created.status).toBe(200);
    const before = await created.json();

    const noop = await putProfileRoute(
      req("/api/v1/profile", { method: "PUT", body: "{}" }),
    );
    expect(noop.status).toBe(200);
    expect((await noop.json()).data).toEqual(before.data);
  });

  it("POST /links/import with {items: []} is a 400 (1..100 envelope rule)", async () => {
    const res = await importRoute(
      req("/api/v1/links/import", {
        method: "POST",
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation");
    expect(body.error.details?.[0]?.path).toBe("items");
  });
});

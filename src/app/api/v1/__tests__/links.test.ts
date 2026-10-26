/**
 * #4 — /api/v1/links route tests: direct handler invocation against the
 * sql.js in-memory DB (integration-setup harness mocked @/db BEFORE the
 * queries module loads — import order matters: bare side-effect import first,
 * queries via the @/server/queries alias after).
 *
 * Covers: happy paths, auth rejects, validation rejects (same schema as the
 * admin actions), demo-mode behavior, mass-assignment stripping, tri-state
 * PUT semantics, reorder validation, and rate-limit headers.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink, db } from "../../../../server/queries/__tests__/integration-setup";
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
import {
  PUT as updateLinkRoute,
  DELETE as deleteLinkRoute,
} from "@/app/api/v1/links/[id]/route";
import { PUT as reorderRoute } from "@/app/api/v1/links/reorder/route";
import { createApiKey } from "@/server/api-keys";
import { fetchAndCacheFavicon } from "@/lib/favicon";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function req(
  url: string,
  opts: {
    method?: string;
    auth?: boolean;
    body?: unknown;
    ip?: string;
  } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "x-forwarded-for": opts.ip ?? `10.20.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (opts.auth !== false) headers.authorization = `Bearer ${KEY}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const idParams = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  const created = await createApiKey();
  KEY = created.key;
  pageId = seedPage().id;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("GET /api/v1/links", () => {
  it("401s without a key and 200s with one (rate-limit headers attached)", async () => {
    const denied = await listLinks(req("/api/v1/links", { auth: false }));
    expect(denied.status).toBe(401);
    expect((await denied.json()).error.code).toBe("unauthorized");

    seedLink({ title: "Listed link", url: "https://listed.example", pageId });
    const res = await listLinks(req("/api/v1/links"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("120");
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((l: { title: string }) => l.title === "Listed link")).toBe(true);
  });
});

describe("POST /api/v1/links", () => {
  it("creates a link through the same schema as the admin action", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: {
          title: "API Link",
          url: "https://api.example/page",
          description: "via api",
          isHighlighted: true,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe("API Link");
    expect(body.data.url).toBe("https://api.example/page");
    expect(body.data.isHighlighted).toBe(true);
    expect(body.data.isActive).toBe(true);
    expect(body.data.type).toBe("url");
    expect(body.data.iconMode).toBe("auto");
    // auto-icon enrichment ran through the mocked favicon fetch
    expect(fetchAndCacheFavicon).toHaveBeenCalledWith("https://api.example/page");
    expect(body.data.iconUrl).toBe("https://cdn.example/icon.png");
  });

  it("rejects disallowed URL schemes (validation, same allowlist)", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "XSS", url: "javascript:alert(1)" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation");
    expect(body.error.details?.[0]?.path).toBe("url");
  });

  it("strips mass-assignment fields (id/userId/createdAt/clicksCount)", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: {
          title: "Hijack",
          url: "https://hijack.example",
          id: 99999,
          userId: 7,
          createdAt: "1999-01-01 00:00:00",
          clicksCount: 555,
          orderIndex: 77,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).not.toBe(99999);
    expect(body.data.clicksCount).toBe(0);
    expect(body.data.createdAt).not.toBe("1999-01-01 00:00:00");
    expect(body.data.orderIndex).not.toBe(77);
  });

  it("403s mutations in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    const res = await createLinkRoute(
      req("/api/v1/links", { method: "POST", body: { title: "No", url: "https://no.example" } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("demo");
  });

  it("rejects iconMode custom (upload stays UI-only)", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "C", url: "https://c.example", iconMode: "custom" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.details?.[0]?.path).toBe("iconMode");
  });

  it("canonicalizes location cards and bakes the English default CTA", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Office", url: "Casablanca Morocco", type: "location" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.url).toContain("google.com/maps");
    expect(body.data.ctaLabel).toBe("Open in Google Maps");
  });

  it("rejects a duplicate /go/ slug before writing", async () => {
    const first = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Slug A", url: "https://a.example", redirectSlug: "my-slug" },
      }),
    );
    expect(first.status).toBe(201);

    const second = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: { title: "Slug B", url: "https://b.example", redirectSlug: "my-slug" },
      }),
    );
    expect(second.status).toBe(400);
    expect((await second.json()).error.message).toBe("This slug is already in use");
  });
});

describe("PUT /api/v1/links/:id", () => {
  it("partial update writes only present keys (tri-state merge)", async () => {
    const link = seedLink({ title: "Orig", url: "https://orig.example", description: "keep me", pageId });
    const res = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, { method: "PUT", body: { title: "Renamed" } }),
      idParams(link.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe("Renamed");
    expect(body.data.url).toBe("https://orig.example"); // untouched
    expect(body.data.description).toBe("keep me"); // untouched
  });

  it("explicit null clears a nullable field", async () => {
    const link = seedLink({ title: "Clearable", url: "https://clr.example", description: "gone", pageId });
    const res = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, { method: "PUT", body: { description: null } }),
      idParams(link.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.description).toBe(null);
  });

  it("validates the MERGED result (type change can invalidate stored url)", async () => {
    const link = seedLink({ title: "U", url: "https://u.example", type: "url", pageId });
    const res = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, { method: "PUT", body: { type: "divider" } }),
      idParams(link.id),
    );
    // divider forbids any URL — the stored url now violates the schema
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
  });

  it("ignores mass-assignment attempts on update", async () => {
    const link = seedLink({ title: "Safe", url: "https://safe.example", pageId });
    const res = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, {
        method: "PUT",
        body: { title: "Safe2", id: 123456, orderIndex: 999, clicksCount: 42, createdAt: "2000" },
      }),
      idParams(link.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(link.id);
    expect(body.data.orderIndex).toBe(link.orderIndex);
    expect(body.data.clicksCount).toBe(link.clicksCount);
  });

  it("validates lucide icon names and 404s unknown ids / 400s bad ids", async () => {
    const link = seedLink({ title: "Ico", url: "https://ico.example", pageId });

    const good = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, {
        method: "PUT",
        body: { iconMode: "lucide", icon: "rocket" },
      }),
      idParams(link.id),
    );
    expect(good.status).toBe(200);
    expect((await good.json()).data.icon).toBe("rocket");

    const bad = await updateLinkRoute(
      req(`/api/v1/links/${link.id}`, {
        method: "PUT",
        body: { iconMode: "lucide", icon: "not-a-real-icon" },
      }),
      idParams(link.id),
    );
    expect(bad.status).toBe(400);

    const missing = await updateLinkRoute(
      req("/api/v1/links/987654", { method: "PUT", body: { title: "x" } }),
      idParams(987654),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");

    const garbage = await updateLinkRoute(
      req("/api/v1/links/abc", { method: "PUT", body: { title: "x" } }),
      idParams("abc"),
    );
    expect(garbage.status).toBe(400);
  });
});

describe("DELETE /api/v1/links/:id", () => {
  it("deletes an existing link and 404s an unknown one", async () => {
    const link = seedLink({ title: "Doomed", url: "https://doomed.example", pageId });
    const res = await deleteLinkRoute(req(`/api/v1/links/${link.id}`, { method: "DELETE" }), idParams(link.id));
    expect(res.status).toBe(200);
    expect((await res.json()).data.deleted).toBe(true);

    const rows = db.select().from(schema.links).all();
    expect(rows.some((l) => l.id === link.id)).toBe(false);

    const missing = await deleteLinkRoute(
      req("/api/v1/links/987654", { method: "DELETE" }),
      idParams(987654),
    );
    expect(missing.status).toBe(404);
  });
});

describe("PUT /api/v1/links/reorder", () => {
  it("applies the given order and validates the payload", async () => {
    const a = seedLink({ title: "A", url: "https://a2.example", pageId });
    const b = seedLink({ title: "B", url: "https://b2.example", pageId });
    const c = seedLink({ title: "C", url: "https://c2.example", pageId });

    const res = await reorderRoute(
      req("/api/v1/links/reorder", { method: "PUT", body: { ids: [c.id, b.id, a.id] } }),
    );
    expect(res.status).toBe(200);

    const rows = db.select().from(schema.links).all();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(c.id)!.orderIndex).toBe(0);
    expect(byId.get(b.id)!.orderIndex).toBe(1);
    expect(byId.get(a.id)!.orderIndex).toBe(2);

    const dupes = await reorderRoute(
      req("/api/v1/links/reorder", { method: "PUT", body: { ids: [a.id, a.id] } }),
    );
    expect(dupes.status).toBe(400);

    const strings = await reorderRoute(
      req("/api/v1/links/reorder", { method: "PUT", body: { ids: ["1", "2"] } }),
    );
    expect(strings.status).toBe(400);
  });
});

/**
 * #4 E.7 — /api/v1/sections route tests: direct handler invocation against
 * the sql.js harness (real queries). Covers list/filter, create validation +
 * page-exists 404, mass-assignment stripping, partial PUT, 404s, demo mode,
 * and the delete → links-fall-back invariant.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink, db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET as listSections, POST as createSectionRoute } from "@/app/api/v1/sections/route";
import {
  PUT as updateSectionRoute,
  DELETE as deleteSectionRoute,
} from "@/app/api/v1/sections/[id]/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let pageId = 0;
let otherPageId = 0;
let ipCounter = 0;

function req(
  url: string,
  init: { method?: string; body?: unknown } = {},
  extra: { ip?: string } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    authorization: ["Bearer", KEY].join(" "),
    "x-forwarded-for": extra.ip ?? `10.80.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function createVia(
  title: string,
  page: number,
): Promise<{ id: number; orderIndex: number }> {
  const res = await createSectionRoute(
    req("/api/v1/sections", { method: "POST", body: { pageId: page, title } }),
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return { id: body.data.id, orderIndex: body.data.orderIndex };
}

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  // seedPage's default slug is "test-page" — every seed needs its own.
  pageId = seedPage({ slug: "api-sections-page", title: "API Sections Page" }).id;
  otherPageId = seedPage({ slug: "api-sections-other", title: "Other Page" }).id;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("GET /api/v1/sections", () => {
  it("lists all sections and filters by pageId", async () => {
    const a = await createVia("Alpha section", pageId);
    const b = await createVia("Beta section", pageId);
    const c = await createVia("Other page section", otherPageId);

    const all = await listSections(req("/api/v1/sections"));
    expect(all.status).toBe(200);
    const allBody = await all.json();
    const titles = allBody.data.map((s: { title: string }) => s.title);
    expect(titles).toContain("Alpha section");
    expect(titles).toContain("Other page section");

    const filtered = await listSections(req(`/api/v1/sections?pageId=${pageId}`));
    const filteredBody = await filtered.json();
    expect(filteredBody.data.map((s: { id: number }) => s.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect(filteredBody.data.map((s: { id: number }) => s.id)).not.toContain(c.id);
  });

  it("rejects malformed pageId filters with 400", async () => {
    for (const q of ["?pageId=abc", "?pageId=-1", "?pageId=", "?pageId=1.5"]) {
      const res = await listSections(req(`/api/v1/sections${q}`));
      expect(res.status, q).toBe(400);
      expect((await res.json()).error.code).toBe("validation");
    }
  });

  it("401s without a key", async () => {
    const res = await listSections(
      new NextRequest("http://localhost:3000/api/v1/sections"),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/sections", () => {
  it("creates with 201, auto-assigns orderIndex, strips id-shaped fields", async () => {
    const res = await createSectionRoute(
      req("/api/v1/sections", {
        method: "POST",
        body: {
          pageId,
          title: "Mass assignment probe",
          id: 99999,
          orderIndex: 77,
          createdAt: "1999-01-01 00:00:00",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).not.toBe(99999);
    expect(body.data.title).toBe("Mass assignment probe");
    // First section on this test's probe page ordering: whatever createSection
    // assigned, it was NOT the client's 77.
    expect(body.data.orderIndex).not.toBe(77);
    expect(body.data.createdAt).not.toBe("1999-01-01 00:00:00");
  });

  it("validates title and icon with the SAME rules as the admin form", async () => {
    for (const bad of [
      { pageId, title: "" },
      { pageId, title: "x".repeat(81) },
      { pageId, title: "Ok", icon: "not a valid icon!" },
      { pageId, title: "Ok", icon: "😀" },
      { title: "No pageId" },
      { pageId: "abc", title: "Nope" },
    ]) {
      const res = await createSectionRoute(
        req("/api/v1/sections", { method: "POST", body: bad }),
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("validation");
    }
  });

  it("404s when the target page does not exist", async () => {
    const res = await createSectionRoute(
      req("/api/v1/sections", { method: "POST", body: { pageId: 424242, title: "Ghost" } }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toContain("Page");
  });

  it("403s in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    const res = await createSectionRoute(
      req("/api/v1/sections", { method: "POST", body: { pageId, title: "Demo" } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("demo");
  });
});

describe("PUT /api/v1/sections/:id", () => {
  it("partial update changes only what was sent", async () => {
    const s = await createVia("Patch me", pageId);
    const before = s.orderIndex;

    const res = await updateSectionRoute(
      req(`/api/v1/sections/${s.id}`, {
        method: "PUT",
        body: { title: "Patched title", icon: "rocket" },
      }),
      { params: Promise.resolve({ id: String(s.id) }) },
    );
    expect(res.status).toBe(200);
    const row = (await res.json()).data;
    expect(row.title).toBe("Patched title");
    expect(row.icon).toBe("rocket");
    expect(row.orderIndex).toBe(before);
    expect(row.pageId).toBe(pageId);
  });

  it("rejects invalid patches with 400 (strict schema, shared rules)", async () => {
    const s = await createVia("Strict patch", pageId);
    for (const bad of [
      { title: "" },
      { icon: "bad icon!!" },
      { orderIndex: -1 },
      { title: "x".repeat(81) },
      { nonsenseKey: 1 }, // additionalProperties: false
    ]) {
      const res = await updateSectionRoute(
        req(`/api/v1/sections/${s.id}`, { method: "PUT", body: bad }),
        { params: Promise.resolve({ id: String(s.id) }) },
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await res.json()).error.code).toBe("validation");
    }
  });

  it("404s unknown ids and 400s hostile ids", async () => {
    const notFound = await updateSectionRoute(
      req("/api/v1/sections/424242", { method: "PUT", body: { title: "x" } }),
      { params: Promise.resolve({ id: "424242" }) },
    );
    expect(notFound.status).toBe(404);

    for (const hostile of ["abc", "-1", "1.5", "99999999999999", "1e3", ""]) {
      const res = await updateSectionRoute(
        req(`/api/v1/sections/${hostile}`, { method: "PUT", body: { title: "x" } }),
        { params: Promise.resolve({ id: hostile }) },
      );
      expect(res.status, hostile).toBe(400);
    }
  });
});

describe("DELETE /api/v1/sections/:id", () => {
  it("deletes and its links fall back to uncategorized (never lost)", async () => {
    const s = await createVia("Doomed section", pageId);
    const link = seedLink({
      title: "Sectioned link",
      url: "https://sectioned.example",
      pageId,
      sectionId: s.id,
    });

    const res = await deleteSectionRoute(
      req(`/api/v1/sections/${s.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: String(s.id) }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: s.id, deleted: true });

    const rows = db
      .select()
      .from(schema.links)
      .all()
      .filter((l) => l.id === link.id);
    expect(rows[0].sectionId).toBeNull();

    const again = await deleteSectionRoute(
      req(`/api/v1/sections/${s.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: String(s.id) }) },
    );
    expect(again.status).toBe(404);
  });

  it("403s in demo mode", async () => {
    const s = await createVia("Demo-proof section", pageId);
    process.env.DEMO_MODE = "true";
    const res = await deleteSectionRoute(
      req(`/api/v1/sections/${s.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: String(s.id) }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("demo");
    delete process.env.DEMO_MODE;
    // cleanup so re-runs in the same file stay deterministic
    await deleteSectionRoute(
      req(`/api/v1/sections/${s.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: String(s.id) }) },
    );
  });
});

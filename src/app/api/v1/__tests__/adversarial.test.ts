/**
 * #4 E.1 — adversarial battery against the /api/v1 surface: header
 * smuggling (duplicate Authorization), method routing (case + wrong-method
 * 405s), path traversal / hostile :id values, JSON depth bomb, unicode in
 * slugs, oversized Authorization headers, method-override headers.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage } from "../../../../server/queries/__tests__/integration-setup";
import { NextRequest } from "next/server";
import { generateApiKey } from "@/lib/api-key";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/favicon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/favicon")>()),
  fetchAndCacheFavicon: vi.fn(async () => null),
}));

import { GET as listLinks, POST as createLinkRoute } from "@/app/api/v1/links/route";
import { PUT as updateLinkRoute } from "@/app/api/v1/links/[id]/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let ipCounter = 0;

function req(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string> | Array<[string, string]>;
    body?: unknown;
  } = {},
): NextRequest {
  ipCounter += 1;
  const base: Record<string, string> = {
    "x-forwarded-for": `10.60.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    authorization: `Bearer ${KEY}`,
  };
  const headers =
    Array.isArray(opts.headers)
      ? ([...Object.entries(base), ...opts.headers] as Array<[string, string]>)
      : ({ ...base, ...(opts.headers ?? {}) } as Record<string, string>);
  if (opts.body !== undefined && !Array.isArray(headers)) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: opts.body as string } : {}),
  });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  seedPage();
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("header smuggling", () => {
  it("duplicate Authorization headers are rejected (no bearer-token confusion)", async () => {
    const other = generateApiKey().key;
    // Array-of-pairs appends BOTH values; Headers.get() joins with ", ".
    const res = await listLinks(
      req("/api/v1/links", {
        headers: [
          ["authorization", `Bearer ${KEY}`],
          ["authorization", `Bearer ${other}`],
        ],
      }),
    );
    // The joined value can never satisfy `^Bearer <shaped-token>$` — 401,
    // never "attacker picks which of the two keys authenticates".
    expect(res.status).toBe(401);
  });

  it("an oversized/garbage Authorization header 401s without crashing", async () => {
    const res = await listLinks(
      req("/api/v1/links", { headers: { authorization: `Bearer ${"A".repeat(10_000)}` } }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("X-HTTP-Method-Override and friends change nothing", async () => {
    const res = await listLinks(
      req("/api/v1/links", {
        headers: {
          "x-http-method-override": "DELETE",
          "x-method-override": "DELETE",
        },
      }),
    );
    // Still the GET handler answering.
    expect(res.status).toBe(200);
  });
});

describe("method routing", () => {
  it("lowercase methods are normalized (fetch-style) and still dispatch", async () => {
    const res = await listLinks(req("/api/v1/links", { method: "get" }));
    expect(res.status).toBe(200);
  });

  it("route modules export exactly their documented methods (no extras)", async () => {
    // 405 dispatch is Next-router behavior (not reachable by direct handler
    // invocation) — the enforceable property is that no route module EXPORTS
    // an undocumented method for the router to dispatch to.
    const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
    const exportedMethods = (m: object) =>
      Object.keys(m).filter((k) => METHODS.has(k)).sort();

    const linksModule = await import("@/app/api/v1/links/route");
    expect(exportedMethods(linksModule)).toEqual(["GET", "POST"]);

    const reorderModule = await import("@/app/api/v1/links/reorder/route");
    expect(exportedMethods(reorderModule)).toEqual(["PUT"]);

    const idModule = await import("@/app/api/v1/links/[id]/route");
    expect(exportedMethods(idModule)).toEqual(["DELETE", "PUT"]);
  });
});

describe("path traversal / hostile :id", () => {
  const hostileIds = [
    "..",
    "../1",
    "1/../2",
    "1%2F..%2F2",
    "1e999",
    "-1",
    "0",
    "1.5",
    "0x10",
    "99999999999999999999",
    "1;DROP TABLE links",
    "١٢٣", // arabic-indic digits — must not parse as integers
  ];

  it("every hostile id is a 400 (integer parse is the only door)", async () => {
    for (const id of hostileIds) {
      const res = await updateLinkRoute(
        req(`/api/v1/links/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ title: "x" }),
        }),
        idParams(id),
      );
      expect(res.status, `id=${JSON.stringify(id)}`).toBe(400);
      expect((await res.json()).error.code).toBe("validation");
    }
  });

  it("a well-formed but unknown id is a 404, never a 400/500", async () => {
    const res = await updateLinkRoute(
      req("/api/v1/links/987654321", { method: "PUT", body: JSON.stringify({ title: "x" }) }),
      idParams("987654321"),
    );
    expect(res.status).toBe(404);
  });
});

describe("JSON body bombs", () => {
  it("a 10k-deep object is a 400, not a stack overflow", async () => {
    const bomb = `${'{"a":'.repeat(10_000)}1${"}".repeat(10_000)}`;
    const res = await createLinkRoute(
      req("/api/v1/links", { method: "POST", body: bomb }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
  });

  it("a top-level array or scalar body is a 400", async () => {
    for (const body of ["[1,2,3]", '"just a string"', "42", "null", "true"]) {
      const res = await createLinkRoute(
        req("/api/v1/links", { method: "POST", body }),
      );
      expect(res.status, body).toBe(400);
    }
  });

  it("malformed JSON is a 400, not a 500", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", { method: "POST", body: '{"title": "unterminated' }),
    );
    expect(res.status).toBe(400);
  });
});

describe("unicode in slugs and content", () => {
  it("unicode slug input can never store a non-ASCII slug", async () => {
    const cases = ["café", "ссылка", "🔗-link", "名前"];
    for (const raw of cases) {
      const res = await createLinkRoute(
        req("/api/v1/links", {
          method: "POST",
          body: JSON.stringify({
            title: `Slug ${raw}`,
            url: "https://unicode.example",
            redirectSlug: raw,
          }),
        }),
      );
      // Either normalized to ASCII (café → caf), rejected, or dropped to
      // null — never a raw unicode slug in the DB.
      if (res.status === 201) {
        const slug = (await res.json()).data.redirectSlug as string | null;
        if (slug !== null) expect(slug).toMatch(/^[a-z0-9-]+$/);
      } else {
        expect(res.status).toBe(400);
      }
    }
  });

  it("unicode CONTENT (titles) is fine — only slugs are restricted", async () => {
    const res = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: JSON.stringify({
          title: "日本語タイトル 🚀 Ссылка",
          url: "https://unicode-content.example",
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data.title).toBe("日本語タイトル 🚀 Ссылка");
  });
});

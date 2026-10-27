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
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { POST as createSectionRoute } from "@/app/api/v1/sections/route";
import { PUT as putProfileRoute } from "@/app/api/v1/profile/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let pageId = 0;
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
  pageId = seedPage().id;
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
    expect(exportedMethods(idModule)).toEqual(["DELETE", "GET", "PUT"]);
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

describe("E.52 hostile input complement (sections/import/profile, pollution, content-type)", () => {
  it("prototype-pollution keys never land or pollute Object.prototype (all three families)", async () => {
    // Built as RAW STRINGS: an object-literal `__proto__` key would set the
    // prototype instead of creating the hostile own-property we want to test.
    const hostile = (inner: string): string =>
      '{"__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"x": 1}}, ' +
      inner +
      ", \"junk\": {\"__proto__\": {\"deep\": true}}}";

    const linkRes = await createLinkRoute(
      req("/api/v1/links", {
        method: "POST",
        body: hostile('"title": "Proto link", "url": "https://proto.example"'),
      }),
    );
    expect(linkRes.status).toBe(201);
    const linkBody = await linkRes.text();
    expect(linkBody).not.toContain("__proto__");
    expect(linkBody).not.toContain('"polluted"');

    const sectionRes = await createSectionRoute(
      req("/api/v1/sections", {
        method: "POST",
        body: hostile(`"pageId": ${pageId}, "title": "Proto section"`),
      }),
    );
    expect(sectionRes.status).toBe(201);
    const sectionBody = await sectionRes.text();
    expect(sectionBody).not.toContain("__proto__");

    const profileRes = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: hostile('"displayName": "Proto user"'),
      }),
    );
    // profile row may or may not exist yet — pollution never happens either way
    if (profileRes.status === 200) {
      expect(await profileRes.text()).not.toContain("__proto__");
    } else {
      expect([200, 404]).toContain(profileRes.status);
    }

    const importRes = await importRoute(
      req("/api/v1/links/import", {
        method: "POST",
        body: `{"items": [${hostile('"title": "Proto bulk", "url": "https://proto-bulk.example"')}]}`,
      }),
    );
    expect(importRes.status).toBe(200);
    const importBody = await importRes.text();
    expect(importBody).not.toContain('"polluted"');

    // THE proof: Object.prototype is untouched after every family's parse+write.
    expect(
      (Object.prototype as unknown as Record<string, unknown>).polluted,
    ).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((({} as Record<string, unknown>).constructor as unknown)).toBe(
      Object,
    );
  });

  it("a 10k-deep SECTION body is a 400 (zod boundary, no stack overflow)", async () => {
    let deep = "1";
    for (let i = 0; i < 10_000; i++) deep = `{"a":${deep}}`;
    const res = await createSectionRoute(
      req("/api/v1/sections", {
        method: "POST",
        body: `{"pageId":${pageId},"title":${deep}}`,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation");
  });

  it("wrong content-type with a JSON body is PINNED lenient (parse-only contract)", async () => {
    // parseJsonBody is request.json() — content-type agnostic (matches the
    // repo's parse-only convention; GitHub-style leniency). Pinned so a
    // future strictness change flips this test consciously.
    const res = await createLinkRoute(
      new NextRequest("http://localhost:3000/api/v1/links", {
        method: "POST",
        headers: {
          authorization: ["Bearer", KEY].join(" "),
          "content-type": "text/plain; charset=utf-8",
          "x-forwarded-for": "10.61.0.1",
        },
        body: JSON.stringify({
          title: "Plain text CT",
          url: "https://plainct.example",
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data.title).toBe("Plain text CT");
  });
});

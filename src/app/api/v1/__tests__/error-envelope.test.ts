/**
 * #4 E.30 — error-envelope INVARIANT battery: every failure response from
 * every v1 route family is exactly `{ error: { code, message, details? } }`
 * with a code from the app's ErrorCode vocabulary, a non-empty message, the
 * documented status, and JSON content-type — one checker, many paths, so no
 * endpoint can ship an ad-hoc error shape.
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
  GET as getLinkRoute,
  PUT as updateLinkRoute,
  DELETE as deleteLinkRoute,
} from "@/app/api/v1/links/[id]/route";
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { PUT as reorderLinksRoute } from "@/app/api/v1/links/reorder/route";
import { GET as listSections, POST as createSectionRoute } from "@/app/api/v1/sections/route";
import {
  PUT as updateSectionRoute,
  DELETE as deleteSectionRoute,
} from "@/app/api/v1/sections/[id]/route";
import { PUT as reorderSectionsRoute } from "@/app/api/v1/sections/reorder/route";
import { GET as getProfileRoute, PUT as putProfileRoute } from "@/app/api/v1/profile/route";
import { GET as getOpenApi } from "@/app/api/v1/openapi/route";
import { GET as getDocs } from "@/app/api/v1/docs/route";
import { createApiKey } from "@/server/api-keys";
import { ErrorCode } from "@/lib/errors";
import { getSession } from "@/lib/auth";
import { getLink } from "@/server/queries";

let KEY = "";
let pageId = 0;
let seedLinkId = 0;
let ipCounter = 0;

function req(
  url: string,
  init: { method?: string; body?: unknown; auth?: boolean; raw?: unknown } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "x-forwarded-for": `10.230.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (init.auth !== false) headers.authorization = ["Bearer", KEY].join(" ");
  if (init.body !== undefined || init.raw !== undefined) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body) }
      : init.raw !== undefined
        ? { body: String(init.raw) }
        : {}),
  });
}
const idParams = (id: number | string) => ({
  params: Promise.resolve({ id: String(id) }),
});

const VALID_CODES = new Set(Object.values(ErrorCode) as string[]);

/** THE invariant: one shape, one vocabulary, one honest status. */
async function expectErrorEnvelope(
  label: string,
  res: Response,
  expectedStatus: number,
): Promise<void> {
  expect(res.status, label).toBe(expectedStatus);
  expect(res.headers.get("content-type"), label).toContain("application/json");

  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body), `${label} top-level keys`).toEqual(["error"]);

  // E.36 behavior parity: apiError always sets no-store; post-gate statuses
  // carry rate headers; 401s carry the Bearer challenge (pre-accounting).
  expect(res.headers.get("cache-control"), `${label} cache-control`).toBe("no-store");
  if ([400, 403, 404, 500].includes(expectedStatus)) {
    expect(res.headers.get("x-ratelimit-limit"), `${label} rate headers`).toBeTruthy();
    expect(res.headers.get("x-ratelimit-reset"), `${label} rate reset`).toBeTruthy();
  }
  if (expectedStatus === 401) {
    expect(res.headers.get("www-authenticate"), `${label} www-auth`).toBeTruthy();
  }

  const err = body.error as Record<string, unknown>;
  expect(typeof err.code, `${label} code type`).toBe("string");
  expect(VALID_CODES.has(err.code as string), `${label} code '${err.code}' in vocabulary`).toBe(true);
  expect(typeof err.message, `${label} message type`).toBe("string");
  expect((err.message as string).length, `${label} message non-empty`).toBeGreaterThan(0);
  if ("details" in err) {
    expect(Array.isArray(err.details), `${label} details is array`).toBe(true);
  }
  expect(body.data, `${label} no data alongside error`).toBeUndefined();
}

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage({ slug: "err-page", title: "Error Page" }).id;
  seedLinkId = seedLink({ title: "Err seed", url: "https://err.example", pageId }).id;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("E.30 error envelope across the whole surface", () => {
  it("401s (every authed family refuses identically, incl. meta routes)", async () => {
    await expectErrorEnvelope(
      "GET /links",
      await listLinks(req("/api/v1/links", { auth: false })),
      401,
    );
    await expectErrorEnvelope(
      "GET /openapi",
      await getOpenApi(req("/api/v1/openapi", { auth: false })),
      401,
    );
    await expectErrorEnvelope(
      "GET /sections",
      await listSections(req("/api/v1/sections", { auth: false })),
      401,
    );
    // The harness's getSession is logged-in by default (setup mock wins the
    // registry); docs' session fallback would render HTML instead of the
    // envelope — force anonymous for exactly this call. meta.test covers
    // the session-allowed side.
    vi.mocked(getSession).mockResolvedValueOnce(null);
    await expectErrorEnvelope(
      "GET /docs",
      await getDocs(req("/api/v1/docs", { auth: false })),
      401,
    );
  });

  it("400 validation (schema + shape rejects on every mutating family)", async () => {
    await expectErrorEnvelope(
      "POST /links bad scheme",
      await createLinkRoute(
        req("/api/v1/links", { method: "POST", body: { title: "x", url: "javascript:alert(1)" } }),
      ),
      400,
    );
    await expectErrorEnvelope(
      "POST /links array body",
      await createLinkRoute(req("/api/v1/links", { method: "POST", raw: "[]" })),
      400,
    );
    await expectErrorEnvelope(
      "GET /links/:id hostile id",
      await getLinkRoute(req("/api/v1/links/abc"), idParams("abc")),
      400,
    );
    await expectErrorEnvelope(
      "PUT /links/:id bad body",
      await updateLinkRoute(
        req(`/api/v1/links/${seedLinkId}`, { method: "PUT", raw: "not-json" }),
        idParams(seedLinkId),
      ),
      400,
    );
    await expectErrorEnvelope(
      "DELETE /links/:id hostile id",
      await deleteLinkRoute(req("/api/v1/links/-5", { method: "DELETE" }), idParams("-5")),
      400,
    );
    await expectErrorEnvelope(
      "PUT /links/reorder bad ids",
      await reorderLinksRoute(
        req("/api/v1/links/reorder", { method: "PUT", body: { ids: [] } }),
      ),
      400,
    );
    await expectErrorEnvelope(
      "POST /links/import bad envelope",
      await importRoute(req("/api/v1/links/import", { method: "POST", body: { items: "x" } })),
      400,
    );
    await expectErrorEnvelope(
      "GET /sections bad pageId",
      await listSections(req("/api/v1/sections?pageId=abc")),
      400,
    );
    await expectErrorEnvelope(
      "POST /sections bad body",
      await createSectionRoute(
        req("/api/v1/sections", { method: "POST", body: { pageId: "nope" } }),
      ),
      400,
    );
    await expectErrorEnvelope(
      "PUT /sections/:id bad id",
      await updateSectionRoute(
        req("/api/v1/sections/xyz", { method: "PUT", body: { title: "t" } }),
        idParams("xyz"),
      ),
      400,
    );
    await expectErrorEnvelope(
      "PUT /sections/reorder dup ids",
      await reorderSectionsRoute(
        req("/api/v1/sections/reorder", { method: "PUT", body: { ids: [1, 1] } }),
      ),
      400,
    );
    await expectErrorEnvelope(
      "PUT /profile bad body",
      await putProfileRoute(req("/api/v1/profile", { method: "PUT", body: { displayName: 42 } })),
      400,
    );
  });

  it("E.135: malformed JSON on PUT /profile is a 400 validation envelope (never 500)", async () => {
    const res = await putProfileRoute(
      req("/api/v1/profile", { method: "PUT", raw: '{"displayName": "unterminated' }),
    );
    expect(res.status).toBe(400); // parseJsonBody → null → typed 400, not the 500 catch
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
    expect(body.error.code).toBe("validation");
    expect(body.error.message).toBe("Request body must be a JSON object."); // tier A: API-authored
    expect(res.headers.get("x-ratelimit-limit")).toBeTruthy(); // rate headers ride the 400
  });

  it("404 not_found (unknown resources)", async () => {
    await expectErrorEnvelope(
      "GET /links/:id missing",
      await getLinkRoute(req("/api/v1/links/999999"), idParams(999999)),
      404,
    );
    await expectErrorEnvelope(
      "PUT /links/:id missing",
      await updateLinkRoute(
        req("/api/v1/links/999999", { method: "PUT", body: { title: "t" } }),
        idParams(999999),
      ),
      404,
    );
    await expectErrorEnvelope(
      "DELETE /links/:id missing",
      await deleteLinkRoute(req("/api/v1/links/999999", { method: "DELETE" }), idParams(999999)),
      404,
    );
    await expectErrorEnvelope(
      "GET /profile missing",
      await getProfileRoute(req("/api/v1/profile")),
      404,
    );
    // no profile row anywhere in this harness db (seeded? delete if present)
    db.delete(schema.profile).run();
    await expectErrorEnvelope(
      "PUT /sections/:id missing",
      await updateSectionRoute(
        req("/api/v1/sections/999999", { method: "PUT", body: { title: "t" } }),
        idParams(999999),
      ),
      404,
    );
    await expectErrorEnvelope(
      "DELETE /sections/:id missing",
      await deleteSectionRoute(req("/api/v1/sections/999999", { method: "DELETE" }), idParams(999999)),
      404,
    );
  });

  it("403 demo (EVERY mutating handler blocked, same envelope — full 10/10)", async () => {
    process.env.DEMO_MODE = "true";
    // covered by the 403 set in E.30's scope check: 4 of 10 handlers
    await expectErrorEnvelope(
      "POST /links demo",
      await createLinkRoute(
        req("/api/v1/links", { method: "POST", body: { title: "d", url: "https://d.example" } }),
      ),
      403,
    );
    await expectErrorEnvelope(
      "PUT /links/reorder demo",
      await reorderLinksRoute(
        req("/api/v1/links/reorder", { method: "PUT", body: { ids: [1] } }),
      ),
      403,
    );
    await expectErrorEnvelope(
      "POST /links/import demo",
      await importRoute(
        req("/api/v1/links/import", { method: "POST", body: { items: [{ title: "a", url: "https://a.example" }] } }),
      ),
      403,
    );
    await expectErrorEnvelope(
      "DELETE /sections/:id demo",
      await deleteSectionRoute(req("/api/v1/sections/1", { method: "DELETE" }), idParams(1)),
      403,
    );
    // the remaining 6 mutating handlers
    await expectErrorEnvelope(
      "PUT /links/:id demo",
      await updateLinkRoute(
        req(`/api/v1/links/${seedLinkId}`, { method: "PUT", body: { title: "t" } }),
        idParams(seedLinkId),
      ),
      403,
    );
    await expectErrorEnvelope(
      "DELETE /links/:id demo",
      await deleteLinkRoute(req(`/api/v1/links/${seedLinkId}`, { method: "DELETE" }), idParams(seedLinkId)),
      403,
    );
    await expectErrorEnvelope(
      "POST /sections demo",
      await createSectionRoute(
        req("/api/v1/sections", { method: "POST", body: { pageId, title: "s" } }),
      ),
      403,
    );
    await expectErrorEnvelope(
      "PUT /sections/:id demo",
      await updateSectionRoute(
        req("/api/v1/sections/1", { method: "PUT", body: { title: "t" } }),
        idParams(1),
      ),
      403,
    );
    await expectErrorEnvelope(
      "PUT /sections/reorder demo",
      await reorderSectionsRoute(
        req("/api/v1/sections/reorder", { method: "PUT", body: { ids: [1] } }),
      ),
      403,
    );
    await expectErrorEnvelope(
      "PUT /profile demo",
      await putProfileRoute(req("/api/v1/profile", { method: "PUT", body: { displayName: "x" } })),
      403,
    );
    // and the seed row survived every blocked attempt (demo data safety)
    expect(await getLink(seedLinkId)).toBeTruthy();
  });
});

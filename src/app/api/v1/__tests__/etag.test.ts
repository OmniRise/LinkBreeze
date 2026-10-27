/**
 * #4 E.8 — conditional GET roundtrips at the route level: GET /links and
 * GET /profile answer matching If-None-Match with empty 304s (ETag + rate
 * headers preserved), and any data change invalidates the validator.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink, db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET as listLinks, POST as createLinkRoute } from "@/app/api/v1/links/route";
import { GET as getProfileRoute } from "@/app/api/v1/profile/route";
import { GET as listSections } from "@/app/api/v1/sections/route";
import { GET as getAnalyticsRoute } from "@/app/api/v1/analytics/route";
import { createApiKey } from "@/server/api-keys";
import { createSection } from "@/server/queries";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function req(url: string, extraHeaders: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest(`http://localhost:3000${url}`, {
    headers: {
      authorization: ["Bearer", KEY].join(" "),
      "x-forwarded-for": `10.90.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      ...extraHeaders,
    },
  });
}

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage({ slug: "etag-page", title: "ETag Page" }).id;
  seedLink({ title: "ETag link", url: "https://etag.example", pageId, orderIndex: 0 });
});

describe("GET /api/v1/links — conditional responses", () => {
  it("200 carries ETag; replaying it yields an EMPTY 304 with the same ETag", async () => {
    const first = await listLinks(req("/api/v1/links"));
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const body = await first.json();
    expect(Array.isArray(body.data)).toBe(true);

    const replay = await listLinks(req("/api/v1/links", { "if-none-match": etag! }));
    expect(replay.status).toBe(304);
    expect(replay.headers.get("etag")).toBe(etag);
    expect(replay.headers.get("x-ratelimit-limit")).toBeTruthy(); // gate headers kept
    expect(replay.headers.get("cache-control")).toBe("no-store");
    const text = await replay.text();
    expect(text).toBe("");
  });

  it("stale or foreign ETags still get full 200s; * still means 304", async () => {
    for (const bad of ['"00000000000000000000000000000000"', 'W/"stale"', '"x", "y"']) {
      const res = await listLinks(req("/api/v1/links", { "if-none-match": bad }));
      expect(res.status, bad).toBe(200);
      expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    }
    // RFC 9110: `*` matches any current representation → 304 on an existing resource.
    const star = await listLinks(req("/api/v1/links", { "if-none-match": "*" }));
    expect(star.status).toBe(304);
  });

  it("a mutation invalidates the previous validator", async () => {
    const before = await listLinks(req("/api/v1/links"));
    const stale = before.headers.get("etag")!;

    const created = await createLinkRoute(
      new NextRequest("http://localhost:3000/api/v1/links", {
        method: "POST",
        headers: {
          authorization: ["Bearer", KEY].join(" "),
          "content-type": "application/json",
          "x-forwarded-for": "10.91.0.1",
        },
        body: JSON.stringify({
          title: "Post-etag link",
          url: "https://post-etag.example",
        }),
      }),
    );
    expect(created.status).toBe(201);

    const after = await listLinks(req("/api/v1/links", { "if-none-match": stale }));
    expect(after.status).toBe(200); // changed content → full body
    expect(after.headers.get("etag")).not.toBe(stale);
  });

  it("paginated responses are conditional too (meta is in the hash)", async () => {
    const first = await listLinks(req("/api/v1/links?limit=1"));
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;

    const replay = await listLinks(
      req("/api/v1/links?limit=1", { "if-none-match": etag }),
    );
    expect(replay.status).toBe(304);

    // Different page shape → different validator even for same data.
    const all = await listLinks(req("/api/v1/links"));
    expect(all.headers.get("etag")).not.toBe(etag);
  });
});

describe("GET /api/v1/profile — conditional responses", () => {
  it("roundtrips 200 → 304 until the profile changes", async () => {
    db.insert(schema.profile)
      .values({
        displayName: "Ada",
        bio: "Bio",
        badgeText: null,
        avatarUrl: null,
        socialLinks: "[]",
      })
      .run();

    const first = await getProfileRoute(req("/api/v1/profile"));
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;

    const replay = await getProfileRoute(
      req("/api/v1/profile", { "if-none-match": etag }),
    );
    expect(replay.status).toBe(304);
    expect((await replay.text())).toBe("");

    db.update(schema.profile)
      .set({ displayName: "Ada Lovelace" })
      .run();

    const changed = await getProfileRoute(
      req("/api/v1/profile", { "if-none-match": etag }),
    );
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
    expect((await changed.json()).data.displayName).toBe("Ada Lovelace");
  });
});

describe("E.15 conditional GET on remaining read endpoints", () => {
  it("GET /sections: ETag → 304; creating a section invalidates it", async () => {
    const section = await createSection({ pageId, title: "ETag section" });

    const first = await listSections(req("/api/v1/sections"));
    expect(first.status).toBe(200);
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);

    const replay = await listSections(
      req("/api/v1/sections", { "if-none-match": etag }),
    );
    expect(replay.status).toBe(304);
    expect(await replay.text()).toBe("");

    await createSection({ pageId, title: "ETag section 2" });
    const afterCreate = await listSections(
      req("/api/v1/sections", { "if-none-match": etag }),
    );
    expect(afterCreate.status).toBe(200);
    expect(afterCreate.headers.get("etag")).not.toBe(etag);

    // pageId-filtered lists are conditional too (different payload → different validator).
    const filtered = await listSections(req(`/api/v1/sections?pageId=${pageId}`));
    expect(filtered.headers.get("etag")).toBeTruthy();
    expect(filtered.status).toBe(200);
    void section;
  });

  it("GET /analytics: ETag covers metrics only — clock fields can't flap it", async () => {
    const a = await getAnalyticsRoute(req("/api/v1/analytics?range=7d"));
    expect(a.status).toBe(200);
    const etagA = a.headers.get("etag");
    const bodyA = await a.json();

    const b = await getAnalyticsRoute(req("/api/v1/analytics?range=7d"));
    const etagB = b.headers.get("etag");
    const bodyB = await b.json();

    // Same metrics → SAME validator even though exportedAt/since are fresh.
    expect(etagA).toBe(etagB);
    expect(bodyA.data.exportedAt).not.toBe(undefined);
    if (bodyA.data.exportedAt !== bodyB.data.exportedAt) {
      expect(etagA).toBe(etagB); // validator ignores the clock fields
    }

    const replay = await getAnalyticsRoute(
      req("/api/v1/analytics?range=7d", { "if-none-match": etagA! }),
    );
    expect(replay.status).toBe(304);
    expect(await replay.text()).toBe("");

    // A different range is a different representation.
    const other = await getAnalyticsRoute(req("/api/v1/analytics?range=30d"));
    expect(other.headers.get("etag")).not.toBe(etagA);
  });
});

describe("E.41 HEAD interplay (framework derives HEAD from GET)", () => {
  it("HEAD through the GET handler keeps ETag + rate headers, and 304s conditionally", async () => {
    // Next maps HEAD→GET and strips the BODY at the server layer (untestable
    // without a build — PROMPT bans it). At the handler boundary OUR contract
    // is the headers: they must flow for a HEAD-method request unchanged.
    const head = new NextRequest("http://localhost:3000/api/v1/links", {
      method: "HEAD",
      headers: {
        authorization: ["Bearer", KEY].join(" "),
        "x-forwarded-for": "10.250.0.1",
      },
    });
    const res = await listLinks(head);
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");

    // RFC 9110: conditional HEAD behaves like conditional GET → 304.
    const etag = res.headers.get("etag")!;
    const cond = new NextRequest("http://localhost:3000/api/v1/links", {
      method: "HEAD",
      headers: {
        authorization: ["Bearer", KEY].join(" "),
        "if-none-match": etag,
        "x-forwarded-for": "10.250.0.2",
      },
    });
    const res2 = await listLinks(cond);
    expect(res2.status).toBe(304);
    expect(res2.headers.get("etag")).toBe(etag);
    expect(await res2.text()).toBe("");
  });

  it("HEAD is NOT documented as its own operation (framework-synthesized; documenting it would break router drift)", async () => {
    const { buildOpenApiDocument } = await import("@/lib/openapi");
    const doc = buildOpenApiDocument() as {
      paths: Record<string, Record<string, unknown>>;
    };
    for (const methods of Object.values(doc.paths)) {
      expect(methods.head).toBeUndefined();
    }
  });
});

describe("E.57 sections views are query-scoped validators", () => {
  it("?pageId gets a different ETag than the full list; each replays its own 304, cross-replay does not", async () => {
    // Guarantee the subset differs: one section on ANOTHER page.
    const otherPage = seedPage({ slug: "etag-page-2", title: "ETag Page 2" }).id;
    await createSection({ pageId: otherPage, title: "Other page section" });

    const full = await listSections(req("/api/v1/sections"));
    const filtered = await listSections(req(`/api/v1/sections?pageId=${pageId}`));
    expect(full.status).toBe(200);
    expect(filtered.status).toBe(200);
    const etagFull = full.headers.get("etag")!;
    const etagFiltered = filtered.headers.get("etag")!;
    expect(etagFull).toMatch(/^"[0-9a-f]{32}"$/);
    expect(etagFiltered).toMatch(/^"[0-9a-f]{32}"$/);
    // Subset payload ≠ full payload → different representations, different validators.
    expect(etagFiltered).not.toBe(etagFull);

    // Each view replays ITS OWN validator with an empty 304.
    const replayFull = await listSections(
      req("/api/v1/sections", { "if-none-match": etagFull }),
    );
    expect(replayFull.status).toBe(304);
    expect(await replayFull.text()).toBe("");

    const replayFiltered = await listSections(
      req(`/api/v1/sections?pageId=${pageId}`, { "if-none-match": etagFiltered }),
    );
    expect(replayFiltered.status).toBe(304);

    // Cross-view isolation: the other representation's validator never 304s.
    const crossA = await listSections(
      req(`/api/v1/sections?pageId=${pageId}`, { "if-none-match": etagFull }),
    );
    expect(crossA.status).toBe(200);
    const crossB = await listSections(
      req("/api/v1/sections", { "if-none-match": etagFiltered }),
    );
    expect(crossB.status).toBe(200);
    // and both still carry their own validators after the 200s
    expect(crossA.headers.get("etag")).toBe(etagFiltered);
    expect(crossB.headers.get("etag")).toBe(etagFull);
  });
});

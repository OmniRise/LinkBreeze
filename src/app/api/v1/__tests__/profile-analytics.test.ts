/**
 * #4 — /api/v1/profile + /api/v1/analytics route tests, plus the Phase 2
 * security battery: every endpoint gates on the key (IDOR surface = single
 * user today, so the key gates everything), the key/hash never leaks into
 * any response, oversized bodies are refused, rate limiting surfaces at the
 * ROUTE level with Retry-After, and logError strips secret-ish meta.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/favicon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/favicon")>()),
  fetchAndCacheFavicon: vi.fn(async () => "https://cdn.example/icon.png"),
}));

import { GET as getProfileRoute, PUT as putProfileRoute } from "@/app/api/v1/profile/route";
import { GET as getAnalyticsRoute } from "@/app/api/v1/analytics/route";
import { GET as listLinksRoute } from "@/app/api/v1/links/route";
import { POST as createLinkRoute } from "@/app/api/v1/links/route";
import { PUT as updateLinkRoute } from "@/app/api/v1/links/[id]/route";
import { DELETE as deleteLinkRoute } from "@/app/api/v1/links/[id]/route";
import { PUT as reorderRoute } from "@/app/api/v1/links/reorder/route";
import { createApiKey, getApiKeyRecord } from "@/server/api-keys";
import { logError } from "@/lib/errors";

let KEY = "";
let ipCounter = 0;

function req(
  url: string,
  opts: { method?: string; auth?: boolean; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "x-forwarded-for": opts.headers?.["x-forwarded-for"] ??
      `10.30.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
    ...(opts.headers ?? {}),
  };
  if (opts.auth !== false) headers.authorization = `Bearer ${KEY}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000${url}`, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const idParams = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  KEY = (await createApiKey()).key;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("GET/PUT /api/v1/profile", () => {
  it("401s without a key; 404s when no profile exists yet", async () => {
    const denied = await getProfileRoute(req("/api/v1/profile", { auth: false }));
    expect(denied.status).toBe(401);

    const missing = await getProfileRoute(req("/api/v1/profile"));
    expect(missing.status).toBe(404);
  });

  it("returns the profile with socialLinks parsed as an ARRAY", async () => {
    db.insert(schema.profile)
      .values({
        displayName: "Ada",
        bio: "Bio text",
        badgeText: null,
        avatarUrl: null,
        socialLinks: JSON.stringify([{ platform: "github", url: "https://github.com/ada" }]),
      })
      .run();

    const res = await getProfileRoute(req("/api/v1/profile"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.displayName).toBe("Ada");
    expect(body.data.socialLinks).toEqual([{ platform: "github", url: "https://github.com/ada" }]);
  });

  it("PUT updates only present keys through the shared schema", async () => {
    const res = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: {
          bio: "New bio",
          socialLinks: [
            { platform: "youtube", url: "https://youtube.com/@ada" },
            { platform: "telegram", url: "https://t.me/ada" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.displayName).toBe("Ada"); // untouched
    expect(body.data.bio).toBe("New bio");
    expect(body.data.socialLinks).toHaveLength(2);

    const row = db.select().from(schema.profile).all()[0];
    expect(row.bio).toBe("New bio");
    // Stored in the action's wire format (JSON string) — same column contract
    expect(JSON.parse(row.socialLinks)).toHaveLength(2);
  });

  it("rejects unknown platforms and blank display names (same allowlist)", async () => {
    const bad = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: { socialLinks: [{ platform: "myspace", url: "https://myspace.com/x" }] },
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("validation");

    const blank = await putProfileRoute(
      req("/api/v1/profile", { method: "PUT", body: { displayName: "" } }),
    );
    expect(blank.status).toBe(400);
  });

  it("strips mass-assignment fields and blocks demo writes", async () => {
    const before = db.select().from(schema.profile).all()[0];
    const res = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: { id: 999, userId: 3, createdAt: "2000", displayName: "Ada Lovelace" },
      }),
    );
    expect(res.status).toBe(200);
    const after = db.select().from(schema.profile).all()[0];
    expect(after.id).toBe(before.id);
    expect(after.displayName).toBe("Ada Lovelace"); // only the real field wrote

    process.env.DEMO_MODE = "true";
    const demo = await putProfileRoute(
      req("/api/v1/profile", { method: "PUT", body: { bio: "nope" } }),
    );
    expect(demo.status).toBe(403);
    expect((await demo.json()).error.code).toBe("demo");
  });
});

describe("GET /api/v1/analytics", () => {
  it("401s without a key and returns the roadmap payload shape with one", async () => {
    const denied = await getAnalyticsRoute(req("/api/v1/analytics", { auth: false }));
    expect(denied.status).toBe(401);

    const res = await getAnalyticsRoute(req("/api/v1/analytics?range=30d"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.range).toBe("30d");
    expect(body.data.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.retentionDays).toBe(90); // default retention
    expect(body.data.totalViews).toBe(0);
    expect(body.data.totalClicks).toBe(0);
    expect(Array.isArray(body.data.topLinks)).toBe(true);
    expect(Array.isArray(body.data.viewsPerDay)).toBe(true);
  });

  it("falls back to 7d for unknown ranges (retention-bounded)", async () => {
    const res = await getAnalyticsRoute(req("/api/v1/analytics?range=all"));
    expect((await res.json()).data.range).toBe("7d");
  });
});

describe("security battery (#4 /2.4)", () => {
  it("every v1 endpoint 401s without a key (key gates everything)", async () => {
    const calls: Array<Promise<Response>> = [
      listLinksRoute(req("/api/v1/links", { auth: false })),
      createLinkRoute(
        req("/api/v1/links", { method: "POST", auth: false, body: { title: "x", url: "https://x.example" } }),
      ),
      updateLinkRoute(req("/api/v1/links/1", { method: "PUT", auth: false, body: { title: "x" } }), idParams(1)),
      deleteLinkRoute(req("/api/v1/links/1", { method: "DELETE", auth: false }), idParams(1)),
      reorderRoute(req("/api/v1/links/reorder", { method: "PUT", auth: false, body: { ids: [1] } })),
      getProfileRoute(req("/api/v1/profile", { auth: false })),
      putProfileRoute(req("/api/v1/profile", { method: "PUT", auth: false, body: { bio: "x" } })),
      getAnalyticsRoute(req("/api/v1/analytics", { auth: false })),
    ];
    for (const call of calls) {
      const res = await call;
      expect(res.status).toBe(401);
    }
  });

  it("the plaintext key and its stored hash never appear in any response", async () => {
    const record = await getApiKeyRecord();
    expect(record).not.toBeNull();
    const leakNeedles = [KEY, record!.hash];

    const responses = await Promise.all([
      listLinksRoute(req("/api/v1/links")),
      getProfileRoute(req("/api/v1/profile")),
      getAnalyticsRoute(req("/api/v1/analytics")),
      createLinkRoute(
        req("/api/v1/links", { method: "POST", body: { title: "Leak check", url: "https://leak.example" } }),
      ),
      listLinksRoute(req("/api/v1/links", { auth: false })), // 401 body
      createLinkRoute(
        req("/api/v1/links", { method: "POST", body: { title: "", url: "nope" } }),
      ), // 400 body
    ]);
    for (const res of responses) {
      const text = JSON.stringify(await res.clone().json());
      for (const needle of leakNeedles) {
        expect(text).not.toContain(needle);
      }
      // Headers too (rate-limit buckets derive from the hash prefix only)
      for (const [, value] of res.headers.entries()) {
        for (const needle of leakNeedles) expect(value).not.toContain(needle);
      }
    }
  });

  it("oversized declared bodies get 413 before parsing", async () => {
    const res = await putProfileRoute(
      req("/api/v1/profile", {
        method: "PUT",
        body: { bio: "x" },
        headers: { "content-length": String(70 * 1024) },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("route-level burst trips the per-key limiter with Retry-After", async () => {
    let saw429: Response | null = null;
    for (let i = 0; i < 130; i++) {
      const res = await getAnalyticsRoute(
        req("/api/v1/analytics", {
          headers: { "x-forwarded-for": `10.99.${Math.floor(i / 250)}.${i % 250}` },
        }),
      );
      if (res.status === 429) {
        saw429 = res;
        break;
      }
    }
    expect(saw429).not.toBeNull();
    expect(Number(saw429!.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    const body = await saw429!.json();
    expect(body.error.code).toBe("rate_limit");
  });

  it("logError strips secret-ish meta keys before printing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logError("unit-test", new Error("boom"), {
        apiKeyHash: "deadbeefcafe",
        authorization: "Bearer lbk_secret",
        title: "safe-title",
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const printed = String(spy.mock.calls[0][0]);
      expect(printed).not.toContain("deadbeefcafe");
      expect(printed).not.toContain("lbk_secret");
      expect(printed).toContain("safe-title");
    } finally {
      spy.mockRestore();
    }
  });
});

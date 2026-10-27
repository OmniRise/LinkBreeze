/**
 * #4 E.17 — surface hygiene: NO response body from /api/v1 may ever carry
 * user / session / 2FA / settings-KV fields. The API key gates public-site
 * CONTENT only; this test fails the build if a future endpoint starts
 * serializing a row shape that includes account or secret material.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import "../../../../server/queries/__tests__/integration-setup";
import { seedPage, seedLink, db } from "../../../../server/queries/__tests__/integration-setup";
import * as schema from "@/db/schema";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/favicon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/favicon")>()),
  fetchAndCacheFavicon: vi.fn(async () => "https://cdn.example/icon.png"),
}));
vi.mock("@/lib/og-fetcher", () => ({
  fetchOgData: vi.fn(async () => ({ description: null, imageUrl: null })),
}));

import { GET as listLinks, POST as createLinkRoute } from "@/app/api/v1/links/route";
import { GET as getLinkRoute, PUT as updateLinkRoute } from "@/app/api/v1/links/[id]/route";
import { POST as importRoute } from "@/app/api/v1/links/import/route";
import { PUT as reorderLinksRoute } from "@/app/api/v1/links/reorder/route";
import { GET as listSections, POST as createSectionRoute } from "@/app/api/v1/sections/route";
import { PUT as reorderSectionsRoute } from "@/app/api/v1/sections/reorder/route";
import { GET as getProfileRoute, PUT as putProfileRoute } from "@/app/api/v1/profile/route";
import { GET as getAnalyticsRoute } from "@/app/api/v1/analytics/route";
import { GET as getOpenapiRoute } from "@/app/api/v1/openapi/route";
import { createApiKey } from "@/server/api-keys";

let KEY = "";
let pageId = 0;
let ipCounter = 0;

function req(url: string, init: { method?: string; body?: unknown } = {}): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    authorization: ["Bearer", KEY].join(" "),
    "x-forwarded-for": `10.110.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

/**
 * Field names that must NEVER appear as a JSON key in any /api/v1 response
 * (account, session, 2FA, and settings-KV material).
 */
const FORBIDDEN_KEYS = new Set(
  [
    "username",
    "password",
    "passwordhash",
    "email",
    "role",
    "secret",
    "token",
    "session",
    "sessionid",
    "sessiontoken",
    "cookie",
    "authorization",
    "apikeyhash",
    "apikeyprefix",
    "apikeycreatedat",
    "apikeylastusedat",
    "prevhash",
    "prevexpiresat",
    "twofactor",
    "totpsecret",
    "totpenabled",
    "recoverycodes",
    "oidc",
    "oidcprovider",
    "oidcsubject",
    "hash",
  ].map((k) => k.toLowerCase()),
);

const collected: Array<{ label: string; status: number; body: unknown }> = [];

async function collect(label: string, res: Response): Promise<void> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  collected.push({ label, status: res.status, body });
}

beforeAll(async () => {
  KEY = (await createApiKey()).key;
  pageId = seedPage({ slug: "hygiene-page", title: "Hygiene Page" }).id;
  seedLink({ title: "Hygiene link", url: "https://hygiene.example", pageId, orderIndex: 0 });
  db.insert(schema.profile)
    .values({
      displayName: "Hygiene",
      bio: "Bio",
      badgeText: null,
      avatarUrl: null,
      socialLinks: JSON.stringify([{ platform: "github", url: "https://github.com/h" }]),
    })
    .run();
});

describe("surface hygiene (E.17)", () => {
  it("collects representative success bodies across the whole surface", async () => {
    await collect("GET /links", await listLinks(req("/api/v1/links")));
    await collect("GET /links?limit=2", await listLinks(req("/api/v1/links?limit=2&fields=title,url")));

    const seed = db.select().from(schema.links).all()[0];
    await collect("GET /links/:id", await getLinkRoute(req(`/api/v1/links/${seed.id}`), {
      params: Promise.resolve({ id: String(seed.id) }),
    }));
    await collect(
      "POST /links",
      await createLinkRoute(
        req("/api/v1/links", { method: "POST", body: { title: "Hygiene new", url: "https://new.example" } }),
      ),
    );
    await collect(
      "PUT /links/:id",
      await updateLinkRoute(
        req(`/api/v1/links/${seed.id}`, { method: "PUT", body: { title: "Hygiene v2" } }),
        { params: Promise.resolve({ id: String(seed.id) }) },
      ),
    );
    await collect(
      "PUT /links/reorder",
      await reorderLinksRoute(req("/api/v1/links/reorder", { method: "PUT", body: { ids: [seed.id] } })),
    );
    await collect(
      "POST /links/import",
      await importRoute(
        req("/api/v1/links/import", {
          method: "POST",
          body: { items: [{ title: "Bulk hygiene", url: "https://bulk-hygiene.example" }] },
        }),
      ),
    );
    await collect("GET /sections", await listSections(req("/api/v1/sections")));
    await collect(
      "POST /sections",
      await createSectionRoute(
        req("/api/v1/sections", { method: "POST", body: { pageId, title: "Hygiene section" } }),
      ),
    );
    const section = db.select().from(schema.linkSections).all()[0];
    await collect(
      "PUT /sections/reorder",
      await reorderSectionsRoute(
        req("/api/v1/sections/reorder", { method: "PUT", body: { ids: [section.id] } }),
      ),
    );
    await collect("GET /profile", await getProfileRoute(req("/api/v1/profile")));
    await collect(
      "PUT /profile",
      await putProfileRoute(
        req("/api/v1/profile", { method: "PUT", body: { displayName: "Hygiene 2" } }),
      ),
    );
    await collect("GET /analytics", await getAnalyticsRoute(req("/api/v1/analytics?range=30d")));
    await collect("GET /openapi", await getOpenapiRoute(req("/api/v1/openapi")));

    // The scan must actually have material to look at — an empty scan would
    // let a broken collector pass vacuously.
    const ok = collected.filter((c) => c.status >= 200 && c.status < 300);
    expect(ok.length).toBeGreaterThanOrEqual(12);
    expect(collected.every((c) => c.status < 500)).toBe(true);
  });

  it("NO collected body contains a user/session/secret field name", () => {
    const offenders: string[] = [];
    const walk = (node: unknown, label: string): void => {
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, label));
        return;
      }
      if (node !== null && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          if (FORBIDDEN_KEYS.has(k.toLowerCase())) offenders.push(`${label}: ${k}`);
          walk(v, label);
        }
      }
    };
    for (const c of collected) {
      if (c.status >= 200 && c.status < 300) walk(c.body, c.label);
    }
    expect(offenders).toEqual([]);
  });

  it("NO collected body leaks the live API key itself", () => {
    for (const c of collected) {
      const raw = JSON.stringify(c.body ?? null);
      expect(raw.includes(KEY), `${c.label} leaks the key`).toBe(false);
      // nor the stored digest / grace fields (KV material)
      expect(raw.includes("apiKeyHash"), `${c.label} mentions apiKeyHash`).toBe(false);
    }
  });

  it("E.134: every GET route is conditional — plain apiOk on a GET = spec/behavior drift", () => {
    const root = joinPath(process.cwd(), "src/app/api/v1");
    // Meta document routes answer with Cache-Control only (deliberate: E.76
    // docs session path, openapi has no validator) — the only GET exceptions.
    const ALLOWLIST = new Set([
      joinPath(root, "docs", "route.ts"),
      joinPath(root, "openapi", "route.ts"),
      joinPath(root, "openapi.json", "route.ts"),
    ]);

    const offenders: string[] = [];
    let seenGets = 0;
    for (const rel of readdirSync(root, { recursive: true }) as string[]) {
      if (!rel.endsWith("route.ts")) continue;
      const file = joinPath(root, rel);
      const src = readFileSync(file, "utf8");
      if (!/export async function GET\b/.test(src)) continue;
      seenGets += 1;
      if (ALLOWLIST.has(file)) continue;
      if (!src.includes("apiOkConditional(")) offenders.push(rel);
    }
    expect(seenGets).toBeGreaterThanOrEqual(7); // census has material
    expect(offenders).toEqual([]);
  });
});

/**
 * Search-engine visibility (#94): robots.txt, sitemap.xml and the public
 * page's noindex must all key off the same `searchEngineHidden` setting.
 *
 * Uses the shared sql.js in-memory setup via @/server/queries; the routes
 * are exercised through their handler bodies with mocked next/headers.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// Route modules read headers() for the origin — one mock for all tests.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () =>
    new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "lb-test.example.com",
    }),
  ),
}));

// MUST be the first non-vitest import: it registers the sql.js vi.mock("@/db").
// Any module imported before it (@/app/robots, the sitemap route, @/server/queries)
// binds the REAL better-sqlite3 file DB — works locally against the dev DB but
// dies in CI ("no such table: settings") where data/linkbreeze.db starts empty.
import "@/server/queries/__tests__/integration-setup";

import robotsDefault from "@/app/robots";
import { GET as sitemapGET } from "@/app/sitemap.xml/route";
import { updateSetting, getSetting } from "@/server/queries";

const robots = robotsDefault as unknown as () => Promise<{
  rules: { disallow: string[]; allow: string };
  sitemap?: string;
  host: string;
}>;

describe("#94 search-engine visibility", () => {
  beforeAll(async () => {
    await updateSetting("searchEngineHidden", "false");
  });

  it("default (visible): sitemap advertises the page, robots points at the sitemap", async () => {
    const r = await robots();
    // Origin comes from BASE_URL or forwarded headers — assert shape, not host.
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
    // Admin routes always disallowed; the public page never is.
    expect(r.rules.disallow).toContain("/settings");

    const res = await sitemapGET();
    const xml = await res.text();
    expect(xml).toContain("<loc>");
    expect(xml).toMatch(/<loc>[^<]*\/[^<]*<\/loc>/);
  });

  it("hidden: robots keeps admin disallows, drops the Sitemap directive, never disallows the page", async () => {
    await updateSetting("searchEngineHidden", "true");
    const r = await robots();
    expect(r.sitemap).toBeUndefined();
    expect(r.rules.disallow).toEqual([
      "/login", "/setup", "/dashboard", "/links", "/profile", "/theme", "/settings", "/pages", "/domains", "/accounts", "/audit", "/api/",
    ]);
    expect(r.rules.disallow).not.toContain("/");
  });

  it("hidden: sitemap returns an empty urlset (no-store comes from next.config header rule)", async () => {
    const res = await sitemapGET();
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).not.toContain("<loc>");
  });

  it("flipping back to visible restores the sitemap entry", async () => {
    await updateSetting("searchEngineHidden", "false");
    const res = await sitemapGET();
    const xml = await res.text();
    expect(xml).toContain("<loc>");
    expect((await getSetting("searchEngineHidden")) ?? "false").toBe("false");
  });

  it("hidden: updateSettings persists 'true' and the value round-trips", async () => {
    await updateSetting("searchEngineHidden", "true");
    expect(await getSetting("searchEngineHidden")).toBe("true");
    await updateSetting("searchEngineHidden", "false");
    expect((await getSetting("searchEngineHidden")) ?? "false").toBe("false");
  });
});

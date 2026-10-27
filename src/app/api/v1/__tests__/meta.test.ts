/**
 * #4 — meta routes: /api/v1/openapi(.json) serve the spec behind the same
 * Bearer auth; /api/v1/docs serves the HTML reference to a key holder OR an
 * admin session (browsers cannot attach Authorization headers), and to
 * nobody else. No DB here — the KV layer is mocked with one static record.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { generateApiKey, hashApiKey } from "@/lib/api-key";

const KEY = generateApiKey().key;
const RECORD = {
  hash: hashApiKey(KEY),
  prefix: "lbk_testkey",
  createdAt: new Date().toISOString(),
  lastUsedAt: null as string | null,
};

const mocks = vi.hoisted(() => ({
  getApiKeyRecord: vi.fn(),
  recordApiKeyUsed: vi.fn(async () => {}),
  getSession: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("@/server/api-keys", () => ({
  getApiKeyRecord: mocks.getApiKeyRecord,
  recordApiKeyUsed: mocks.recordApiKeyUsed,
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));

import { GET as getOpenApi } from "@/app/api/v1/openapi/route";
import { GET as getOpenApiJson } from "@/app/api/v1/openapi.json/route";
import { GET as getDocs } from "@/app/api/v1/docs/route";

let ipCounter = 0;

function req(auth: boolean): NextRequest {
  ipCounter += 1;
  const headers: Record<string, string> = {
    "x-forwarded-for": `10.40.0.${(ipCounter % 250) + 1}`,
  };
  if (auth) headers.authorization = `Bearer ${KEY}`;
  return new NextRequest("http://localhost:3000/api/v1/openapi", { headers });
}

beforeEach(() => {
  mocks.getApiKeyRecord.mockResolvedValue({ ...RECORD });
  mocks.getSession.mockResolvedValue(null);
});

describe("GET /api/v1/openapi + /api/v1/openapi.json", () => {
  it("401s anonymously and serves the 3.1 document with a key", async () => {
    const denied = await getOpenApi(req(false));
    expect(denied.status).toBe(401);

    const res = await getOpenApi(req(true));
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/api/v1/links");
  });

  it("the dotted alias serves the identical document", async () => {
    const a = await getOpenApi(req(true));
    const b = await getOpenApiJson(req(true));
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
  });
});

describe("GET /api/v1/docs", () => {
  it("401s for anonymous visitors (no HTML leaks)", async () => {
    const res = await getDocs(req(false));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("<html");
  });

  it("serves HTML to a Bearer key holder", async () => {
    const res = await getDocs(req(true));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("/api/v1/links");
    expect(html).toContain("LinkBreeze API");
    expect(html).toContain("noindex");
  });

  it("serves HTML to an admin SESSION (browser viewing path)", async () => {
    mocks.getSession.mockResolvedValue({
      userId: 1,
      username: "admin",
      exp: Date.now() + 60000,
      pv: 1,
    });
    const res = await getDocs(req(false));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Endpoints");
  });

  it("E.20: never echoes auth material or KV field names in the HTML", async () => {
    const res = await getDocs(req(true));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.includes(KEY)).toBe(false); // the bearer token it just accepted
    expect(html.includes(hashApiKey(KEY))).toBe(false); // its stored digest
    expect(html).not.toContain("apiKeyHash");
    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain("username");
  });

  it("E.20: reflected input never reaches the page (XSS inert) and no scripts run", async () => {
    ipCounter += 1;
    const hostile = new NextRequest(
      "http://localhost:3000/api/v1/docs?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E&name=%22onload%3Dalert(2)",
      {
        headers: {
          authorization: ["Bearer", KEY].join(" "),
          "x-forwarded-for": `10.40.0.${(ipCounter % 250) + 1}`,
        },
      },
    );
    const res = await getDocs(hostile);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("alert(2)");
    expect(html.toLowerCase()).not.toContain("javascript:");
    // The page is pure HTML/CSS — no executable surface at all.
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onload=");
  });
});

describe("E.54 docs HTML hand-review (render layer parity with the spec)", () => {
  it("renders the full endpoint table (18 ops + header), spec description, and shell-safe curl hint", async () => {
    const res = await getDocs(req(true));
    expect(res.status).toBe(200);
    const html = await res.text();

    // One <tr> per operation (18: links 7, sections 5, profile 2,
    // analytics 1, openapi.json 1, openapi alias 1, docs 1) + 1 header row.
    const rows = (html.match(/<tr>/g) ?? []).length;
    expect(rows).toBe(19);

    for (const p of [
      "/api/v1/links",
      "/api/v1/links/{id}",
      "/api/v1/links/reorder",
      "/api/v1/links/import",
      "/api/v1/sections",
      "/api/v1/sections/{id}",
      "/api/v1/profile",
      "/api/v1/analytics",
      "/api/v1/openapi.json",
      "/api/v1/docs",
    ]) {
      expect(html, p).toContain(p);
    }

    // info.description renders into the page (E.36/E.51 additions visible).
    expect(html).toContain("If-None-Match");
    expect(html).toContain("X-RateLimit-");
    expect(html).toContain("additive");

    // Auth hint uses the cookbook's shell-safe idiom; the page never shows
    // an inline auth-header literal to copy-paste wrong.
    expect(html).toContain("--oauth2-bearer");
    expect(html).toContain("$LB_API_KEY");
    expect(html).not.toContain("Authorization: Bearer");
  });
});

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
});

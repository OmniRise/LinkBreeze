/**
 * #4 — /api/v1 gate: every auth reject case returns the SAME 401 envelope,
 * rate limits fire (per-key and pre-auth per-IP), demo mode blocks mutations,
 * oversized bodies are rejected before parsing.
 *
 * Unit-style: @/server/api-keys is mocked (the KV roundtrip through the real
 * queries layer is covered by the sql.js route tests in api/v1/__tests__/).
 * rateLimit is the REAL module — unique per-test IP/hash isolation below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { generateApiKey, hashApiKey } from "@/lib/api-key";

const mocks = vi.hoisted(() => ({
  getApiKeyRecord: vi.fn(),
  recordApiKeyUsed: vi.fn(async () => {}),
}));
vi.mock("@/server/api-keys", () => ({
  getApiKeyRecord: mocks.getApiKeyRecord,
  recordApiKeyUsed: mocks.recordApiKeyUsed,
}));

import { apiGate, API_KEY_RATE_LIMIT, API_IP_RATE_LIMIT } from "@/server/api-auth";

const KEY = generateApiKey();
const RECORD = {
  hash: hashApiKey(KEY.key),
  prefix: "lbk_testkey",
  createdAt: new Date().toISOString(),
  lastUsedAt: null as string | null,
};

let ipCounter = 0;
function makeRequest(
  headers: Record<string, string> = {},
  opts: { ip?: string; method?: string; body?: string } = {},
) {
  ipCounter += 1;
  return new NextRequest("http://localhost:3000/api/v1/links", {
    method: opts.method ?? "GET",
    headers: {
      "x-forwarded-for": opts.ip ?? `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      ...headers,
    },
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
}

beforeEach(() => {
  mocks.getApiKeyRecord.mockResolvedValue({ ...RECORD });
  mocks.recordApiKeyUsed.mockClear();
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe("apiGate — auth rejects (consistent 401 envelope)", () => {
  const unauthorizedBody = {
    error: { code: "unauthorized", message: "Missing or invalid API key." },
  };

  it("rejects a missing header", async () => {
    const gate = await apiGate(makeRequest());
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      expect(await gate.response.json()).toEqual(unauthorizedBody);
      expect(gate.response.headers.get("www-authenticate")).toBe("Bearer");
    }
  });

  it("rejects malformed headers with the IDENTICAL body (no oracle)", async () => {
    const cases = [
      "Basic dXNlcjpwdw==",
      "Bearer",
      "Bearer ",
      "Token lbk_x",
      "lbk_plain",
      generateApiKey().key + " ",
    ];
    const bodies: string[] = [];
    for (const value of cases) {
      const gate = await apiGate(makeRequest({ authorization: value }));
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.response.status).toBe(401);
        bodies.push(JSON.stringify(await gate.response.json()));
      }
    }
    // Every malformed form is byte-identical to every other.
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual(unauthorizedBody);
  });

  it("rejects a well-shaped but unknown key with the SAME body", async () => {
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${generateApiKey().key}` }),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      expect(await gate.response.json()).toEqual(unauthorizedBody);
    }
  });

  it("rejects every key when none is configured (revoked state)", async () => {
    mocks.getApiKeyRecord.mockResolvedValue(null);
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${KEY.key}` }),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
    expect(mocks.recordApiKeyUsed).not.toHaveBeenCalled();
  });

  it("accepts the configured key and attaches the api context", async () => {
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${KEY.key}` }),
    );
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.ctx.keyHash).toBe(RECORD.hash);
      expect(gate.rateHeaders["X-RateLimit-Limit"]).toBe(
        String(API_KEY_RATE_LIMIT.limit),
      );
      expect(Number(gate.rateHeaders["X-RateLimit-Remaining"])).toBeLessThan(
        API_KEY_RATE_LIMIT.limit,
      );
    }
    expect(mocks.recordApiKeyUsed).toHaveBeenCalledWith(null);
  });
});

describe("apiGate — body cap + demo guard", () => {
  it("413s oversized declared bodies on mutating routes", async () => {
    const gate = await apiGate(
      makeRequest(
        { authorization: `Bearer ${KEY.key}`, "content-length": String(70 * 1024) },
        { method: "POST", body: "{}" },
      ),
      { mutating: true },
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(413);
      expect((await gate.response.json()).error.code).toBe("validation");
    }
  });

  it("passes reads in demo mode but 403s mutations", async () => {
    process.env.DEMO_MODE = "true";
    const read = await apiGate(
      makeRequest({ authorization: `Bearer ${KEY.key}` }),
    );
    expect(read.ok).toBe(true);

    const write = await apiGate(
      makeRequest({ authorization: `Bearer ${KEY.key}` }, { method: "POST" }),
      { mutating: true },
    );
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.response.status).toBe(403);
      const body = await write.response.json();
      expect(body.error.code).toBe("demo");
    }
  });
});

describe("apiGate — E.2 rotation grace", () => {
  const OLD = generateApiKey();
  const NEW = generateApiKey();
  const graceRecord = (expiresAt: number | null) => ({
    hash: hashApiKey(NEW.key),
    prefix: "lbk_testkey",
    createdAt: new Date().toISOString(),
    lastUsedAt: null as string | null,
    prevHash: hashApiKey(OLD.key),
    prevExpiresAt: expiresAt,
  });

  it("the previous key authenticates inside its grace window", async () => {
    mocks.getApiKeyRecord.mockResolvedValue(graceRecord(Date.now() + 3_600_000));
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${OLD.key}` }),
    );
    expect(gate.ok).toBe(true);
  });

  it("the previous key is a 401 once the window closes", async () => {
    mocks.getApiKeyRecord.mockResolvedValue(graceRecord(Date.now() - 1));
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${OLD.key}` }),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("the NEW key works regardless of grace state", async () => {
    mocks.getApiKeyRecord.mockResolvedValue(graceRecord(Date.now() - 1));
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${NEW.key}` }),
    );
    expect(gate.ok).toBe(true);
  });

  it("a corrupted future expiry with a null hash never authenticates the old key", async () => {
    mocks.getApiKeyRecord.mockResolvedValue({
      ...graceRecord(Date.now() + 3_600_000),
      prevHash: null,
    });
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${OLD.key}` }),
    );
    expect(gate.ok).toBe(false);
  });
});

describe("apiGate — rate limiting", () => {
  it("429s with Retry-After once the per-key budget is exhausted", async () => {
    const gate = await apiGate(
      makeRequest({ authorization: `Bearer ${KEY.key}` }),
    );
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;

    // Burn the remainder of this key's window.
    const headers = new Headers({ authorization: `Bearer ${KEY.key}` });
    let lastOk = true;
    for (let i = 0; i < API_KEY_RATE_LIMIT.limit; i++) {
      const res = await apiGate(
        new NextRequest("http://localhost:3000/api/v1/links", {
          headers: {
            ...Object.fromEntries(headers.entries()),
            "x-forwarded-for": `10.9.${Math.floor(i / 250)}.${i % 250}`,
          },
        }),
      );
      lastOk = res.ok;
      if (!res.ok) {
        expect(res.response.status).toBe(429);
        const body = await res.response.json();
        expect(body.error.code).toBe("rate_limit");
        const retryAfter = Number(res.response.headers.get("retry-after"));
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(res.response.headers.get("x-ratelimit-limit")).toBe(
          String(API_KEY_RATE_LIMIT.limit),
        );
        return;
      }
    }
    expect(lastOk).toBe(false); // loop must have tripped the limiter
  });

  it("rate-limits unknown-key traffic per IP BEFORE the key lookup", async () => {
    const ip = `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    let saw429 = false;
    for (let i = 0; i < API_IP_RATE_LIMIT.limit + 2; i++) {
      const gate = await apiGate(
        makeRequest(
          { authorization: `Bearer ${generateApiKey().key}` },
          { ip },
        ),
      );
      if (!gate.ok) {
        // Unknown keys 401 past the limiter — only the 429 matters here.
        if (gate.response.status === 429) {
          saw429 = true;
          break;
        }
        expect(gate.response.status).toBe(401);
      }
    }
    expect(saw429).toBe(true);
    // The pre-auth limiter fires WITHOUT the key lookup being consulted 60×:
    // getApiKeyRecord ran at most once per accepted request, never past 429.
    expect(mocks.getApiKeyRecord.mock.calls.length).toBeLessThanOrEqual(
      API_IP_RATE_LIMIT.limit,
    );
  });
});

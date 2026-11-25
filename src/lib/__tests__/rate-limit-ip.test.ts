import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * clientIp — the one rate-limit/audit identity (security audit CD-5/PS-2).
 * X-Forwarded-For is client-controlled on a direct bind, so trust is an
 * explicit LINKBREEZE_TRUST_X_FORWARDED_FOR env decision, never a header default.
 */
const MODULE = "@/lib/rate-limit-ip";

async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("LINKBREEZE_TRUST_X_FORWARDED_FOR", env.LINKBREEZE_TRUST_X_FORWARDED_FOR ?? "");
  const mod = await import(MODULE);
  return mod.clientIp;
}

function h(xff?: string): Headers {
  const headers = new Headers();
  if (xff !== undefined) headers.set("x-forwarded-for", xff);
  return headers;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("clientIp — LINKBREEZE_TRUST_X_FORWARDED_FOR=false (default, direct bind)", () => {
  it("returns the shared untrusted key no matter what the header says", async () => {
    const clientIp = await load({});
    expect(clientIp(h("9.9.9.9"))).toBe("direct");
    expect(clientIp(h("1.1.1.1, 2.2.2.2, 3.3.3.3"))).toBe("direct");
    expect(clientIp(h())).toBe("direct");
  });
});

describe("clientIp — LINKBREEZE_TRUST_X_FORWARDED_FOR=true (trusted proxy overwrites/appends)", () => {
  it("uses the LAST hop (rightmost-untrusted read)", async () => {
    const clientIp = await load({ LINKBREEZE_TRUST_X_FORWARDED_FOR: "true" });
    expect(clientIp(h("203.0.113.9, 10.0.0.2"))).toBe("10.0.0.2");
    expect(clientIp(h("203.0.113.9"))).toBe("203.0.113.9");
  });

  it("trims whitespace around hops", async () => {
    const clientIp = await load({ LINKBREEZE_TRUST_X_FORWARDED_FOR: "true" });
    expect(clientIp(h("203.0.113.9 , 10.0.0.2"))).toBe("10.0.0.2");
  });

  it("falls back to the shared key when the header is absent or empty", async () => {
    const clientIp = await load({ LINKBREEZE_TRUST_X_FORWARDED_FOR: "true" });
    expect(clientIp(h())).toBe("direct");
    expect(clientIp(h("   "))).toBe("direct");
    expect(clientIp(h(","))).toBe("direct");
  });
});

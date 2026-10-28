import { describe, expect, it } from "vitest";
import {
  isAdminPath,
  isBoundPagePath,
  isMachinePath,
  normalizeHost,
  parseDomainInput,
  pickRequestHost,
  primaryServeBinding,
  resolveHostRequest,
  wwwApexOf,
  type DomainBinding,
  type DomainPolicy,
} from "../host-routing";

// ── Fixtures ─────────────────────────────────────────────────────────────

function binding(overrides: Partial<DomainBinding> = {}): DomainBinding {
  return {
    id: 1,
    host: "jane.com",
    pageId: 1,
    pageSlug: "jane",
    kind: "primary",
    behavior: "serve",
    status: "active",
    ...overrides,
  };
}

const DEFAULT_POLICY: DomainPolicy = {
  primaryHost: "links.example.com",
  adminLock: "strict",
  unknownFallback: "path",
  wwwPolicy: "redirect",
  canonical: "301",
};

function resolve(
  overrides: Partial<Parameters<typeof resolveHostRequest>[0]> = {},
): ReturnType<typeof resolveHostRequest> {
  return resolveHostRequest({
    host: "jane.com",
    pathname: "/",
    protocol: "https",
    bindings: [binding()],
    scopeByPageId: new Map(),
    policy: DEFAULT_POLICY,
    ...overrides,
  });
}

// ── normalizeHost ─────────────────────────────────────────────────────────

describe("normalizeHost", () => {
  it("lowercases and strips ports and trailing dots", () => {
    expect(normalizeHost("  Jane.COM:3000. ")).toBe("jane.com");
  });

  it("converts IDN to punycode", () => {
    expect(normalizeHost("Bücher.de")).toBe("xn--bcher-kva.de");
  });

  it("handles bracketed IPv6 with port", () => {
    expect(normalizeHost("[::1]:3000")).toBe("::1");
  });

  it("returns empty for garbage", () => {
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost("   ")).toBe("");
    expect(normalizeHost("[broken")).toBe("");
    expect(normalizeHost("a".repeat(300))).toBe("");
  });
});

describe("parseDomainInput", () => {
  it("strips scheme, path, and port from user input", () => {
    expect(parseDomainInput("https://Jane.com/some/path?x=1")).toBe("jane.com");
    expect(parseDomainInput("Jane.COM:8443")).toBe("jane.com");
  });

  it("rejects unusable input", () => {
    expect(parseDomainInput("")).toBeNull();
    expect(parseDomainInput("not a domain")).toBeNull();
    expect(parseDomainInput("http://")).toBeNull();
  });

  it("accepts intranet single-label hosts", () => {
    expect(parseDomainInput("team")).toBe("team");
  });
});

describe("wwwApexOf", () => {
  it("detects exact www prefix only", () => {
    expect(wwwApexOf("www.jane.com")).toEqual({ isWww: true, apex: "jane.com" });
    expect(wwwApexOf("wwwx.jane.com")).toEqual({ isWww: false, apex: "wwwx.jane.com" });
    expect(wwwApexOf("www.")).toEqual({ isWww: false, apex: "www." });
    expect(wwwApexOf("jane.com")).toEqual({ isWww: false, apex: "jane.com" });
  });
});

// ── Path classification ──────────────────────────────────────────────────

// ── pickRequestHost ───────────────────────────────────────────────────────

describe("pickRequestHost", () => {
  it("uses the raw Host header by default (never trusts the client)", () => {
    expect(pickRequestHost("evil.example", "jane.com", false)).toBe("jane.com");
    expect(pickRequestHost("evil.example", null, false)).toBeNull();
  });

  it("honors X-Forwarded-Host only behind the explicit trust flag", () => {
    expect(pickRequestHost("edge.example", "jane.com", true)).toBe("edge.example");
    // Flag on but header absent → falls back to Host.
    expect(pickRequestHost(null, "jane.com", true)).toBe("jane.com");
    expect(pickRequestHost("", "jane.com", true)).toBe("jane.com");
    expect(pickRequestHost(null, null, true)).toBeNull();
  });
});

describe("isAdminPath", () => {
  it("covers admin pages and admin APIs, nothing public", () => {
    for (const p of [
      "/login",
      "/setup",
      "/dashboard",
      "/dashboard/whatever",
      "/links",
      "/profile",
      "/theme",
      "/settings",
      "/pages",
      "/pages/new",
      "/domains",
      "/accounts",
      "/audit",
      "/api/setup",
      "/api/onboarding",
      "/api/backup",
      "/api/backup/x",
      "/api/analytics/export",
      "/api/subscribers/export",
      "/api/subscribers/clear",
      "/api/themes/import",
      "/api/themes/export",
      "/api/totp-qr",
    ]) {
      expect(isAdminPath(p), p).toBe(true);
    }
    for (const p of ["/", "/jane", "/api/track", "/api/vcard/jane", "/go/3", "/sitemap.xml"]) {
      expect(isAdminPath(p), p).toBe(false);
    }
  });
});

describe("isMachinePath", () => {
  it("covers /go, /api, robots and sitemap", () => {
    for (const p of ["/go/12", "/go", "/api/track", "/robots.txt", "/sitemap.xml"]) {
      expect(isMachinePath(p), p).toBe(true);
    }
    expect(isMachinePath("/gopher")).toBe(false);
  });
});

describe("isBoundPagePath", () => {
  it("accepts root and the page's own slug forms only", () => {
    expect(isBoundPagePath("/", "jane")).toBe(true);
    expect(isBoundPagePath("/jane", "jane")).toBe(true);
    expect(isBoundPagePath("/jane/", "jane")).toBe(true);
    expect(isBoundPagePath("/jane/privacy", "jane")).toBe(true);
    expect(isBoundPagePath("/jane/opengraph-image", "jane")).toBe(true);
    expect(isBoundPagePath("/other", "jane")).toBe(false);
    expect(isBoundPagePath("/jane/other", "jane")).toBe(false);
    expect(isBoundPagePath("/privacy", "jane")).toBe(false);
  });
});

// ── Resolution: bound host ────────────────────────────────────────────────

describe("resolveHostRequest — bound host, exclusive scope", () => {
  it("serves the page at root via internal rewrite", () => {
    expect(resolve()).toEqual({
      type: "serve",
      binding: binding(),
      rewritePath: "/jane",
      activate: false,
    });
  });

  it("passes the page's own slug paths through normal routing", () => {
    for (const p of ["/jane", "/jane/privacy", "/jane/opengraph-image"]) {
      expect(resolve({ pathname: p }).type, p).toBe("pass");
    }
  });

  it("passes machinery paths", () => {
    for (const p of ["/api/track", "/api/vcard/jane", "/go/9", "/robots.txt"]) {
      expect(resolve({ pathname: p }).type, p).toBe("pass");
    }
  });

  it("404s foreign slugs", () => {
    expect(resolve({ pathname: "/other" })).toEqual({ type: "not_found" });
  });

  it("404s admin paths on the bound host when lock is strict", () => {
    expect(resolve({ pathname: "/login" })).toEqual({ type: "not_found" });
  });

  it("serves admin paths when the bound host IS the primary host", () => {
    // Operator bound their primary host to a page: lock must not self-lock.
    const decision = resolve({
      host: "links.example.com",
      bindings: [binding({ host: "links.example.com" })],
      pathname: "/dashboard",
    });
    expect(decision.type).toBe("pass");
  });

  it("flags activation for pending bindings", () => {
    const decision = resolve({ bindings: [binding({ status: "pending" })] });
    expect(decision).toMatchObject({ type: "serve", activate: true });
  });
});

describe("resolveHostRequest — hub scope", () => {
  it("keeps path routing alive for other slugs", () => {
    const decision = resolve({
      scopeByPageId: new Map([[1, "hub"]]),
      pathname: "/other",
    });
    expect(decision.type).toBe("pass");
  });
});

describe("resolveHostRequest — alias behaviors", () => {
  it("redirect_canonical sends the same path to the page's primary domain", () => {
    const bindings = [
      binding(),
      binding({ id: 2, host: "jane.io", kind: "alias", behavior: "redirect_canonical" }),
    ];
    const decision = resolve({
      host: "jane.io",
      bindings,
      pathname: "/jane/privacy",
    });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/jane/privacy",
      status: 301,
    });
  });

  it("redirect_slug sends everything to the slug on the primary domain", () => {
    const bindings = [
      binding(),
      binding({ id: 2, host: "jane.io", kind: "alias", behavior: "redirect_slug" }),
    ];
    const decision = resolve({ host: "jane.io", bindings, pathname: "/whatever" });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/jane",
      status: 301,
    });
  });

  it("404s an alias whose primary binding is not active", () => {
    const bindings = [
      binding({ status: "pending" }),
      binding({ id: 2, host: "jane.io", kind: "alias", behavior: "redirect_canonical" }),
    ];
    expect(resolve({ host: "jane.io", bindings }).type).toBe("not_found");
  });
});

// ── Resolution: implicit www ──────────────────────────────────────────────

describe("resolveHostRequest — implicit www", () => {
  it("redirects www to the bound apex by default", () => {
    const decision = resolve({ host: "www.jane.com", pathname: "/jane" });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/jane",
      status: 301,
    });
  });

  it("serves through the apex binding when wwwPolicy is serve", () => {
    const decision = resolve({
      host: "www.jane.com",
      policy: { ...DEFAULT_POLICY, wwwPolicy: "serve" },
    });
    expect(decision).toMatchObject({ type: "serve", rewritePath: "/jane" });
  });

  it("ignores www when policy is off (falls through to fallback)", () => {
    const decision = resolve({
      host: "www.jane.com",
      pathname: "/jane",
      policy: { ...DEFAULT_POLICY, wwwPolicy: "off", unknownFallback: "path" },
    });
    // canonical 301 still fires (slug of a bound page on an unknown host).
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/jane",
      status: 301,
    });
  });
});

// ── Resolution: canonical 301 ─────────────────────────────────────────────

describe("resolveHostRequest — canonical strategy", () => {
  it("301s slug paths on the primary host to the bound domain", () => {
    const decision = resolve({
      host: "links.example.com",
      pathname: "/jane",
    });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/jane",
      status: 301,
    });
  });

  it("preserves deep paths in canonical redirects", () => {
    const decision = resolve({
      host: "links.example.com",
      pathname: "/jane/privacy",
    });
    expect(decision).toMatchObject({
      location: "https://jane.com/jane/privacy",
      status: 301,
    });
  });

  it("301s @-slugged pages to the bound domain", () => {
    const decision = resolve({
      host: "links.example.com",
      pathname: "/@jane",
      bindings: [binding({ pageSlug: "@jane" })],
    });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://jane.com/@jane",
      status: 301,
    });
  });

  it("leaves unbound slugs alone on the primary host", () => {
    expect(resolve({ host: "links.example.com", pathname: "/other" }).type).toBe("pass");
  });

  it("never canonicalizes when the target is the current host", () => {
    const decision = resolve({ host: "jane.com", pathname: "/jane" });
    expect(decision.type).toBe("pass");
  });

  it("does nothing when strategy is tag or off", () => {
    for (const canonical of ["tag", "off"] as const) {
      const decision = resolve({
        host: "links.example.com",
        pathname: "/jane",
        policy: { ...DEFAULT_POLICY, canonical },
      });
      expect(decision.type).toBe("pass");
    }
  });

  it("defers to the 404 fallback on unknown hosts (no slug leakage)", () => {
    // With unknown-host fallback = 404, a canonical 301's Location would
    // reveal which slugs are domain-bound — the fallback wins instead.
    const policy = { ...DEFAULT_POLICY, unknownFallback: "404" as const };
    expect(
      resolve({ host: "stranger.example", pathname: "/jane", policy }).type,
    ).toBe("not_found");
  });

  it("still canonicalizes on the primary host when fallback is 404", () => {
    const decision = resolve({
      host: "links.example.com",
      pathname: "/jane",
      policy: { ...DEFAULT_POLICY, unknownFallback: "404" as const },
    });
    expect(decision).toMatchObject({
      location: "https://jane.com/jane",
      status: 301,
    });
  });

  it("keeps cross-host dedup when fallback is path (default)", () => {
    const decision = resolve({
      host: "stranger.example",
      pathname: "/jane",
      policy: { ...DEFAULT_POLICY, unknownFallback: "path" as const },
    });
    expect(decision).toMatchObject({
      location: "https://jane.com/jane",
      status: 301,
    });
  });
});

// ── Resolution: unknown-host fallback ─────────────────────────────────────

describe("resolveHostRequest — unknown-host fallback", () => {
  const policy = { ...DEFAULT_POLICY, canonical: "off" as const };

  it("path (default) keeps today's behavior", () => {
    expect(
      resolve({
        host: "stranger.example",
        pathname: "/jane",
        policy,
      }).type,
    ).toBe("pass");
  });

  it("404 hard-fails page-shaped paths but passes machinery", () => {
    expect(
      resolve({ host: "stranger.example", pathname: "/jane", policy: { ...policy, unknownFallback: "404" } }).type,
    ).toBe("not_found");
    expect(
      resolve({ host: "stranger.example", pathname: "/api/track", policy: { ...policy, unknownFallback: "404" } }).type,
    ).toBe("pass");
  });

  it("redirect_primary preserves the path", () => {
    const decision = resolve({
      host: "stranger.example",
      pathname: "/jane",
      policy: { ...policy, unknownFallback: "redirect_primary" },
    });
    expect(decision).toEqual({
      type: "redirect",
      location: "https://links.example.com/jane",
      status: 301,
    });
  });

  it("redirect_primary never loops on the primary host itself", () => {
    const decision = resolve({
      host: "other.example",
      policy: { ...policy, unknownFallback: "redirect_primary", primaryHost: "other.example" },
      pathname: "/jane",
    });
    expect(decision.type).toBe("pass");
  });

  it("fallback does not touch admin paths", () => {
    for (const fb of ["404", "redirect_primary"] as const) {
      const decision = resolve({
        host: "stranger.example",
        pathname: "/dashboard",
        policy: { ...policy, unknownFallback: fb, adminLock: "off" },
      });
      expect(decision.type).toBe("pass");
    }
  });
});

// ── Resolution: admin lock ────────────────────────────────────────────────

describe("resolveHostRequest — admin host lock", () => {
  it("404s admin surfaces on non-primary hosts", () => {
    const decision = resolve({ host: "jane.com", pathname: "/settings" });
    expect(decision).toEqual({ type: "not_found" });
  });

  it("is inactive when lock is off or primary unknown", () => {
    for (const policy of [
      { ...DEFAULT_POLICY, adminLock: "off" as const },
      { ...DEFAULT_POLICY, primaryHost: null },
    ]) {
      expect(resolve({ policy, pathname: "/login" }).type, JSON.stringify(policy)).toBe("pass");
    }
  });
});

// ── Misc ──────────────────────────────────────────────────────────────────

describe("resolveHostRequest — edge cases", () => {
  it("passes everything when no bindings exist (feature unused)", () => {
    const policy = { ...DEFAULT_POLICY, adminLock: "off" as const };
    for (const p of ["/", "/jane", "/login", "/dashboard", "/api/track"]) {
      expect(resolve({ bindings: [], policy, pathname: p }).type, p).toBe("pass");
    }
  });

  it("still locks admin when bindings are empty but a primary host is known", () => {
    // The lock is a property of the instance policy, not of bindings —
    // configuring it must protect the admin surface immediately.
    expect(resolve({ bindings: [], pathname: "/login" }).type).toBe("not_found");
  });

  it("passes requests without a host", () => {
    expect(resolve({ host: "" }).type).toBe("pass");
  });

  it("is case-insensitive on slug matching for canonical redirects", () => {
    const decision = resolve({
      host: "links.example.com",
      pathname: "/Jane",
      bindings: [binding({ pageSlug: "jane" })],
    });
    expect(decision).toMatchObject({ location: "https://jane.com/Jane" });
  });
});

describe("primaryServeBinding", () => {
  it("returns the active serving primary of a page", () => {
    const bindings = [
      binding({ id: 1, host: "jane.com" }),
      binding({ id: 2, host: "x.com", pageId: 2, pageSlug: "x" }),
      binding({ id: 3, host: "pending.com", status: "pending" }),
      binding({ id: 4, host: "jane.io", kind: "alias", behavior: "redirect_canonical" }),
    ];
    expect(primaryServeBinding(bindings, 1)?.host).toBe("jane.com");
    expect(primaryServeBinding(bindings, 2)?.host).toBe("x.com");
    expect(primaryServeBinding(bindings, 9)).toBeUndefined();
  });
});

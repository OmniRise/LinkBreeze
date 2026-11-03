import { describe, it, expect } from "vitest";
import { readClaim } from "@/server/oidc-flow";
import { createHash } from "node:crypto";

/**
 * #124 Phase 3 — generic OIDC SSO, PURE security primitives (tests first).
 *
 * No @/db, no network. These functions are the whole OIDC attack surface
 * that can be reasoned about offline: issuer validation (SSRF), discovery
 * document parsing (poisoning), PKCE, redirect-to validation (open redirect),
 * and state expiry.
 */
import {
  isValidIssuerUrl,
  parseDiscovery,
  createPkce,
  safeRedirectTo,
  resolveRoleFromGroups,
  STATE_TTL_MS,
} from "@/lib/oidc";

// ─────────────────────────── issuer validation (SSRF guard) ───────────────────────────

describe("isValidIssuerUrl", () => {
  it("accepts https issuers", () => {
    expect(isValidIssuerUrl("https://idp.example.com", { production: true })).toBe(true);
    expect(isValidIssuerUrl("https://authentik.homelab.dev/application/o/linkbreeze/", { production: true })).toBe(true);
  });

  it("rejects plain-hostname and non-http(s) schemes", () => {
    expect(isValidIssuerUrl("idp.example.com", { production: true })).toBe(false);
    expect(isValidIssuerUrl("ftp://idp.example.com", { production: true })).toBe(false);
    expect(isValidIssuerUrl("file:///etc/passwd", { production: true })).toBe(false);
    expect(isValidIssuerUrl("javascript:alert(1)", { production: true })).toBe(false);
  });

  it("rejects credentials, query strings and fragments (issuer is a bare origin+path)", () => {
    expect(isValidIssuerUrl("https://user:pass@idp.example.com", { production: true })).toBe(false);
    expect(isValidIssuerUrl("https://idp.example.com/.well-known/openid-configuration?x=1", { production: true })).toBe(false);
    expect(isValidIssuerUrl("https://idp.example.com/#frag", { production: true })).toBe(false);
  });

  it("production: http is rejected — even http://localhost", () => {
    expect(isValidIssuerUrl("http://idp.internal:8080", { production: true })).toBe(false);
    expect(isValidIssuerUrl("http://localhost:9000", { production: true })).toBe(false);
    expect(isValidIssuerUrl("http://127.0.0.1:9000", { production: true })).toBe(false);
  });

  it("non-production: http localhost/127.0.0.1 allowed for dev providers", () => {
    expect(isValidIssuerUrl("http://localhost:9000", { production: false })).toBe(true);
    expect(isValidIssuerUrl("http://127.0.0.1:9000", { production: false })).toBe(true);
    // but http to a REAL host stays rejected even in dev
    expect(isValidIssuerUrl("http://idp.example.com", { production: false })).toBe(false);
  });

  it("allowInsecureIssuer: the LINKBREEZE_ALLOW_HTTP_ISSUER escape hatch admits a trusted-LAN http IdP — in any mode", () => {
    expect(isValidIssuerUrl("http://idp.internal:8080", { production: true, allowInsecureIssuer: true })).toBe(true);
    expect(isValidIssuerUrl("http://192.168.1.10:9000", { production: true, allowInsecureIssuer: true })).toBe(true);
    expect(isValidIssuerUrl("http://host.docker.internal:9999", { production: true, allowInsecureIssuer: true })).toBe(true);
    // the hatch widens http only — every other strict-shape rule still applies
    expect(isValidIssuerUrl("ftp://idp.internal:8080", { production: true, allowInsecureIssuer: true })).toBe(false);
    expect(isValidIssuerUrl("http://user:pass@idp.internal", { production: true, allowInsecureIssuer: true })).toBe(false);
    expect(isValidIssuerUrl("http://idp.internal/?x=1", { production: true, allowInsecureIssuer: true })).toBe(false);
  });
});

// ─────────────────────────── discovery parsing (poisoning guard) ───────────────────────────

const GOOD = {
  issuer: "https://idp.example.com",
  authorization_endpoint: "https://idp.example.com/authorize",
  token_endpoint: "https://idp.example.com/token",
  userinfo_endpoint: "https://idp.example.com/userinfo",
  response_types_supported: ["code"],
};

describe("parseDiscovery", () => {
  it("accepts a well-formed document whose issuer matches", () => {
    const parsed = parseDiscovery(GOOD, "https://idp.example.com");
    expect(parsed).not.toBeNull();
    expect(parsed!.authorizationEndpoint).toBe("https://idp.example.com/authorize");
    expect(parsed!.tokenEndpoint).toBe("https://idp.example.com/token");
    expect(parsed!.userinfoEndpoint).toBe("https://idp.example.com/userinfo");
  });

  it("REJECTS a document whose issuer differs from the expected one (poisoning)", () => {
    expect(parseDiscovery({ ...GOOD, issuer: "https://evil.example" }, "https://idp.example.com")).toBeNull();
  });

  it("rejects non-object garbage", () => {
    expect(parseDiscovery(null, "https://idp.example.com")).toBeNull();
    expect(parseDiscovery("ok", "https://idp.example.com")).toBeNull();
    expect(parseDiscovery([], "https://idp.example.com")).toBeNull();
    expect(parseDiscovery({}, "https://idp.example.com")).toBeNull();
  });

  it("rejects documents missing required endpoints", () => {
    const noAuth = { ...GOOD, authorization_endpoint: undefined };
    expect(parseDiscovery(noAuth, "https://idp.example.com")).toBeNull();
    expect(parseDiscovery({ ...GOOD, token_endpoint: undefined }, "https://idp.example.com")).toBeNull();
    expect(parseDiscovery({ ...GOOD, userinfo_endpoint: undefined }, "https://idp.example.com")).toBeNull();
  });

  it("rejects endpoints on a different origin than the issuer (token exfiltration)", () => {
    expect(
      parseDiscovery({ ...GOOD, token_endpoint: "https://evil.example/token" }, "https://idp.example.com"),
    ).toBeNull();
    expect(
      parseDiscovery({ ...GOOD, userinfo_endpoint: "http://idp.example.com/userinfo" }, "https://idp.example.com"),
    ).toBeNull();
  });

  it("accepts localhost http endpoints for a localhost dev issuer (non-production shape is caller's concern)", () => {
    const local = {
      issuer: "http://localhost:9000",
      authorization_endpoint: "http://localhost:9000/authorize",
      token_endpoint: "http://localhost:9000/token",
      userinfo_endpoint: "http://localhost:9000/userinfo",
    };
    expect(parseDiscovery(local, "http://localhost:9000")).not.toBeNull();
  });
});

// ─────────────────────────── PKCE (S256) ───────────────────────────

describe("createPkce", () => {
  it("returns a base64url verifier of RFC 7636 length and its S256 challenge", () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("two calls never share a verifier", () => {
    const a = createPkce();
    const b = createPkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

// ─────────────────────────── redirect-to (open-redirect guard) ───────────────────────────

describe("safeRedirectTo", () => {
  it("allows site-relative paths", () => {
    expect(safeRedirectTo("/dashboard")).toBe("/dashboard");
    expect(safeRedirectTo("/")).toBe("/");
    expect(safeRedirectTo("/dashboard?tab=links")).toBe("/dashboard?tab=links");
  });

  it("falls back to / for absolute, protocol-relative and backslash tricks", () => {
    expect(safeRedirectTo("https://evil.example")).toBe("/");
    expect(safeRedirectTo("//evil.example")).toBe("/");
    expect(safeRedirectTo("/\\evil.example")).toBe("/");
    expect(safeRedirectTo("javascript:alert(1)")).toBe("/");
    expect(safeRedirectTo("")).toBe("/");
  });
});

describe("STATE_TTL_MS", () => {
  it("is 10 minutes", () => {
    expect(STATE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

// ─────────────────────────── group → role mapping ───────────────────────────

describe("resolveRoleFromGroups (SSO group mapping)", () => {
  const rules = [
    { group: "editors", roleId: 3 },
    { group: "admins", roleId: 1 },
  ];

  it("FIRST matching rule wins (ordered list)", () => {
    const r = resolveRoleFromGroups(["admins", "editors"], rules, 2, "default_role");
    expect(r).toEqual({ applied: true, roleId: 3, matchedGroup: "editors", refused: false });
  });

  it("trims whitespace on both sides when matching", () => {
    const r = resolveRoleFromGroups(["  editors  "], rules, 2, "default_role");
    expect(r.roleId).toBe(3);
    const r2 = resolveRoleFromGroups(["editors"], [{ group: " editors ", roleId: 3 }], 2, "default_role");
    expect(r2.roleId).toBe(3);
  });

  it("is otherwise exact-match (no substring or case-insensitive surprises)", () => {
    const r = resolveRoleFromGroups(["Editors"], rules, 2, "default_role");
    expect(r.matchedGroup).toBeNull();
    const r2 = resolveRoleFromGroups(["editor"], rules, 2, "default_role");
    expect(r2.matchedGroup).toBeNull();
  });

  it("no match + default_role policy → default role id", () => {
    const r = resolveRoleFromGroups(["norelated"], rules, 2, "default_role");
    expect(r).toEqual({ applied: true, roleId: 2, matchedGroup: null, refused: false });
  });

  it("no match + refuse policy → refused login, null role", () => {
    const r = resolveRoleFromGroups(["norelated"], rules, 2, "refuse");
    expect(r).toEqual({ applied: true, roleId: null, matchedGroup: null, refused: true });
  });

  it("empty rules = mapping system INACTIVE (existing users keep their role)", () => {
    const r = resolveRoleFromGroups(["anything"], [], 2, "default_role");
    expect(r).toEqual({ applied: false, roleId: null, matchedGroup: null, refused: false });
    const r2 = resolveRoleFromGroups(["anything"], [], 2, "refuse");
    expect(r2.applied).toBe(false);
    expect(r2.refused).toBe(false);
  });

  it("null default role + default_role policy → roleId null (caller falls back to Member)", () => {
    const r = resolveRoleFromGroups(["norelated"], rules, null, "default_role");
    expect(r.applied).toBe(true);
    expect(r.roleId).toBeNull();
  });
});
// ─── #124 follow-up: custom claim names ─────────────────────────────────────

describe("readClaim (custom claim names)", () => {

  it("prefers the custom claim when present", () => {
    const r = readClaim({ handle: "amy", preferred_username: "amy2" }, "handle", "preferred_username");
    expect(r).toEqual({ value: "amy", fallbackUsed: false });
  });

  it("falls back to the standard claim when the custom one is missing", () => {
    const r = readClaim({ preferred_username: "amy" }, "handle", "preferred_username");
    expect(r).toEqual({ value: "amy", fallbackUsed: true });
  });

  it("no fallback flag when the custom claim IS the default and missing", () => {
    const r = readClaim({}, "preferred_username", "preferred_username");
    expect(r).toEqual({ value: null, fallbackUsed: false });
  });

  it("ignores empty-string claims", () => {
    const r = readClaim({ handle: "", preferred_username: "amy" }, "handle", "preferred_username");
    expect(r).toEqual({ value: "amy", fallbackUsed: true });
  });
});

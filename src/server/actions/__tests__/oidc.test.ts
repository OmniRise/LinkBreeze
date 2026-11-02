import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ userId: number; username: string } | null>>(async () => null),
  demoGuard: vi.fn<() => { error: string; errorCode: number } | null>(() => null),
  getOidcIdentitiesForUser: vi.fn<() => Promise<unknown[]>>(async () => []),
  unlinkOidcIdentity: vi.fn(async () => undefined),
  recordAudit: vi.fn(async () => undefined),
  getOidcConfig: vi.fn<() => Promise<unknown>>(async () => null),
  createOidcState: vi.fn(async () => undefined),
  fetchDiscovery: vi.fn<() => Promise<unknown>>(async () => null),
  getOidcClientSecret: vi.fn((): string | null => null),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/queries", () => ({
  getOidcIdentitiesForUser: mocks.getOidcIdentitiesForUser,
  unlinkOidcIdentity: mocks.unlinkOidcIdentity,
  getOidcConfig: mocks.getOidcConfig,
  createOidcState: mocks.createOidcState,
  updateSetting: vi.fn(async () => undefined),
}));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));
vi.mock("@/server/oidc-flow", () => ({
  getOidcClientSecret: mocks.getOidcClientSecret,
  insecureIssuerAllowed: () => false,
  isProduction: () => false,
  randomState: () => "test-state-000",
  stateExpiry: () => new Date(Date.now() + 60_000).toISOString(),
  fetchDiscovery: mocks.fetchDiscovery,
}));

import {
  startOidcLinkAction,
  unlinkOidcIdentityAction,
} from "@/server/actions/oidc";

const SESSION = { userId: 7, username: "manak" };
const IDENTITY = {
  id: 1,
  userId: 7,
  issuer: "https://idp.example.com",
  subject: "sub-123",
  preferredUsername: "manak",
  createdAt: "2026-01-01 00:00:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.demoGuard.mockReturnValue(null);
  mocks.getSession.mockResolvedValue(null);
});

describe("unlinkOidcIdentityAction", () => {
  it("blocks unauthenticated callers", async () => {
    const res = await unlinkOidcIdentityAction(IDENTITY.issuer, IDENTITY.subject);
    expect(res.success).toBe(false);
    expect(mocks.unlinkOidcIdentity).not.toHaveBeenCalled();
  });

  it("blocks demo mode", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.demoGuard.mockReturnValue({ error: "demo", errorCode: 0 });
    const res = await unlinkOidcIdentityAction(IDENTITY.issuer, IDENTITY.subject);
    expect(res.success).toBe(false);
    expect(mocks.unlinkOidcIdentity).not.toHaveBeenCalled();
  });

  it("refuses identities not linked to the caller's account", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOidcIdentitiesForUser.mockResolvedValue([]);
    const res = await unlinkOidcIdentityAction(IDENTITY.issuer, IDENTITY.subject);
    expect(res.success).toBe(false);
    expect(mocks.unlinkOidcIdentity).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("unlinks an owned identity and writes the audit entry", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOidcIdentitiesForUser.mockResolvedValue([IDENTITY]);
    const res = await unlinkOidcIdentityAction(IDENTITY.issuer, IDENTITY.subject);
    expect(res.success).toBe(true);
    expect(mocks.unlinkOidcIdentity).toHaveBeenCalledWith(IDENTITY.issuer, IDENTITY.subject);
    expect(mocks.recordAudit).toHaveBeenCalledWith("sso.unlinked", SESSION.username, {
      issuer: IDENTITY.issuer,
    });
  });

  it("rejects empty issuer/subject", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    const res = await unlinkOidcIdentityAction("", "");
    expect(res.success).toBe(false);
    expect(mocks.unlinkOidcIdentity).not.toHaveBeenCalled();
  });
});

describe("startOidcLinkAction", () => {
  it("blocks unauthenticated callers", async () => {
    const res = await startOidcLinkAction();
    expect(res.success).toBe(false);
    expect(mocks.createOidcState).not.toHaveBeenCalled();
  });

  it("returns an authorize URL when SSO is configured", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.getOidcConfig.mockResolvedValue({
      issuer: "https://idp.example.com",
      clientId: "client-1",
      jit: true,
      mode: "optional",
    });
    mocks.getOidcClientSecret.mockReturnValue("secret-1");
    mocks.fetchDiscovery.mockResolvedValue({
      authorizationEndpoint: "https://idp.example.com/authorize",
      tokenEndpoint: "https://idp.example.com/token",
      userinfoEndpoint: "https://idp.example.com/userinfo",
    });
    const res = await startOidcLinkAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.authorizeUrl).toContain("https://idp.example.com/authorize");
      expect(res.authorizeUrl).toContain("code_challenge_method=S256");
      expect(res.authorizeUrl).toContain("state=test-state-000");
    }
    expect(mocks.createOidcState).toHaveBeenCalledTimes(1);
  });
});

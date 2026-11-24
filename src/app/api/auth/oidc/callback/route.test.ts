import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * GHSA-5gx8-3hch-6m2f regression tests — OIDC callback account-linking CSRF.
 *
 * Attack under test: the attacker starts their own OIDC login flow (their own
 * state + PKCE verifier, both valid), then lures a logged-in victim into
 * opening the callback URL carrying the attacker's ?code&state. The victim's
 * session cookie rides along (top-level GET, SameSite=Lax allows it), and the
 * callback's account-linking branch binds the ATTACKER's IdP identity to the
 * VICTIM's account → the attacker later SSO-logs-in as the victim.
 *
 * Defense under test: the state row is bound to a flow nonce carried in an
 * httpOnly cookie set when the flow starts. A callback whose cookie does not
 * match the stored nonce is rejected before any identity is linked.
 */

const jar = (map: Record<string, { value: string }>) => ({
  get: (name: string) => map[name],
});

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ userId: number; username: string } | null>>(async () => null),
  cookies: vi.fn<() => Promise<{ get: (name: string) => { value: string } | undefined }>>(
    async () => ({ get: () => undefined }),
  ),
  consumeOidcState: vi.fn(),
  findUserIdByOidcIdentity: vi.fn(async () => null),
  linkOidcIdentity: vi.fn(async () => undefined),
  provisionOidcUser: vi.fn(async () => ({ userId: 999, username: "attacker" })),
  recordAudit: vi.fn(async () => undefined),
  exchangeCode: vi.fn(),
  fetchUserInfo: vi.fn(),
  fetchDiscovery: vi.fn(),
  getOidcClientSecret: vi.fn((): string | null => "secret-1"),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
  buildSessionCookie: vi.fn(async () => ({
    name: "lb_session",
    value: "session-token",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 3600,
  })),
}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));
vi.mock("@/server/queries", () => ({
  consumeOidcState: mocks.consumeOidcState,
  findUserIdByOidcIdentity: mocks.findUserIdByOidcIdentity,
  linkOidcIdentity: mocks.linkOidcIdentity,
  provisionOidcUser: mocks.provisionOidcUser,
  getUserById: vi.fn(async () => null),
  touchLastLogin: vi.fn(async () => undefined),
  getOidcConfig: vi.fn(async () => ({
    issuer: "https://idp.example.com",
    clientId: "client-1",
    jit: true,
    mode: "optional",
  })),
  getOidcSettingsRaw: vi.fn(async () => ({})),
  updateSetting: vi.fn(async () => undefined),
}));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 }),
}));
vi.mock("@/server/oidc-flow", () => ({
  DEFAULT_OIDC_CLAIMS: { username: "preferred_username", email: "email", name: "name" },
  applyGroupRoleResync: vi.fn(async () => undefined),
  fetchDiscovery: mocks.fetchDiscovery,
  exchangeCode: mocks.exchangeCode,
  fetchUserInfo: mocks.fetchUserInfo,
  getOidcClientSecret: mocks.getOidcClientSecret,
  provisionOidcUser: mocks.provisionOidcUser,
  resolveOidcRole: vi.fn(async () => ({ refused: false, roleId: null, applied: false })),
}));
vi.mock("@/lib/host-routing", () => ({
  pickRequestHost: () => "localhost:3000",
}));

import { GET } from "@/app/api/auth/oidc/callback/route";

const VICTIM = { userId: 42, username: "victim" };
const ATTACKER_STATE = {
  // The attacker's own state row: valid, unexpired, PKCE verifier included.
  // No binding to the victim's browser session — that is the bug's root cause.
  state: "attacker-state-000",
  codeVerifier: "attacker-verifier",
  redirectTo: "/",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
const ATTACKER_IDENTITY = {
  sub: "attacker-sub",
  preferredUsername: "attacker",
  name: "Attacker",
  email: "attacker@idp.example.com",
  groups: [],
};

function callbackRequest(query: string): NextRequest {
  // Minimal Request shim: the route only touches nextUrl and headers.
  const url = `http://localhost:3000/api/auth/oidc/callback?${query}`;
  const req = new Request(url) as NextRequest;
  Object.defineProperty(req, "nextUrl", { value: new URL(url) });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The route's fail() resolves against BASE_URL; a stray relative value from
  // the invoking shell must not leak into these tests.
  delete process.env.BASE_URL;
  mocks.getSession.mockResolvedValue(null);
  mocks.cookies.mockResolvedValue(jar({}));
  mocks.consumeOidcState.mockImplementation(async () => ({ ...ATTACKER_STATE }));
  mocks.findUserIdByOidcIdentity.mockResolvedValue(null);
  mocks.fetchDiscovery.mockResolvedValue({
    authorizationEndpoint: "https://idp.example.com/authorize",
    tokenEndpoint: "https://idp.example.com/token",
    userinfoEndpoint: "https://idp.example.com/userinfo",
  });
  mocks.exchangeCode.mockResolvedValue({ access_token: "at" });
  mocks.fetchUserInfo.mockResolvedValue(ATTACKER_IDENTITY);
});

describe("OIDC callback — account-linking CSRF (GHSA-5gx8-3hch-6m2f)", () => {
  it("REJECTS a callback whose state row has no flow-nonce binding (attacker state, victim session)", async () => {
    // The victim browses with a live session; the attacker's state row predates
    // nonce binding (or the attacker stripped it). The victim's browser has NO
    // attacker flow cookie, so nothing ties this callback to the victim.
    mocks.getSession.mockResolvedValue(VICTIM);
    mocks.cookies.mockResolvedValue(jar({}));

    const res = await GET(callbackRequest("code=attacker-code&state=attacker-state-000"));

    expect(mocks.linkOidcIdentity).not.toHaveBeenCalled();
    expect(mocks.provisionOidcUser).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?sso=invalid");
  });

  it("REJECTS a callback carrying a foreign flow-nonce cookie (stolen/resent state)", async () => {
    mocks.getSession.mockResolvedValue(VICTIM);
    // Any cookie value other than the row's nonce must not pass.
    mocks.cookies.mockResolvedValue(jar({ lb_oidc_flow: { value: "some-other-flow" } }));

    const res = await GET(callbackRequest("code=attacker-code&state=attacker-state-000"));

    expect(mocks.linkOidcIdentity).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/login?sso=invalid");
  });

  it("still links when the flow nonce matches the cookie (legitimate Connect-SSO flow)", async () => {
    mocks.getSession.mockResolvedValue(VICTIM);
    mocks.consumeOidcState.mockImplementation(async () => ({
      ...ATTACKER_STATE,
      state: "victim-flow-state",
      flowNonce: "victim-flow-nonce",
    }));
    mocks.cookies.mockResolvedValue(jar({ lb_oidc_flow: { value: "victim-flow-nonce" } }));

    const res = await GET(callbackRequest("code=victim-code&state=victim-flow-state"));

    expect(mocks.linkOidcIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VICTIM.userId, subject: ATTACKER_IDENTITY.sub }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).not.toContain("/login?sso=");
  });

  it("REJECTS an attacker state presented with NO session when its nonce is missing (login CSRF)", async () => {
    // Unauthenticated variant: attacker logs the victim into the attacker's
    // JIT-provisioned account. Same missing-binding root cause.
    mocks.getSession.mockResolvedValue(null);
    mocks.cookies.mockResolvedValue(jar({}));

    const res = await GET(callbackRequest("code=attacker-code&state=attacker-state-000"));

    expect(mocks.provisionOidcUser).not.toHaveBeenCalled();
    expect(mocks.linkOidcIdentity).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/login?sso=invalid");
  });

  it("still logs in when the flow nonce matches the cookie (legitimate login flow)", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.consumeOidcState.mockImplementation(async () => ({
      ...ATTACKER_STATE,
      state: "login-flow-state",
      flowNonce: "login-flow-nonce",
    }));
    mocks.cookies.mockResolvedValue(jar({ lb_oidc_flow: { value: "login-flow-nonce" } }));

    const res = await GET(callbackRequest("code=login-code&state=login-flow-state"));

    expect(mocks.linkOidcIdentity).not.toHaveBeenCalled();
    expect(mocks.provisionOidcUser).toHaveBeenCalledWith(
      expect.objectContaining({ subject: ATTACKER_IDENTITY.sub }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).not.toContain("/login?sso=");
  });
});

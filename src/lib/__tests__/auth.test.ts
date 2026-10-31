import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth";

/**
 * Cookie mock that captures the options object — not just the value.
 *
 * Bug #70 slipped through because the previous mock only stored the cookie
 * value and discarded options (where `secure` lives). The old test literally
 * said: "The mock cookie store doesn't store options, but the call should
 * succeed without throwing. The real assertion happens in the browser test."
 *
 * That is how `secure: NODE_ENV === 'production'` went unnoticed — the unit
 * test never checked the flag. This mock fixes that.
 */
type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
};

const mockCookieStore = new Map<
  string,
  { value: string; options: CookieOptions }
>();
const mockHeaders = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mockCookieStore.has(name)
        ? { value: mockCookieStore.get(name)!.value }
        : undefined,
    set: (name: string, value: string, options: CookieOptions = {}) =>
      mockCookieStore.set(name, { value, options }),
  }),
  headers: async () => ({
    get: (name: string) => mockHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/server/queries", () => ({
  getSetting: async () => "0",
  // #124: createSession now stamps the role from the users row. Provide a
  // stub so the session mint resolves role "admin" instead of throwing on
  // an undefined user.
  getUserById: async () => ({
    id: 1,
    username: "admin",
    role: "admin",
    status: "active",
  }),
  // #124 follow-up: session lifetime sources (no overrides configured here —
  // the built-in defaults apply).
  getSessionLimitSources: async () => ({
    userIdleMinutes: null,
    userMaxHours: null,
    roleIdleMinutes: null,
    roleMaxHours: null,
    globalIdleMinutes: null,
    globalMaxHours: null,
  }),
  touchUserLastSeen: async () => undefined,
}));

import { createSession, getSession, destroySession } from "@/lib/auth";

describe("hashPassword / verifyPassword", () => {
  it("hashes a password (not plaintext)", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).not.toBe("mypassword");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("mypassword", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("wrongpassword", hash)).toBe(false);
  });

  it("produces different hashes for same password (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("session lifecycle", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockHeaders.clear();
  });

  it("returns null when no session cookie exists", async () => {
    const session = await getSession();
    expect(session).toBeNull();
  });

  it("creates a session, then getSession reads it", async () => {
    await createSession(1, "admin");
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(1);
    expect(session!.username).toBe("admin");
  });

  it("destroys an existing session", async () => {
    await createSession(1, "admin");
    expect(mockCookieStore.has("lb_session")).toBe(true);
    await destroySession();
    expect(mockCookieStore.get("lb_session")!.value).toBe("");
  });
});

/**
 * Regression tests for GitHub issue #70.
 *
 * The bug: `secure: process.env.NODE_ENV === "production"` was always true in
 * Docker, so browsers silently rejected the session cookie over plain HTTP.
 * The fix: detect HTTPS dynamically from the X-Forwarded-Proto header.
 *
 * These tests assert the ACTUAL `secure` flag in the cookie options, not just
 * that the call succeeded. If someone reverts the fix, these fail immediately.
 */
describe("secure cookie flag (issue #70 regression)", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockHeaders.clear();
  });

  it("sets non-secure cookie over plain HTTP (no X-Forwarded-Proto)", async () => {
    await createSession(1, "admin");

    const cookie = mockCookieStore.get("lb_session");
    expect(cookie).toBeDefined();
    expect(cookie!.options.secure).toBe(false);
  });

  it("sets secure cookie when X-Forwarded-Proto is https", async () => {
    mockHeaders.set("x-forwarded-proto", "https");
    await createSession(1, "admin");

    const cookie = mockCookieStore.get("lb_session");
    expect(cookie).toBeDefined();
    expect(cookie!.options.secure).toBe(true);
  });

  it("sets non-secure cookie when X-Forwarded-Proto is http", async () => {
    mockHeaders.set("x-forwarded-proto", "http");
    await createSession(1, "admin");

    const cookie = mockCookieStore.get("lb_session");
    expect(cookie).toBeDefined();
    expect(cookie!.options.secure).toBe(false);
  });

  it("destroySession also respects the HTTPS flag over HTTP", async () => {
    await destroySession();
    const cookie = mockCookieStore.get("lb_session");
    expect(cookie).toBeDefined();
    expect(cookie!.options.secure).toBe(false);
    expect(cookie!.value).toBe("");
  });

  it("always sets httpOnly and sameSite=lax regardless of transport", async () => {
    await createSession(1, "admin");
    const cookie = mockCookieStore.get("lb_session");
    expect(cookie!.options.httpOnly).toBe(true);
    expect(cookie!.options.sameSite).toBe("lax");
  });
});

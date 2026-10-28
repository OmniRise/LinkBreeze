import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async (): Promise<{ userId: number; username: string; exp: number; pv: number } | null> => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  createSession: vi.fn(async () => undefined),
  destroySession: vi.fn(async () => undefined),
  hashPassword: vi.fn(async () => "hashed:pword"),
  verifyPassword: vi.fn(async () => true),
  isLegacyBcryptHash: vi.fn(() => false),
  getUserByUsername: vi.fn(async (): Promise<{ id: number; username: string; passwordHash: string; passwordVersion: number } | null> => ({ id: 1, username: "admin", passwordHash: "hashed:pword", passwordVersion: 1 })),
  getUserCount: vi.fn(async (): Promise<number> => 1),
  createUser: vi.fn(async () => ({ id: 1, username: "newuser" })),
  updateUserPassword: vi.fn(async () => undefined),
  getSetting: vi.fn(async () => "1"),
  rateLimit: vi.fn(() => ({ ok: true, remaining: 4, resetAt: Date.now() + 60000 })),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
  createSession: mocks.createSession,
  destroySession: mocks.destroySession,
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  isLegacyBcryptHash: mocks.isLegacyBcryptHash,
}));
vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  getUserByUsername: mocks.getUserByUsername,
  getUserCount: mocks.getUserCount,
  createUser: mocks.createUser,
  getSetting: mocks.getSetting,
  updateUserPassword: mocks.updateUserPassword,
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ users: {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })) }));

import { login, setup } from "@/server/actions/auth";

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyPassword.mockResolvedValue(true);
});

describe("login", () => {
  it("succeeds with valid credentials", async () => {
    const res = await login(makeFormData({ username: "admin", password: "pass1234" }));
    expect(res.success).toBe(true);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it("fails with empty username", async () => {
    const res = await login(makeFormData({ username: "", password: "pass1234" }));
    expect(res.success).toBe(false);
  });

  it("fails with empty password", async () => {
    const res = await login(makeFormData({ username: "admin", password: "" }));
    expect(res.success).toBe(false);
  });

  it("fails when user not found", async () => {
    mocks.getUserByUsername.mockResolvedValue(null);
    const res = await login(makeFormData({ username: "ghost", password: "pass1234" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Invalid username or password");
  });

  it("fails when password is wrong", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const res = await login(makeFormData({ username: "admin", password: "wrong" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Invalid username or password");
  });

  it("blocks login after rate limit is exceeded", async () => {
    mocks.rateLimit.mockReturnValueOnce({ ok: false, remaining: 0, resetAt: Date.now() + 30000 });
    const res = await login(makeFormData({ username: "admin", password: "pass1234" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("Too many");
    // verifyPassword should never be called when rate-limited
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});

describe("login legacy hash upgrade (#76)", () => {
  beforeEach(() => {
    // Tests above poison the shared mocks ("user not found" persists its
    // null); restore the authenticated-admin baseline explicitly.
    mocks.getUserByUsername.mockResolvedValue({ id: 1, username: "admin", passwordHash: "hashed:pword", passwordVersion: 1 });
  });

  it("rehashes a legacy bcrypt hash with argon2 and persists it", async () => {
    mocks.isLegacyBcryptHash.mockReturnValue(true);
    const res = await login(makeFormData({ username: "admin", password: "pass1234" }));
    expect(res.success).toBe(true);
    expect(mocks.updateUserPassword).toHaveBeenCalledOnce();
    expect(mocks.updateUserPassword).toHaveBeenCalledWith(1, "hashed:pword");
  });

  it("does not bump sessionVersion on the login rehash", async () => {
    mocks.isLegacyBcryptHash.mockReturnValue(true);
    await login(makeFormData({ username: "admin", password: "pass1234" }));
    // createSession is mocked, so any getSetting call would come from a
    // sessionVersion bump — there must be none (the user just authenticated).
    expect(mocks.getSetting).not.toHaveBeenCalled();
  });

  it("does not rehash when the stored hash is already argon2", async () => {
    mocks.isLegacyBcryptHash.mockReturnValue(false);
    const res = await login(makeFormData({ username: "admin", password: "pass1234" }));
    expect(res.success).toBe(true);
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("still logs in when the opportunistic rehash fails", async () => {
    mocks.isLegacyBcryptHash.mockReturnValue(true);
    mocks.updateUserPassword.mockRejectedValueOnce(new Error("db unavailable"));
    const res = await login(makeFormData({ username: "admin", password: "pass1234" }));
    expect(res.success).toBe(true);
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });
});

describe("setup", () => {
  it("rejects when users already exist", async () => {
    mocks.getUserCount.mockResolvedValue(1);
    const res = await setup(makeFormData({ username: "newuser", password: "Pass1234" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("already been completed");
  });

  it("creates the first user", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    mocks.getUserByUsername.mockResolvedValue(null);
    const res = await setup(makeFormData({ username: "newuser", password: "Pass1234" }));
    expect(res.success).toBe(true);
    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it("rejects short username (<3 chars)", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await setup(makeFormData({ username: "ab", password: "Pass1234" }));
    expect(res.success).toBe(false);
  });

  it("rejects short password (<8 chars)", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await setup(makeFormData({ username: "newuser", password: "Short1" }));
    expect(res.success).toBe(false);
  });

  it("rejects password missing uppercase letter", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await setup(makeFormData({ username: "newuser", password: "pass1234" }));
    expect(res.success).toBe(false);
  });

  it("rejects password missing a number", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await setup(makeFormData({ username: "newuser", password: "Password" }));
    expect(res.success).toBe(false);
  });

  it("rejects username with special chars", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await setup(makeFormData({ username: "user@name!", password: "Pass1234" }));
    expect(res.success).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addSubscriber: vi.fn(async () => undefined),
  getSetting: vi.fn(async (): Promise<string | null> => null),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  addSubscriber: mocks.addSubscriber,
  getSetting: mocks.getSetting,
}));

// Mock next/headers for rate-limiting
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));

// Mock rate-limit to always allow
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 9, resetAt: Date.now() + 60000 }),
}));

import { subscribe } from "@/server/actions/subscribers";

function fd(data: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSetting.mockResolvedValue(null);
});

describe("subscribe", () => {
  it("accepts a valid email with consent", async () => {
    const res = await subscribe(fd({ email: "user@example.com", consent: "on" }));
    expect(res.success).toBe(true);
    expect(mocks.addSubscriber).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String),
    );
  });

  it("lowercases uppercase email (valid without whitespace)", async () => {
    await subscribe(fd({ email: "User@Example.COM", consent: "on" }));
    expect(mocks.addSubscriber).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String),
    );
  });

  it("rejects submission without consent checkbox", async () => {
    const res = await subscribe(fd({ email: "user@example.com" }));
    expect(res.success).toBe(false);
    expect(mocks.addSubscriber).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await subscribe(fd({ email: "not-an-email", consent: "on" }));
    expect(res.success).toBe(false);
    expect(mocks.addSubscriber).not.toHaveBeenCalled();
  });

  it("rejects an empty email", async () => {
    const res = await subscribe(fd({ email: "", consent: "on" }));
    expect(res.success).toBe(false);
  });

  it("returns success even on duplicate (no leak)", async () => {
    mocks.addSubscriber.mockRejectedValueOnce(new Error("UNIQUE constraint"));
    const res = await subscribe(fd({ email: "dup@example.com", consent: "on" }));
    expect(res.success).toBe(true);
  });

  it("stores the consent text from settings", async () => {
    mocks.getSetting.mockResolvedValueOnce("Custom consent text");
    await subscribe(fd({ email: "user@example.com", consent: "on" }));
    expect(mocks.addSubscriber).toHaveBeenCalledWith(
      "user@example.com",
      "Custom consent text",
    );
  });

  it("falls back to default consent text when setting is empty", async () => {
    mocks.getSetting.mockResolvedValueOnce(null);
    await subscribe(fd({ email: "user@example.com", consent: "on" }));
    expect(mocks.addSubscriber).toHaveBeenCalledWith(
      "user@example.com",
      expect.stringContaining("I agree to receive emails"),
    );
  });
});

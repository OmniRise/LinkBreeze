/**
 * #4 — API key server actions: GHSA-954q-vph2-prc8 — the key is
 * instance-wide (it reads/writes every account's links and sections
 * through /api/v1/*), so BOTH actions are instance-admin-gated, not
 * merely session-gated. A Member must never mint or revoke it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  gate: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/server/api-keys", () => ({
  createApiKey: mocks.createApiKey,
  revokeApiKey: mocks.revokeApiKey,
}));
vi.mock("@/server/access", () => ({ requireInstanceAdmin: mocks.gate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { generateApiKeyAction, revokeApiKeyAction } from "@/server/actions/api-keys";

const ADMIN_OK = null;
const FORBIDDEN = { success: false as const, error: "Only instance admins can change instance settings", errorCode: "forbidden" };
const UNAUTHORIZED = { success: false as const, error: "Unauthorized", errorCode: "unauthorized" };

beforeEach(() => {
  mocks.gate.mockResolvedValue(ADMIN_OK);
  mocks.createApiKey.mockResolvedValue({
    key: "lbk_plaintext-once",
    prefix: "lbk_plain1",
    createdAt: "2026-10-26T00:00:00.000Z",
  });
  mocks.revokeApiKey.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.DEMO_MODE;
  vi.clearAllMocks();
});

describe("generateApiKeyAction — instance-admin gate", () => {
  it("rejects a non-admin Member with forbidden and never mints a key", async () => {
    mocks.gate.mockResolvedValue(FORBIDDEN);
    const res = await generateApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller with unauthorized", async () => {
    mocks.gate.mockResolvedValue(UNAUTHORIZED);
    const res = await generateApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("unauthorized");
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("is blocked in demo mode before any key material exists", async () => {
    process.env.DEMO_MODE = "true";
    const res = await generateApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("demo");
    expect(mocks.gate).not.toHaveBeenCalled();
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("returns the plaintext key exactly once and revalidates settings for an admin", async () => {
    const res = await generateApiKeyAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.key).toBe("lbk_plaintext-once");
      expect(res.prefix).toBe("lbk_plain1");
    }
    expect(mocks.createApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
});

describe("revokeApiKeyAction — instance-admin gate", () => {
  it("rejects a non-admin Member with forbidden and revokes nothing", async () => {
    mocks.gate.mockResolvedValue(FORBIDDEN);
    const res = await revokeApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("is blocked in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    const res = await revokeApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("demo");
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("revokes through the KV layer on success", async () => {
    const res = await revokeApiKeyAction();
    expect(res.success).toBe(true);
    expect(mocks.revokeApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
});

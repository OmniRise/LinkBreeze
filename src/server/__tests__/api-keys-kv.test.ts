/**
 * #4 E.2 — API key KV persistence through the REAL queries layer (sql.js
 * harness): grace storage on rotate, immediate invalidate by default,
 * revoke clears both current and grace rows.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../queries/__tests__/integration-setup";
import { hashApiKey, apiKeyMatches } from "@/lib/api-key";
import {
  createApiKey,
  getApiKeyRecord,
  revokeApiKey,
  isPrevKeyLive,
  MAX_GRACE_HOURS,
} from "@/server/api-keys";

beforeEach(async () => {
  await revokeApiKey();
});

describe("createApiKey / getApiKeyRecord (KV roundtrip)", () => {
  it("stores only the hash — the plaintext never round-trips", async () => {
    const created = await createApiKey();
    const record = await getApiKeyRecord();
    expect(record).not.toBeNull();
    expect(record!.hash).toBe(hashApiKey(created.key));
    expect(record!.hash).not.toBe(created.key);
    expect(record!.prefix).toBe(created.prefix);
    expect(record!.prevHash).toBeNull();
  });

  it("default rotation invalidates the old key instantly (no grace rows)", async () => {
    const first = await createApiKey();
    const second = await createApiKey();
    const record = await getApiKeyRecord();
    expect(record!.hash).toBe(hashApiKey(second.key));
    expect(record!.prevHash).toBeNull();
    expect(apiKeyMatches(first.key, record!.hash)).toBe(false);
  });

  it("rotation with grace remembers the PREVIOUS digest with a future expiry", async () => {
    const first = await createApiKey();
    const second = await createApiKey({ graceHours: 1 });
    const record = await getApiKeyRecord();
    expect(record!.hash).toBe(hashApiKey(second.key));
    expect(record!.prevHash).toBe(hashApiKey(first.key));
    expect(isPrevKeyLive(record!)).toBe(true);
    // The OLD plaintext still matches the stored PREV digest (gate path).
    expect(apiKeyMatches(first.key, record!.prevHash!)).toBe(true);
  });

  it("rotating twice inside a window drops the older key (one prev max)", async () => {
    const first = await createApiKey();
    const second = await createApiKey({ graceHours: 1 });
    await createApiKey({ graceHours: 1 }); // third rotation
    const record = await getApiKeyRecord();
    expect(record!.prevHash).toBe(hashApiKey(second.key));
    expect(record!.prevHash).not.toBe(hashApiKey(first.key));
    expect(apiKeyMatches(first.key, record!.prevHash!)).toBe(false);
  });

  it("graceHours is clamped: 0 clears prev, huge values cap at MAX_GRACE_HOURS", async () => {
    await createApiKey();
    await createApiKey({ graceHours: 999 });
    let record = await getApiKeyRecord();
    const maxWindow = MAX_GRACE_HOURS * 3_600_000 + 5_000;
    expect(record!.prevExpiresAt!).toBeLessThanOrEqual(Date.now() + maxWindow);
    expect(record!.prevExpiresAt!).toBeGreaterThan(Date.now() + MAX_GRACE_HOURS * 3_600_000 - 60_000);

    await createApiKey({ graceHours: 0 });
    record = await getApiKeyRecord();
    expect(record!.prevHash).toBeNull();
    expect(isPrevKeyLive(record!)).toBe(false);
  });

  it("revoke clears EVERYTHING (current + grace)", async () => {
    await createApiKey();
    await createApiKey({ graceHours: 1 });
    expect(await revokeApiKey()).toBe(true);
    expect(await getApiKeyRecord()).toBeNull();
    expect(await revokeApiKey()).toBe(false);
  });
});

describe("isPrevKeyLive (pure)", () => {
  it("requires BOTH a hash and an unexpired timestamp", () => {
    const now = 1_000_000;
    expect(isPrevKeyLive({ prevHash: "h", prevExpiresAt: now + 1 }, now)).toBe(true);
    expect(isPrevKeyLive({ prevHash: "h", prevExpiresAt: now }, now)).toBe(false);
    expect(isPrevKeyLive({ prevHash: "h", prevExpiresAt: now - 1 }, now)).toBe(false);
    expect(isPrevKeyLive({ prevHash: null, prevExpiresAt: now + 1 }, now)).toBe(false);
    expect(isPrevKeyLive({ prevHash: "h", prevExpiresAt: null }, now)).toBe(false);
  });
});

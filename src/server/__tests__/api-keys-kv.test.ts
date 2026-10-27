/**
 * #4 E.2 — API key KV persistence through the REAL queries layer (sql.js
 * harness): grace storage on rotate, immediate invalidate by default,
 * revoke clears both current and grace rows.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../queries/__tests__/integration-setup";
import { NextRequest } from "next/server";
import { hashApiKey, apiKeyMatches } from "@/lib/api-key";
import {
  createApiKey,
  getApiKeyRecord,
  revokeApiKey,
  isPrevKeyLive,
  MAX_GRACE_HOURS,
  recordApiKeyUsed,
} from "@/server/api-keys";
import { apiGate } from "@/server/api-auth";
import { getSetting, updateSetting } from "@/server/queries";

const KV_LAST_USED_KEY = "apiKeyLastUsedAt";

beforeEach(async () => {
  await revokeApiKey();
});

let ipCounter = 0;
/** Real gate call, real KV — no mocks anywhere on this path (E.25). */
function gateWith(key: string): Promise<Awaited<ReturnType<typeof apiGate>>> {
  ipCounter += 1;
  return apiGate(
    new NextRequest("http://localhost:3000/api/v1/links", {
      headers: {
        authorization: ["Bearer", key].join(" "),
        "x-forwarded-for": `10.200.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      },
    }),
  );
}
async function statusOf(key: string): Promise<number> {
  const gate = await gateWith(key);
  return gate.ok ? 200 : gate.response.status;
}

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

describe("E.25 gate end-to-end (REAL kv, REAL apiGate, zero mocks)", () => {
  it("revoke stops the SAME key mid-session — no cached auth", async () => {
    const { key } = await createApiKey();
    expect(await statusOf(key)).toBe(200); // live through the gate first

    expect(await revokeApiKey()).toBe(true);

    const gate = await gateWith(key);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(401);
      const body = await gate.response.json();
      expect(body.error.code).toBe("unauthorized");
    }
    // and again — the denial is stable, not a race
    expect(await statusOf(key)).toBe(401);
  });

  it("default rotation kills the OLD key at the gate instantly", async () => {
    const first = await createApiKey();
    expect(await statusOf(first.key)).toBe(200);

    const second = await createApiKey(); // no grace (decision #4)
    expect(await statusOf(first.key)).toBe(401);
    expect(await statusOf(second.key)).toBe(200);
  });

  it("mid-grace revoke kills BOTH keys through the gate at once", async () => {
    const oldKey = await createApiKey();
    const newKey = await createApiKey({ graceHours: 1 });

    // both authenticate while the window is open
    expect(await statusOf(oldKey.key)).toBe(200);
    expect(await statusOf(newKey.key)).toBe(200);

    expect(await revokeApiKey()).toBe(true);

    expect(await statusOf(oldKey.key)).toBe(401); // grace row cleared
    expect(await statusOf(newKey.key)).toBe(401);
    expect(await getApiKeyRecord()).toBeNull();
  });

  it("lastUsedAt updates through the gate (no write caching either)", async () => {
    const { key } = await createApiKey();
    await statusOf(key);
    const after = await getApiKeyRecord();
    expect(after!.lastUsedAt).not.toBeNull();
  });
});

describe("E.34 recordApiKeyUsed write-path audit", () => {
  it("writes once for a stale value, THROTTLES inside 60s, and always writes from null", async () => {
    // Stale marker → first call must perform the KV write.
    const marker = "2000-01-01T00:00:00.000Z";
    await updateSetting(KV_LAST_USED_KEY, marker);
    await recordApiKeyUsed(marker);
    const after1 = await getSetting(KV_LAST_USED_KEY);
    expect(after1).not.toBe(marker); // wrote
    expect(Number.isNaN(Date.parse(after1!))).toBe(false); // a real ISO timestamp

    // Fresh value → second call must SKIP (exact string unchanged).
    // The sleep guarantees any rewrite would land on a different millisecond.
    await new Promise((r) => setTimeout(r, 15));
    await recordApiKeyUsed(after1!);
    expect(await getSetting(KV_LAST_USED_KEY)).toBe(after1); // throttled

    // null lastUsedAt (record never used) → unconditional write path.
    await new Promise((r) => setTimeout(r, 5));
    await recordApiKeyUsed(null);
    expect(await getSetting(KV_LAST_USED_KEY)).not.toBe(after1);
  });

  it("the gate only ever writes at most once per window (single reader, no re-read)", async () => {
    // The gate passes record.lastUsedAt from its ONE getApiKeyRecord read —
    // proven by api-auth.test asserting recordApiKeyUsed(<record value>).
    // Here: two rapid gate passes under a fresh lastUsedAt don't move KV.
    await revokeApiKey();
    const { key } = await createApiKey();
    await statusOf(key); // first pass may write
    const v1 = await getSetting(KV_LAST_USED_KEY);
    await statusOf(key); // within window → throttled
    expect(await getSetting(KV_LAST_USED_KEY)).toBe(v1);
  });
});

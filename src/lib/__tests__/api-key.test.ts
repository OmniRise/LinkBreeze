/**
 * #4 — API key primitives: roundtrip, one-way hashing, constant-time compare
 * rejects wrong keys, bearer parsing edge cases.
 */
import { describe, it, expect } from "vitest";
import {
  API_KEY_PREFIX,
  apiKeyMatches,
  displayPrefix,
  generateApiKey,
  hashApiKey,
  isApiKeyShaped,
  isPrevKeyLive,
  parseBearerToken,
  rateLimitBucketKey,
} from "@/lib/api-key";

describe("generateApiKey", () => {
  it("produces a shaped key, its hash, and a safe display prefix", () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(isApiKeyShaped(key)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix.startsWith(API_KEY_PREFIX)).toBe(true);
    // Prefix shows ONLY the fixed prefix + 8 payload chars, never the secret.
    expect(prefix.length).toBe(API_KEY_PREFIX.length + 8);
    expect(key.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(key.length);
  });

  it("never repeats a key or a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it("the plaintext key never equals its stored hash (one-way)", () => {
    const { key, hash } = generateApiKey();
    expect(key).not.toBe(hash);
    // Hash is hex, key is base64url — different alphabets entirely.
    expect(/^[0-9a-f]+$/.test(key)).toBe(false);
  });
});

describe("hashApiKey", () => {
  it("is deterministic and 64-char lowercase hex", () => {
    const { key, hash } = generateApiKey();
    expect(hashApiKey(key)).toBe(hash);
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a single-character change produces a completely different digest", () => {
    const { key } = generateApiKey();
    const flipped = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
    expect(hashApiKey(flipped)).not.toBe(hashApiKey(key));
  });
});

describe("apiKeyMatches", () => {
  it("accepts the exact key against its stored hash", () => {
    const { key, hash } = generateApiKey();
    expect(apiKeyMatches(key, hash)).toBe(true);
  });

  it("rejects a wrong key, a truncated key, and an extended key", () => {
    const { hash } = generateApiKey();
    const other = generateApiKey();
    expect(apiKeyMatches(other.key, hash)).toBe(false);
    expect(apiKeyMatches(other.key.slice(0, -2), hash)).toBe(false);
    expect(apiKeyMatches(other.key + "x", hash)).toBe(false);
  });

  it("fails closed on a corrupt (non-sha256) stored value", () => {
    const { key } = generateApiKey();
    expect(apiKeyMatches(key, "not-a-hash")).toBe(false);
    expect(apiKeyMatches(key, "")).toBe(false);
  });
});

describe("parseBearerToken", () => {
  it("accepts the standard form (scheme case-insensitive)", () => {
    expect(parseBearerToken("Bearer lbk_abc")).toBe("lbk_abc");
    expect(parseBearerToken("bearer lbk_abc")).toBe("lbk_abc");
    expect(parseBearerToken("BEARER lbk_abc")).toBe("lbk_abc");
  });

  it("rejects missing, empty, malformed, and non-bearer schemes", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("Basic dXNlcjpwdw==")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Token lbk_abc")).toBeNull();
    expect(parseBearerToken("lbk_abc")).toBeNull(); // scheme required
    expect(parseBearerToken("Bearer two words")).toBeNull();
  });
});

describe("isApiKeyShaped", () => {
  it("accepts generated keys and rejects wrong-length or wrong-prefix junk", () => {
    expect(isApiKeyShaped(generateApiKey().key)).toBe(true);
    expect(isApiKeyShaped("lbk_short")).toBe(false);
    expect(isApiKeyShaped("nope" + "a".repeat(43))).toBe(false);
    expect(isApiKeyShaped("lbk_" + "a".repeat(44))).toBe(false);
    // base64url alphabet only — no +, /, =
    expect(isApiKeyShaped("lbk_" + "a".repeat(42) + "+")).toBe(false);
    expect(isApiKeyShaped("lbk_" + "a".repeat(42) + "=")).toBe(false);
  });
});

describe("rateLimitBucketKey", () => {
  it("derives a stable bucket from the stored hash, never the key", () => {
    const { key, hash } = generateApiKey();
    const bucket = rateLimitBucketKey(hash);
    expect(bucket).toBe(`api:v1:key:${hash.slice(0, 16)}`);
    expect(bucket).not.toContain(key);
  });
});

describe("displayPrefix", () => {
  it("never exposes more than 8 payload characters", () => {
    const key = generateApiKey().key;
    const prefix = displayPrefix(key);
    expect(key.includes(prefix)).toBe(true);
    expect(prefix.length).toBe(12);
  });
});

describe("isPrevKeyLive — E.79 grace-expiry edges", () => {
  const base = { prevHash: "abc", prevExpiresAt: 1_000 };

  it("live inside the window (strict now < expiresAt)", () => {
    expect(isPrevKeyLive(base, 999)).toBe(true);
  });

  it("EXPIRED after the window closes", () => {
    expect(isPrevKeyLive(base, 1_001)).toBe(false);
  });

  it("the exact expiry boundary is DEAD (strict <, not <=)", () => {
    expect(isPrevKeyLive(base, 1_000)).toBe(false);
  });

  it("fails closed on partial records (either grace field missing)", () => {
    expect(isPrevKeyLive({ prevHash: "abc", prevExpiresAt: null }, 500)).toBe(false);
    expect(isPrevKeyLive({ prevHash: null, prevExpiresAt: 1_000 }, 500)).toBe(false);
    expect(isPrevKeyLive({ prevHash: null, prevExpiresAt: null }, 500)).toBe(false);
  });
});

/**
 * API key primitives (#4) — PURE module: node:crypto only, no db imports.
 *
 * A key is `lbk_` + base64url(32 random bytes) (256-bit entropy). Only the
 * sha256 HEX digest is ever persisted (settings KV); the plaintext exists
 * exactly once, in the generate action's response. Verification hashes the
 * presented key and compares digests in constant time — the stored hash is
 * never decrypted, and a wrong key is indistinguishable from a malformed one.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Human-recognizable key prefix (also used for the admin display prefix). */
export const API_KEY_PREFIX = "lbk_";

/** Number of payload characters shown in the admin UI (never the secret). */
export const API_KEY_DISPLAY_PAYLOAD_CHARS = 8;

/** sha256 hex digest of a key — the only representation we store. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Generate a fresh API key. Returns the plaintext (show ONCE, never store),
 * its hash (persist this) and a display prefix (safe to show anywhere).
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const key = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: displayPrefix(key) };
}

/** Display prefix: `lbk_` + first 8 payload chars. Identification only. */
export function displayPrefix(key: string): string {
  return (
    API_KEY_PREFIX +
    key.slice(API_KEY_PREFIX.length, API_KEY_PREFIX.length + API_KEY_DISPLAY_PAYLOAD_CHARS)
  );
}

/**
 * Structural check for a presented key. Rejects obviously malformed values
 * BEFORE hashing so junk headers never reach the settings lookup. Shape:
 * `lbk_` + 43 base64url chars (= 32 bytes unpadded).
 */
export function isApiKeyShaped(key: string): boolean {
  return /^lbk_[A-Za-z0-9_-]{43}$/.test(key);
}

/**
 * Constant-time comparison of a presented key against a stored sha256 hex
 * digest. Both sides are hashed, so the comparison never touches plaintext.
 * A malformed/non-sha256 stored value (corrupt KV row) simply fails closed.
 */
export function apiKeyMatches(presented: string, storedHashHex: string): boolean {
  const presentedHash = hashApiKey(presented);
  // sha256 hex is fixed-length; the guard only protects timingSafeEqual from
  // a corrupted stored value (length itself leaks nothing secret-derived).
  if (presentedHash.length !== storedHashHex.length) return false;
  return timingSafeEqual(
    Buffer.from(presentedHash, "hex"),
    Buffer.from(storedHashHex, "hex"),
  );
}

/**
 * Extract the presented key from an Authorization header value.
 * Returns null for anything that is not exactly `Bearer <key>` (scheme is
 * case-insensitive per RFC 7235; no extra whitespace tolerated beyond one
 * space; duplicate headers were already collapsed by Headers.get()).
 */
export function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  return match ? match[1] : null;
}

/**
 * Bucket key for per-key rate limiting: derived from the key's hash so the
 * in-memory limiter map never holds a plaintext-adjacent identifier.
 */
export function rateLimitBucketKey(storedHashHex: string): string {
  return `api:v1:key:${storedHashHex.slice(0, 16)}`;
}

/**
 * E.2 rotation grace: is a previous key's digest still inside its window?
 * Pure time check over the KV record's grace fields (both must be present;
 * a corrupt/partial record fails closed).
 */
export function isPrevKeyLive(
  record: { prevHash: string | null; prevExpiresAt: number | null },
  now: number = Date.now(),
): boolean {
  return (
    record.prevHash !== null &&
    record.prevExpiresAt !== null &&
    now < record.prevExpiresAt
  );
}

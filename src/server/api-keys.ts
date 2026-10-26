/**
 * API key persistence (#4) — settings KV storage for the single API key.
 *
 * Only the sha256 HASH is stored (plus a display prefix and timestamps).
 * The plaintext exists solely in the generate action's one-time response.
 *
 * KV keys:
 *   apiKeyHash        sha256 hex of the key (the credential itself)
 *   apiKeyPrefix      `lbk_` + 8 payload chars (display only)
 *   apiKeyCreatedAt   ISO timestamp
 *   apiKeyLastUsedAt  ISO timestamp (throttled writes, see recordApiKeyUsed)
 */
import {
  getSetting,
  updateSetting,
  deleteSetting,
} from "@/server/queries";
import { generateApiKey } from "@/lib/api-key";

const KV_HASH = "apiKeyHash";
const KV_PREFIX = "apiKeyPrefix";
const KV_CREATED = "apiKeyCreatedAt";
const KV_LAST_USED = "apiKeyLastUsedAt";

export interface ApiKeyRecord {
  /** sha256 hex — compare against this, never store the key. */
  hash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Load the persisted key record. Null when no key has been generated (or it
 * was revoked) — every API request in that state is a 401.
 */
export async function getApiKeyRecord(): Promise<ApiKeyRecord | null> {
  const [hash, prefix, createdAt, lastUsedAt] = await Promise.all([
    getSetting(KV_HASH),
    getSetting(KV_PREFIX),
    getSetting(KV_CREATED),
    getSetting(KV_LAST_USED),
  ]);
  if (!hash) return null;
  return {
    hash,
    prefix: prefix ?? "",
    createdAt: createdAt ?? "",
    lastUsedAt: lastUsedAt ?? null,
  };
}

/**
 * Generate AND persist a new key, invalidating any previous one (generate =
 * rotate — single-key model, DESIGN-4.md). Returns the plaintext exactly
 * once; callers must never persist or re-derive it.
 */
export async function createApiKey(): Promise<{
  key: string;
  prefix: string;
  createdAt: string;
}> {
  const { key, hash, prefix } = generateApiKey();
  const createdAt = new Date().toISOString();
  await updateSetting(KV_HASH, hash);
  await updateSetting(KV_PREFIX, prefix);
  await updateSetting(KV_CREATED, createdAt);
  await updateSetting(KV_LAST_USED, "");
  return { key, prefix, createdAt };
}

/** Delete every KV row backing the key. Returns true if one existed. */
export async function revokeApiKey(): Promise<boolean> {
  const existing = await getApiKeyRecord();
  if (!existing) return false;
  await Promise.all([
    deleteSetting(KV_HASH),
    deleteSetting(KV_PREFIX),
    deleteSetting(KV_CREATED),
    deleteSetting(KV_LAST_USED),
  ]);
  return true;
}

/** Throttle: one last-used write per key per minute, max. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/**
 * Record a successful authentication. Writes at most once per minute so the
 * hot request path never becomes write-bound; failures are swallowed (the
 * timestamp is operational metadata, not security state).
 */
export async function recordApiKeyUsed(lastUsedAt: string | null): Promise<void> {
  const now = Date.now();
  if (lastUsedAt) {
    const prev = Date.parse(lastUsedAt);
    if (!Number.isNaN(prev) && now - prev < LAST_USED_WRITE_INTERVAL_MS) return;
  }
  try {
    await updateSetting(KV_LAST_USED, new Date(now).toISOString());
  } catch {
    // best-effort metadata only
  }
}

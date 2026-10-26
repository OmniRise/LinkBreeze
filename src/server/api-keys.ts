/**
 * API key persistence (#4) — settings KV storage for the single API key.
 *
 * Only the sha256 HASH is stored (plus a display prefix and timestamps).
 * The plaintext exists solely in the generate action's one-time response.
 *
 * Rotation with grace (E.2): rotating optionally keeps the PREVIOUS key
 * valid for a bounded window (1-24h, admin checkbox, default off) so
 * automation can migrate without downtime. At most one previous key is ever
 * remembered — rotating again drops the older one.
 *
 * KV keys:
 *   apiKeyHash         sha256 hex of the key (the credential itself)
 *   apiKeyPrefix       `lbk_` + 8 payload chars (display only)
 *   apiKeyCreatedAt    ISO timestamp
 *   apiKeyLastUsedAt   ISO timestamp (throttled writes, see recordApiKeyUsed)
 *   apiKeyPrevHash     sha256 hex of the previous key (rotation grace only)
 *   apiKeyPrevExpiresAt epoch-ms string when the previous key dies
 */
import { getSetting, updateSetting, deleteSetting } from "@/server/queries";
import { generateApiKey, isPrevKeyLive } from "@/lib/api-key";

// Re-exported for callers that treat this module as the KV facade.
export { isPrevKeyLive };

const KV_HASH = "apiKeyHash";
const KV_PREFIX = "apiKeyPrefix";
const KV_CREATED = "apiKeyCreatedAt";
const KV_LAST_USED = "apiKeyLastUsedAt";
const KV_PREV_HASH = "apiKeyPrevHash";
const KV_PREV_EXPIRES = "apiKeyPrevExpiresAt";

/** Grace window bounds (conservative: minutes to a day, never permanent). */
export const MAX_GRACE_HOURS = 24;

export interface ApiKeyRecord {
  /** sha256 hex — compare against this, never store the key. */
  hash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Previous key's digest while a rotation grace window is open. */
  prevHash: string | null;
  /** Epoch ms when the previous key stops authenticating. */
  prevExpiresAt: number | null;
}

/**
 * Load the persisted key record. Null when no key has been generated (or it
 * was revoked) — every API request in that state is a 401.
 */
export async function getApiKeyRecord(): Promise<ApiKeyRecord | null> {
  const [hash, prefix, createdAt, lastUsedAt, prevHash, prevExpiresRaw] =
    await Promise.all([
      getSetting(KV_HASH),
      getSetting(KV_PREFIX),
      getSetting(KV_CREATED),
      getSetting(KV_LAST_USED),
      getSetting(KV_PREV_HASH),
      getSetting(KV_PREV_EXPIRES),
    ]);
  if (!hash) return null;
  const prevExpiresAt = prevExpiresRaw ? Number(prevExpiresRaw) : null;
  return {
    hash,
    prefix: prefix ?? "",
    createdAt: createdAt ?? "",
    lastUsedAt: lastUsedAt ?? null,
    prevHash: prevHash ?? null,
    prevExpiresAt: Number.isFinite(prevExpiresAt) ? prevExpiresAt : null,
  };
}

/**
 * Generate AND persist a new key (generate = rotate — single-key model,
 * DESIGN-4.md). With `graceHours` > 0 the PREVIOUS key keeps authenticating
 * until the window closes — bounded to [1, MAX_GRACE_HOURS]; 0/omitted
 * keeps the original instant-invalidate behavior. Returns the new plaintext
 * exactly once; callers must never persist or re-derive it.
 */
export async function createApiKey(
  opts?: { graceHours?: number },
): Promise<{ key: string; prefix: string; createdAt: string }> {
  const graceHours = Math.min(
    MAX_GRACE_HOURS,
    Math.max(0, Math.floor(opts?.graceHours ?? 0)),
  );
  const existing = graceHours > 0 ? await getApiKeyRecord() : null;

  const { key, hash, prefix } = generateApiKey();
  const createdAt = new Date().toISOString();
  await updateSetting(KV_HASH, hash);
  await updateSetting(KV_PREFIX, prefix);
  await updateSetting(KV_CREATED, createdAt);
  await updateSetting(KV_LAST_USED, "");

  if (graceHours > 0 && existing) {
    // Only the immediate predecessor is remembered; an older grace entry is
    // overwritten (rotating twice inside a window kills the first key).
    await updateSetting(KV_PREV_HASH, existing.hash);
    await updateSetting(
      KV_PREV_EXPIRES,
      String(Date.now() + graceHours * 3_600_000),
    );
  } else {
    await Promise.all([
      deleteSetting(KV_PREV_HASH),
      deleteSetting(KV_PREV_EXPIRES),
    ]);
  }

  return { key, prefix, createdAt };
}

/** Delete every KV row backing the key (current AND any grace entry). */
export async function revokeApiKey(): Promise<boolean> {
  const existing = await getApiKeyRecord();
  if (!existing) return false;
  await Promise.all([
    deleteSetting(KV_HASH),
    deleteSetting(KV_PREFIX),
    deleteSetting(KV_CREATED),
    deleteSetting(KV_LAST_USED),
    deleteSetting(KV_PREV_HASH),
    deleteSetting(KV_PREV_EXPIRES),
  ]);
  return true;
}

/** Is the previous key still inside its grace window? (isPrevKeyLive lives
 *  in the pure @/lib/api-key module and is re-exported above.) */

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

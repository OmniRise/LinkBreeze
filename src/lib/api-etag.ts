/**
 * #4 E.8 — conditional GET support: strong ETags over serialized payloads
 * plus If-None-Match evaluation. Pure (node:crypto only), fixture-testable.
 *
 * Scope decision (see backlog decision #13): ETag/304 on GET /api/v1/links
 * and GET /api/v1/profile only. Cache-Control stays `no-store` (consistent
 * with the rest of v1 — pollers hold the ETag themselves and send it back;
 * we never invite shared caches to store authenticated bodies).
 */
import { createHash } from "node:crypto";

/**
 * Strong ETag for a payload: quote + first 32 hex chars of sha256 of the
 * exact JSON serialization the response would carry.
 */
export function etagFor(payload: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return `"${digest.slice(0, 32)}"`;
}

/**
 * Evaluate an If-None-Match header against our ETag (RFC 9110 semantics:
 * `*` matches any current representation; weak comparison — the W/ prefix
 * is ignored on both sides; comma-separated lists supported).
 */
export function etagNotModified(
  headerValue: string | null | undefined,
  etag: string,
): boolean {
  if (!headerValue) return false;
  const candidates = headerValue
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (candidates.length === 0) return false;
  if (candidates.includes("*")) return true;
  const stripWeak = (t: string) => (t.startsWith("W/") ? t.slice(2) : t);
  const target = stripWeak(etag);
  return candidates.some((c) => stripWeak(c) === target);
}

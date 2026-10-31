import * as crypto from "crypto";

/**
 * Session token encoding / verification — shared between auth.ts (server-side)
 * and proxy.ts (middleware). Has zero dependency on next/headers so it is safe
 * to import from the middleware / proxy layer.
 */

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

export interface SessionPayload {
  userId: number;
  username: string;
  exp: number;
  /** Password version — bumped on password change to invalidate old sessions */
  pv: number;
  /**
   * #124 multi-user: role claim. Absent on tokens minted before multi-user —
   * verifyToken normalizes it to "admin" so the bootstrapped admin is never
   * demoted. See src/lib/ownership.ts.
   */
  role?: string;
}

const DEFAULT_SECRET = "linkbreeze-dev-secret-key-change-me-in-production-please";

function getSecret(): string {
  const key = process.env.SECRET_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[LinkBreeze] FATAL: SECRET_KEY is not set. " +
          "This should have been auto-generated on boot (check server logs for " +
          "'[auth] No SECRET_KEY found'). If the data volume is read-only, set " +
          "SECRET_KEY explicitly (e.g. `openssl rand -hex 32`).",
      );
    }
    return DEFAULT_SECRET;
  }
  return key;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  return Buffer.from(padded, "base64").toString("utf8");
}

export function createToken(payload: SessionPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(encoded);
  // Constant-time compare to mitigate timing attacks
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }
    // Tokens minted before the pv field existed (pv=undefined) are treated as
    // version 0 — they will be re-issued with a proper pv on next login.
    if (payload.pv === undefined) payload.pv = 0;
    // #124: tokens minted before multi-user carry no role. Treat them as admin
    // (never silently demote the bootstrapped admin); the value is normalized
    // so downstream checks can rely on a concrete string.
    if (payload.role !== "owner") payload.role = "admin";
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_MAX_AGE };

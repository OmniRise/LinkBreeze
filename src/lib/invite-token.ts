import { createHash } from "node:crypto";

/**
 * Invitation token hashing (#124 follow-up, stage 1). Only the SHA-256 hash
 * is stored; the raw token exists solely in the invite link. Pure module so
 * tests and actions share the exact same derivation.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const INVITE_TTL_DAYS = 7;

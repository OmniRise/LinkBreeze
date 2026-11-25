"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  generateSecret,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  otpauthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  trustToken,
  verifyTrustToken,
} from "@/lib/two-factor";
import { verifyPendingToken } from "@/lib/totp-pending";
import {
  getUserByUsername,
  getUserById,
  setUserTotp,
} from "@/server/queries";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  rateLimitError,
  ErrorCode,
  logError,
} from "@/lib/errors";
import { clientIp } from "@/lib/rate-limit-ip";

/**
 * #5 TOTP two-factor authentication — server actions.
 *
 * Login flow shape: login() validates credentials; when the user has 2FA
 * enabled it returns errorCode TOTP_REQUIRED (see errors.ts) with a short-
 * lived pending token, and verifyLoginTotp() completes the login. The actual
 * session is ONLY created after the second factor verifies.
 */

const TRUST_COOKIE = "lb_totp_trust";
const TRUST_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ─── pending-login token (between password step and TOTP step) ───────────
// Lives in src/lib/totp-pending.ts ("use server" files can only export
// async functions; these are pure sync crypto).

// ─── shared helpers ──────────────────────────────────────────────────────

async function clientUserAgent(): Promise<string> {
  const h = await headers();
  return h.get("user-agent") ?? "";
}

/** Per-IP + global throttle for TOTP code attempts (reuse login buckets). */
async function totpRateLimit(ip: string): Promise<ActionResult | null> {
  const { rateLimit } = await import("@/lib/rate-limit");
  const perIp = rateLimit(`totp:${ip}`, 5, 60_000);
  if (!perIp.ok) return rateLimitError(Math.ceil((perIp.resetAt - Date.now()) / 1000));
  const global = rateLimit("totp:global", 15, 60_000);
  if (!global.ok) return rateLimitError(Math.ceil((global.resetAt - Date.now()) / 1000));
  return null;
}

async function isTrustedDevice(userId: number, secretBase32: string): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(TRUST_COOKIE)?.value;
  if (!raw) return false;
  const [token, ...uas] = raw.split("|");
  const ua = uas.join("|"); // UA may contain pipes — it's the last component
  return verifyTrustToken(token, userId, secretBase32, ua);
}

async function setTrustCookie(userId: number, secretBase32: string): Promise<void> {
  const ua = await clientUserAgent();
  const store = await cookies();
  store.set(TRUST_COOKIE, `${trustToken(userId, secretBase32, ua)}|${ua}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await headers()).get("x-forwarded-proto")?.split(",").pop()!.trim().toLowerCase() === "https",
    path: "/",
    maxAge: TRUST_MAX_AGE,
  });
}

// ─── 1. login integration ────────────────────────────────────────────────

const totpStepSchema = z.object({
  username: z.string().min(1).max(64),
  pending: z.string().min(1),
  code: z.string().min(6).max(16),
  trust: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

/**
 * Step 2 of the login: verify the TOTP code (or a recovery code) and mint
 * the session. login() hands off here when 2FA is enabled.
 */
export async function verifyLoginTotp(formData: FormData): Promise<ActionResult> {
  const h = await headers();
  const ip = clientIp(h);
  const limited = await totpRateLimit(ip);
  if (limited) return limited;

  const parsed = totpStepSchema.safeParse({
    username: formData.get("username"),
    pending: formData.get("pending"),
    code: formData.get("code"),
    trust: formData.get("trust"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  // login() mints the pending token over the DB username — trim here too so
  // a stray space in the form field can't desync the two steps.
  const username = parsed.data.username.trim();
  const { pending, code, trust } = parsed.data;

  if (!verifyPendingToken(pending, username)) {
    return {
      success: false,
      error: "This login attempt expired. Please sign in again.",
      errorCode: ErrorCode.UNAUTHORIZED,
    };
  }

  const user = await getUserByUsername(username.trim());
  if (!user || !user.totpEnabled || !user.totpSecret) {
    // No 2FA state? The pending token is stale or the state changed — fail closed.
    return unauthorizedError();
  }
  const secret = decryptSecret(user.totpSecret);
  if (!secret) {
    logError("verifyLoginTotp", new Error("totp_secret decrypt failed"), { userId: user.id });
    return {
      success: false,
      error: "Two-factor state is unreadable (was SECRET_KEY changed?). Sign in with a recovery code or reset 2FA.",
      errorCode: ErrorCode.INTERNAL,
    };
  }

  // Trusted device? The user never should have reached this step, but if a
  // cookie exists and verifies, complete the login without burning a code.
  if (await isTrustedDevice(user.id, secret)) {
    const { createSession } = await import("@/lib/auth");
    await createSession(user.id, user.username);
    return { success: true };
  }

  // TOTP code first, then recovery codes as fallback.
  let usedRecoveryIndex = -1;
  let ok = verifyTotp(secret, code);
  if (!ok && user.recoveryCodes) {
    try {
      const hashes = JSON.parse(user.recoveryCodes) as string[];
      for (let i = 0; i < hashes.length; i++) {
        if (await verifyRecoveryCode(code.toLowerCase(), hashes[i])) {
          ok = true;
          usedRecoveryIndex = i;
          break;
        }
      }
      if (usedRecoveryIndex >= 0) {
        hashes.splice(usedRecoveryIndex, 1);
        await setUserTotp(user.id, {
          totpSecret: user.totpSecret,
          totpEnabled: true,
          recoveryCodes: JSON.stringify(hashes),
        });
      }
    } catch (err) {
      logError("verifyLoginTotp:recovery", err, { userId: user.id });
    }
  }

  if (!ok) {
    return {
      success: false,
      error: "Invalid authentication code.",
      errorCode: ErrorCode.UNAUTHORIZED,
    };
  }

  if (trust) await setTrustCookie(user.id, secret);
  const { createSession } = await import("@/lib/auth");
  await createSession(user.id, user.username);
  return { success: true };
}

// ─── 2. setup flow (admin, authenticated) ────────────────────────────────

/**
 * Generate a fresh TOTP secret for the current admin. Returns the otpauth://
 * URI (client renders the QR) + the plaintext secret (for manual entry).
 * The secret is stored encrypted but INACTIVE until confirmTotpSetup verifies
 * a live code — a half-finished setup never locks the admin out.
 */
export async function startTotpSetup(): Promise<
  { success: true; uri: string; secret: string } | { success: false; error: string; errorCode: ErrorCode }
> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return unauthorizedError();

  const user = await getUserById(session.userId);
  if (!user) return unauthorizedError();
  if (user.totpEnabled) {
    return {
      success: false,
      error: "Two-factor authentication is already enabled. Disable it first to re-enroll.",
      errorCode: ErrorCode.CONFLICT,
    };
  }

  const secret = generateSecret();
  await setUserTotp(user.id, {
    totpSecret: encryptSecret(secret),
    totpEnabled: false, // inactive until confirmed
    recoveryCodes: user.recoveryCodes,
  });
  // The QR endpoint renders from this short-lived cookie; the secret itself
  // never appears in any URL or API response consumed by the QR route.
  const store = await cookies();
  store.set("lb_totp_setup_uri", otpauthUri(secret, user.username), {
    // carries the plaintext otpauth secret — never send it over plain HTTP
    secure: (await headers()).get("x-forwarded-proto")?.split(",").pop()!.trim().toLowerCase() === "https",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 min to finish setup
  });
  return { success: true, uri: otpauthUri(secret, user.username), secret };
}

const confirmSchema = z.object({ code: z.string().min(6).max(9) });

/**
 * Complete setup: verify one live code against the pending (inactive) secret,
 * then activate 2FA and return the one-time recovery codes (plaintext, shown
 * once; only hashes are stored).
 */
export async function confirmTotpSetup(formData: FormData): Promise<
  { success: true; recoveryCodes: string[] } | { success: false; error: string; errorCode: ErrorCode }
> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return unauthorizedError();

  // Confirm is authenticated-only but still a 6-digit guessing surface —
  // same throttle as the login TOTP step.
  const h = await headers();
  const ip = clientIp(h);
  const limited = await totpRateLimit(ip);
  if (limited && !limited.success) {
    return {
      success: false,
      error: limited.error ?? "Too many attempts. Wait a minute and try again.",
      errorCode: limited.errorCode ?? ErrorCode.RATE_LIMIT,
    };
  }

  const parsed = confirmSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code");
  }

  const user = await getUserById(session.userId);
  if (!user || !user.totpSecret) {
    return validationError("No pending two-factor setup. Start again.");
  }
  if (user.totpEnabled) {
    return { success: false, error: "Two-factor authentication is already enabled.", errorCode: ErrorCode.CONFLICT };
  }
  const secret = decryptSecret(user.totpSecret);
  if (!secret) {
    return {
      success: false,
      error: "Two-factor state is unreadable (was SECRET_KEY changed?). Start setup again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }

  if (!verifyTotp(secret, parsed.data.code)) {
    return validationError("That code didn't match. Check your authenticator and try again.");
  }

  const codes = generateRecoveryCodes(8);
  const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c)));
  await setUserTotp(user.id, {
    totpSecret: user.totpSecret,
    totpEnabled: true,
    recoveryCodes: JSON.stringify(hashes),
  });
  revalidatePath("/settings");
  return { success: true, recoveryCodes: codes };
}

const disableSchema = z.object({ code: z.string().min(6).max(16) });

/**
 * Disable 2FA. Requires a current TOTP code or a recovery code — losing the
 * authenticator is exactly when you need this, so recovery codes must work.
 */
/** Check a recovery code against the user's hashed recovery codes. */
async function verifyRecoveryCodeAgainstUser(
  user: { id: number; recoveryCodes: string | null },
  code: string,
): Promise<boolean> {
  if (!user.recoveryCodes) return false;
  try {
    const hashes = JSON.parse(user.recoveryCodes) as string[];
    for (const h of hashes) {
      if (await verifyRecoveryCode(code.toLowerCase(), h)) return true;
    }
  } catch (err) {
    logError("disableTotp:recovery", err, { userId: user.id });
  }
  return false;
}

export async function disableTotp(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return unauthorizedError();

  const parsed = disableSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Enter a code");
  }

  const user = await getUserById(session.userId);
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return validationError("Two-factor authentication is not enabled.");
  }
  const secret = decryptSecret(user.totpSecret);
  let ok = false;
  if (!secret) {
    // Unreadable state (e.g. SECRET_KEY rotated): TOTP cannot be verified,
    // so fail CLOSED to a recovery code — hashed independently of the TOTP
    // secret — instead of accepting any well-formed string. 2FA must keep
    // protecting the session exactly when the authenticator is gone.
    logError("disableTotp", new Error("totp_secret decrypt failed on disable"), { userId: user.id });
    ok = await verifyRecoveryCodeAgainstUser(user, parsed.data.code);
    if (!ok) {
      return {
        success: false,
        error: "Enter a valid recovery code to disable two-factor authentication.",
        errorCode: ErrorCode.UNAUTHORIZED,
      };
    }
  } else {
    ok = verifyTotp(secret, parsed.data.code);
    if (!ok) ok = await verifyRecoveryCodeAgainstUser(user, parsed.data.code);
    if (!ok) {
      return {
        success: false,
        error: "Invalid authentication code.",
        errorCode: ErrorCode.UNAUTHORIZED,
      };
    }
  }

  await setUserTotp(user.id, { totpSecret: null, totpEnabled: false, recoveryCodes: null });
  // Trust + setup cookies are bound to the secret — now invalid by construction. Clear ours.
  const store = await cookies();
  store.set(TRUST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  store.set("lb_totp_setup_uri", "", { httpOnly: true, path: "/", maxAge: 0 });
  revalidatePath("/settings");
  return { success: true };
}

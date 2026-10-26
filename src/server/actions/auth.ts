"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getSession,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  isLegacyBcryptHash,
} from "@/lib/auth";
import {
  getUserByUsername,
  getUserCount,
  createUser,
  getSetting,
} from "@/server/queries";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  rateLimitError,
  conflictError,
  notFoundError,
  ErrorCode,
  logError,
} from "@/lib/errors";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(64),
  password: z.string().min(1, "Password is required").max(256),
});

const setupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, dots, hyphens and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256)
    .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
    .refine((v) => /[0-9]/.test(v), "Password must contain at least one number"),
});

export async function login(formData: FormData): Promise<ActionResult> {
  // Rate limit: 5 login attempts per minute per IP to prevent brute-force.
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (h.get("x-real-ip") || "").toString() ||
    "0.0.0.0";
  const { rateLimit } = await import("@/lib/rate-limit");
  const rl = rateLimit(`login:${ip}`, 5, 60_000);
  if (!rl.ok) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return rateLimitError(retryAfter);
  }

  // Global login throttle (15/min regardless of IP) — closes the XFF-spoofing
  // bypass where an attacker rotates X-Forwarded-For to reset the per-IP bucket.
  // LinkBreeze is single-admin, so 15/min is generous for a real human.
  const globalRl = rateLimit("login:global", 15, 60_000);
  if (!globalRl.ok) {
    const retryAfter = Math.ceil((globalRl.resetAt - Date.now()) / 1000);
    return rateLimitError(retryAfter);
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { username, password } = parsed.data;
  const user = await getUserByUsername(username.trim());
  if (!user) {
    return { success: false, error: "Invalid username or password", errorCode: ErrorCode.UNAUTHORIZED };
  }

  // #124 multi-user: a disabled account cannot sign in at all. Checked after
  // the (constant-time) password verification so this does not leak whether a
  // username exists.
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: "Invalid username or password", errorCode: ErrorCode.UNAUTHORIZED };
  }
  if (user.status === "disabled") {
    return {
      success: false,
      error: "This account has been disabled. Contact your administrator.",
      errorCode: ErrorCode.FORBIDDEN,
    };
  }

  // #76 transparent migration: a legacy bcrypt hash that just verified is
  // re-hashed with Argon2id in place, so stored hashes upgrade naturally as
  // users log in. The user is already authenticated, so this must NOT bump
  // sessionVersion (that would invalidate every other session). Failure is
  // opportunistic — it must never block a legitimate login.
  if (isLegacyBcryptHash(user.passwordHash)) {
    try {
      const { updateUserPassword } = await import("@/server/queries");
      await updateUserPassword(user.id, await hashPassword(password));
    } catch (err) {
      logError("loginRehash", err, { userId: user.id });
    }
  }

  // #5: 2FA handoff. Credentials are valid, but the session is only minted
  // after the TOTP step (verifyLoginTotp) succeeds. Trusted devices skip it:
  // their trust cookie verifies against the stored (encrypted) secret.
  if (user.totpEnabled && user.totpSecret) {
    const { decryptSecret, verifyTrustToken } = await import("@/lib/two-factor");
    const secret = decryptSecret(user.totpSecret);
    if (secret) {
      const h2 = await import("next/headers");
      const trustCookie = (await (await h2.cookies()).get("lb_totp_trust"))?.value;
      if (trustCookie) {
        const [token, ...rest] = trustCookie.split("|");
        if (verifyTrustToken(token, user.id, secret, rest.join("|"))) {
          await createSession(user.id, user.username);
          return { success: true };
        }
      }
      const { pendingToken } = await import("@/lib/totp-pending");
      const pending = pendingToken(user.username, Date.now());
      return {
        success: false,
        error: "Enter your two-factor code",
        errorCode: ErrorCode.TOTP_REQUIRED,
        pending,
      } as ActionResult & { pending: string };
    }
    // Unreadable secret: fall through to a no-session error — admin must use recovery flow.
    return {
      success: false,
      error: "Two-factor state is unreadable (was SECRET_KEY changed?). See SECURITY.md for recovery.",
      errorCode: ErrorCode.INTERNAL,
    };
  }

  await createSession(user.id, user.username);
  return { success: true };
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function setup(formData: FormData): Promise<ActionResult> {
  // Only allow setup when no users exist yet.
  const count = await getUserCount();
  if (count > 0) {
    return conflictError("Setup has already been completed");
  }

  const parsed = setupSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { username, password } = parsed.data;
  const existing = await getUserByUsername(username.trim());
  if (existing) {
    return conflictError("Username already taken");
  }

  try {
    const passwordHash = await hashPassword(password);
    // The bootstrap user is the instance's first admin — they must be able to
    // manage accounts and global settings. createUser defaults to "owner".
    const user = await createUser(username.trim(), passwordHash, { role: "admin" });
    await createSession(user.id, user.username);
    return { success: true };
  } catch (err) {
    logError("setup", err, { username });
    return {
      success: false,
      error: "Something went wrong during setup. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/**
 * Change the password of the currently authenticated user.
 */
export async function changePassword(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) {
    return unauthorizedError();
  }

  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(256)
      .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
      .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
      .refine((v) => /[0-9]/.test(v), "Password must contain at least one number"),
  });

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const user = await getUserByUsername(session.username);
  if (!user) {
    return notFoundError("User not found");
  }

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return validationError("Current password is incorrect");
  }

  const newHash = await hashPassword(parsed.data.newPassword);

  // Bump session version to invalidate any other sessions (e.g. stolen cookies)
  const { updateSetting, updateUserPassword } = await import("@/server/queries");
  try {
    const [, currentVersionRaw] = await Promise.all([
      updateUserPassword(user.id, newHash),
      getSetting("sessionVersion"),
    ]);
    const currentVersion = Number(currentVersionRaw) || 0;
    await updateSetting("sessionVersion", String(currentVersion + 1));

    // Re-issue the current session with the new version
    await createSession(user.id, user.username);
    return { success: true };
  } catch (err) {
    logError("changePassword", err, { userId: user.id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

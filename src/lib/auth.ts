import "server-only";
import { cookies, headers } from "next/headers";
import {
  createToken,
  verifyToken,
  SESSION_MAX_AGE,
  type SessionPayload,
} from "@/lib/session-token";
import { getSetting } from "@/server/queries";

const SESSION_COOKIE = "lb_session";

export type { SessionPayload };

/**
 * Determine whether the current request was made over HTTPS.
 *
 * LinkBreeze is commonly accessed over plain HTTP on a LAN IP (e.g.
 * http://192.168.1.50:3000 or http://truenas:3000/docker). In production mode
 * a cookie flagged `secure` is silently rejected by the browser over HTTP,
 * which means the session is never set and the user is stuck on the login
 * page forever (GitHub issue #70).
 *
 * Instead of tying the flag to NODE_ENV, we inspect the actual transport:
 *   - X-Forwarded-Proto: https  → behind a TLS-terminating proxy (Caddy, nginx, Cloudflare)
 *   - Explicit https://         → direct HTTPS
 * Everything else (bare HTTP, LAN IP without proxy) gets a non-secure cookie
 * so login actually works. When a reverse proxy IS in front, it sends
 * X-Forwarded-Proto and we correctly upgrade to Secure.
 */
async function isHttps(): Promise<boolean> {
  const h = await headers();
  // x-forwarded-proto is the standard header set by reverse proxies.
  const xfp = h.get("x-forwarded-proto");
  if (xfp) {
    // The nearest trusted proxy APPENDS its value — the last hop is the
    // trustworthy one (left-most is client-spoofable).
    return xfp.split(",").pop()!.trim().toLowerCase() === "https";
  }
  return false;
}

/**
 * Read and verify the session cookie. Returns the session payload or null.
 * Checks the password version against the DB — if the password was changed
 * since this token was issued, the token is treated as invalid.
 *
 * When DEMO_AUTO_LOGIN=true, returns a mock session without checking cookies,
 * so visitors land directly on the dashboard without a login wall.
 */
export async function getSession(): Promise<SessionPayload | null> {
  if (process.env.DEMO_AUTO_LOGIN === "true") {
    return {
      userId: 1,
      username: "demo",
      exp: Date.now() + 86400000,
      pv: 0,
      role: "admin",
    };
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  // Verify password version — invalidates sessions after password change.
  // Deliberately does NOT clear the cookie here: getSession() runs inside
  // Server Component renders, where cookies().set() throws in Next 15/16
  // (a stale-pv cookie used to hard-lock the admin out of every page
  // INCLUDING /login). Returning null is enough — the proxy redirects to
  // /login and the next successful login overwrites the cookie.
  const currentVersion = Number(await getSetting("sessionVersion")) || 0;
  if (payload.pv !== currentVersion) {
    return null;
  }

  return payload;
}

/**
 * Set a signed, httpOnly session cookie.
 */
export async function createSession(userId: number, username: string): Promise<void> {
  const pv = Number(await getSetting("sessionVersion")) || 0;
  // #124: stamp the role claim from the DB so admin-only actions can trust it.
  const { getUserById } = await import("@/server/queries");
  const role = (await getUserById(userId))?.role ?? "admin";
  const store = await cookies();
  const payload: SessionPayload = {
    userId,
    username,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
    pv,
    role,
  };
  const token = createToken(payload);
  const secure = await isHttps();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Clear the session cookie.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const secure = await isHttps();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

/**
 * Hash a password with Argon2id (#76) and verify against either Argon2id or
 * legacy bcrypt hashes. The primitives live in `@/lib/password` (pure, no
 * server-only import) so tests can exercise them directly; re-exported here
 * because every action imports them from this module.
 */
export {
  hashPassword,
  verifyPassword,
  isLegacyBcryptHash,
} from "@/lib/password";

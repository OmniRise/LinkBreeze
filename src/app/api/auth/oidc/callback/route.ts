import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth";
import { recordAudit } from "@/server/audit";
import { getUserById, consumeOidcState, getOidcConfig, getOidcSettingsRaw, updateSetting, findUserIdByOidcIdentity, linkOidcIdentity } from "@/server/queries";
import { safeRedirectTo } from "@/lib/oidc";
import { DEFAULT_OIDC_CLAIMS, type OidcClaimNames } from "@/server/oidc-flow";
import {
  applyGroupRoleResync,
  fetchDiscovery,
  exchangeCode,
  fetchUserInfo,
  getOidcClientSecret,
  provisionOidcUser,
  resolveOidcRole,
} from "@/server/oidc-flow";
import { pickRequestHost } from "@/lib/host-routing";

export const dynamic = "force-dynamic";

/**
 * #124 Phase 3 — OIDC callback: /api/auth/oidc/callback?code&state
 *
 * Contract:
 *  - state is consumed SINGLE-USE (deleted in the same statement that reads
 *    it) and expires; replays and stale states land on /login?sso=invalid.
 *  - The id token is NEVER trusted: the userinfo endpoint is the identity
 *    source (no signature verification surface to get wrong).
 *  - An AUTHENTICATED callback links the identity to the current account
 *    (account linking); an unauthenticated one logs in the bound user or
 *    JIT-provisions a new one (if enabled).
 *  - Disabled accounts cannot pass, whichever path they arrive by.
 *  - The post-login target is site-relative only (safeRedirectTo).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 30 callback hits/min/IP. States are high-entropy (brute-force
  // is hopeless), so this protects the DB writes and the discovery/token
  // fetches from hammering, not secret guessing.
  const cbIp =
    (request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (request.headers.get("x-real-ip") || "").toString() ||
    "0.0.0.0";
  const { rateLimit } = await import("@/lib/rate-limit");
  if (!rateLimit(`oidc-cb:${cbIp}`, 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?sso=${reason}`, request.url));

  const config = await getOidcConfig();
  if (!config) return fail("unavailable");
  const clientSecret = getOidcClientSecret();
  if (!clientSecret) return fail("unavailable");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return fail("denied");
  if (!code || !state) return fail("invalid");

  const stored = await consumeOidcState(state);
  if (!stored) return fail("invalid"); // unknown/replayed/already-used
  // 30s leeway absorbs minor clock drift between app instances sharing the DB.
  if (new Date(stored.expiresAt).getTime() + 30_000 < Date.now()) return fail("expired");

  const endpoints = await fetchDiscovery(config.issuer);
  if (!endpoints) return fail("discovery");

  // redirect_uri must match the one used at authorize time. BASE_URL wins when
  // set (same rule as authorize + QR/vCard routes); otherwise derive from THIS
  // request's host (the IdP called us back on it).
  const redirectBase = process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/$/, "")
    : `${request.headers.get("x-forwarded-proto") ?? "http"}://${
        pickRequestHost(
          request.headers.get("x-forwarded-host"),
          request.headers.get("host"),
          process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
        ) ?? "localhost:3000"
      }`;
  const redirectUri = `${redirectBase}/api/auth/oidc/callback`;

  const tokens = await exchangeCode({
    tokenEndpoint: endpoints.tokenEndpoint,
    code,
    redirectUri,
    clientId: config.clientId,
    clientSecret,
    codeVerifier: stored.codeVerifier,
  });
  if (!tokens) return fail("token");

  // #124 follow-up: custom claim names (default preferred_username/email/name)
  const oidcRaw = await getOidcSettingsRaw();
  const claims: OidcClaimNames = {
    username: oidcRaw.claimUsername || DEFAULT_OIDC_CLAIMS.username,
    email: oidcRaw.claimEmail || DEFAULT_OIDC_CLAIMS.email,
    name: oidcRaw.claimName || DEFAULT_OIDC_CLAIMS.name,
  };
  const userinfo = await fetchUserInfo(endpoints.userinfoEndpoint, tokens.access_token, claims);
  if (userinfo) {
    // Status line for the OIDC card: a configured claim was missing and the
    // default was used (or the flag clears once reads succeed).
    await updateSetting("oidcClaimFallback", userinfo.claimFallback ? "1" : "");
  }
  if (!userinfo) return fail("userinfo");

  // ── identity resolution ──────────────────────────────────────────────
  const existing = await findUserIdByOidcIdentity(config.issuer, userinfo.sub);
  const session = await getSession();

  let userId: number;
  let username: string;

  // Group → role mapping (locked design): first-match rules, evaluated on
  // every SSO login; "refuse" policy blocks logins with no matching group;
  // the last-admin invariant guards every resync.
  const mapping = await resolveOidcRole(userinfo.groups);
  if (mapping.refused) {
    await recordAudit("sso.refused", userinfo.preferredUsername ?? userinfo.sub, { issuer: config.issuer });
    return fail("norole");
  }

  if (session) {
    // Account linking: bind this identity to the signed-in account. If the
    // identity is already bound to a DIFFERENT account, refuse (no takeover).
    // Deliberately does NOT touch the actor's role — resync happens on SSO
    // logins, and demoting the acting admin mid-link would be surprising.
    if (existing && existing.userId !== session.userId) return fail("bound");
    if (!existing) {
      await linkOidcIdentity({
        userId: session.userId,
        issuer: config.issuer,
        subject: userinfo.sub,
        preferredUsername: userinfo.preferredUsername,
      });
      await recordAudit("sso.linked", session.username, { issuer: config.issuer });
    }
    userId = session.userId;
    username = session.username;
  } else if (existing) {
    const user = await getUserById(existing.userId);
    if (!user) return fail("unavailable");
    if (user.status === "disabled") return fail("disabled");
    // Mapping wins on every SSO login (invariant-guarded inside).
    if (mapping.applied && mapping.roleId != null) {
      await applyGroupRoleResync(user.id, userinfo.groups);
    }
    userId = user.id;
    username = user.username;
  } else {
    // JIT provisioning (enabled by default, admin-toggleable)
    const provisioned = await provisionOidcUser({
      username: userinfo.preferredUsername ?? userinfo.sub,
      issuer: config.issuer,
      subject: userinfo.sub,
      mappedRoleId: mapping.applied && mapping.roleId != null ? mapping.roleId : null,
    });
    if (!provisioned) return fail("jit");
    userId = provisioned.userId;
    username = provisioned.username;
  }

  // Route-handler gotcha (caught by the live IdP round-trip): cookies().set
  // inside this handler does NOT survive a self-constructed
  // NextResponse.redirect — the session cookie must be attached to the
  // response object itself.
  const { buildSessionCookie } = await import("@/lib/auth");
  const sessionCookie = await buildSessionCookie(userId, username);
  const { touchLastLogin } = await import("@/server/queries");
  await touchLastLogin(userId);
  await recordAudit("sso.login", username, {
    issuer: config.issuer,
    provisioned: existing ? undefined : true,
    roleMapped: mapping.applied && mapping.roleId != null ? mapping.roleId : undefined,
  }, { actor: { userId, username } });

  const response = NextResponse.redirect(new URL(safeRedirectTo(stored.redirectTo), request.url));
  response.cookies.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly,
    sameSite: sessionCookie.sameSite,
    secure: sessionCookie.secure,
    path: sessionCookie.path,
    maxAge: sessionCookie.maxAge,
  });
  return response;
}

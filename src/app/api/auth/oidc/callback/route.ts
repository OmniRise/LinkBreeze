import { NextResponse, type NextRequest } from "next/server";

import { getSession, createSession } from "@/lib/auth";
import { getUserById, consumeOidcState, getOidcConfig, findUserIdByOidcIdentity, linkOidcIdentity } from "@/server/queries";
import { safeRedirectTo } from "@/lib/oidc";
import {
  fetchDiscovery,
  exchangeCode,
  fetchUserInfo,
  getOidcClientSecret,
  provisionOidcUser,
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
  if (new Date(stored.expiresAt).getTime() < Date.now()) return fail("expired");

  const endpoints = await fetchDiscovery(config.issuer);
  if (!endpoints) return fail("discovery");

  // redirect_uri must match the one used at authorize time: derive from THIS
  // request's host (the IdP called us back on it).
  const host = pickRequestHost(
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
  );
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host ?? "localhost:3000"}/api/auth/oidc/callback`;

  const tokens = await exchangeCode({
    tokenEndpoint: endpoints.tokenEndpoint,
    code,
    redirectUri,
    clientId: config.clientId,
    clientSecret,
    codeVerifier: stored.codeVerifier,
  });
  if (!tokens) return fail("token");

  const userinfo = await fetchUserInfo(endpoints.userinfoEndpoint, tokens.access_token);
  if (!userinfo) return fail("userinfo");

  // ── identity resolution ──────────────────────────────────────────────
  const existing = await findUserIdByOidcIdentity(config.issuer, userinfo.sub);
  const session = await getSession();

  let userId: number;
  let username: string;

  if (session) {
    // Account linking: bind this identity to the signed-in account. If the
    // identity is already bound to a DIFFERENT account, refuse (no takeover).
    if (existing && existing.userId !== session.userId) return fail("bound");
    if (!existing) {
      await linkOidcIdentity({
        userId: session.userId,
        issuer: config.issuer,
        subject: userinfo.sub,
        preferredUsername: userinfo.preferredUsername,
      });
    }
    userId = session.userId;
    username = session.username;
  } else if (existing) {
    const user = await getUserById(existing.userId);
    if (!user) return fail("unavailable");
    if (user.status === "disabled") return fail("disabled");
    userId = user.id;
    username = user.username;
  } else {
    // JIT provisioning (enabled by default, admin-toggleable)
    const provisioned = await provisionOidcUser({
      username: userinfo.preferredUsername ?? userinfo.sub,
      issuer: config.issuer,
      subject: userinfo.sub,
    });
    if (!provisioned) return fail("jit");
    userId = provisioned.userId;
    username = provisioned.username;
  }

  await createSession(userId, username);
  const { touchLastLogin } = await import("@/server/queries");
  await touchLastLogin(userId);

  return NextResponse.redirect(new URL(safeRedirectTo(stored.redirectTo), request.url));
}

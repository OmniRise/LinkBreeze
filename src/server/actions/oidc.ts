"use server";

import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  notFoundError,
  rateLimitError,
} from "@/lib/errors";
import { safeRedirectTo, isValidIssuerUrl } from "@/lib/oidc";
import { createOidcState, getOidcConfig, updateSetting } from "@/server/queries";
import { requireInstanceAdmin } from "@/server/access";
import { pickRequestHost } from "@/lib/host-routing";
import {
  fetchDiscovery,
  getOidcClientSecret,
  isProduction,
  randomState,
  stateExpiry,
} from "@/server/oidc-flow";
import { createPkce } from "@/lib/oidc";

/** The instance origin the IdP must see as redirect_uri (same rules as QR/vCard). */
async function instanceOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = pickRequestHost(
    h.get("x-forwarded-host"),
    h.get("host"),
    process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
  );
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host ?? "localhost:3000"}`;
}

/**
 * #124 Phase 3 — start an OIDC login: build the authorize redirect with
 * state + PKCE, persist the state server-side (single-use, expiring), and
 * hand the authorize URL back to the client for navigation.
 */
export async function startOidcLoginAction(
  redirectTo?: string,
): Promise<ActionResult<{ authorizeUrl: string }>> {
  if (demoGuard()) return unauthorizedError();

  // Rate limit: 10 starts/min/IP — each start writes a state row and triggers
  // a discovery fetch, so unbounded calls are a cheap DoS vector.
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (h.get("x-real-ip") || "").toString() ||
    "0.0.0.0";
  const { rateLimit } = await import("@/lib/rate-limit");
  const rl = rateLimit(`oidc-start:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return rateLimitError(Math.ceil((rl.resetAt - Date.now()) / 1000));
  }

  const config = await getOidcConfig();
  if (!config) return notFoundError("SSO is not configured on this instance");
  if (!isValidIssuerUrl(config.issuer, { production: isProduction() })) {
    return validationError("SSO is configured with an invalid issuer URL");
  }
  const clientSecret = getOidcClientSecret();
  if (!clientSecret) return validationError("SSO is missing its client secret (OIDC_CLIENT_SECRET)");

  const { fetchDiscovery } = await import("@/server/oidc-flow");
  const endpoints = await fetchDiscovery(config.issuer);
  if (!endpoints) return validationError("Could not reach the identity provider's discovery document");

  const { verifier, challenge } = createPkce();
  const state = randomState();
  const target = safeRedirectTo(redirectTo);

  await createOidcState({
    state,
    codeVerifier: verifier,
    redirectTo: target,
    expiresAt: stateExpiry(),
  });

  const origin = await instanceOrigin();
  const redirectUri = `${origin}/api/auth/oidc/callback`;
  const url = new URL(endpoints.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { success: true, authorizeUrl: url.toString() };
}

/** Settings card save (#124 3.6): non-secret fields only, instance-admin gated. */
export async function saveOidcSettingsAction(formData: FormData): Promise<ActionResult> {
  if (demoGuard()) return unauthorizedError();
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const issuer = String(formData.get("issuer") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const jit = formData.get("jit") === "on";
  const mode = String(formData.get("mode") ?? "optional");

  if (issuer && !isValidIssuerUrl(issuer, { production: isProduction() })) {
    return validationError("Issuer must be an https URL (http://localhost only outside production) without query or fragment");
  }
  if (mode !== "optional" && mode !== "replaces_local") {
    return validationError("Invalid SSO mode");
  }
  // Replacing local login REQUIRES a working config, or the instance locks
  // itself out the moment someone signs out.
  if (mode === "replaces_local" && (!issuer || !clientId || !getOidcClientSecret())) {
    return validationError("Replacing local login requires issuer, client id, and OIDC_CLIENT_SECRET to be set");
  }

  await updateSetting("oidcIssuer", issuer);
  await updateSetting("oidcClientId", clientId);
  await updateSetting("oidcJit", jit ? "on" : "off");
  await updateSetting("oidcMode", mode);
  return { success: true };
}

/**
 * Account linking (#124 3.4): the profile surface offers "connect SSO" — the
 * actual identity arrives via the callback (an authenticated callback binds
 * the identity to the current session's account).
 */
export async function oidcAccountLinkingSupported(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const config = await getOidcConfig();
  return config !== null && getOidcClientSecret() !== null;
}

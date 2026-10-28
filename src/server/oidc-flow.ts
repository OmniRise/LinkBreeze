import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  getSetting,
  getUserByUsername,
  createUser,
  countPagesByOwner,
  getCapabilitiesForUser,
  getRoleById,
  createPage,
  getAllPages,
} from "@/server/queries";
import {
  isValidIssuerUrl,
  parseDiscovery,
  type OidcEndpoints,
} from "@/lib/oidc";
import { normalizeSlug } from "@/lib/link-slug";

/**
 * #124 Phase 3 — OIDC flow helpers (server-only, non-action so the callback
 * route and the settings actions share one implementation).
 *
 * Security notes baked in here:
 *  - The discovery fetch is guarded by isValidIssuerUrl (https-only in
 *    production, no credentials/query/fragment) — the SSRF boundary.
 *  - Discovery results are cached per issuer for 1h but re-validated with
 *    parseDiscovery on EVERY use (issuer match + same-origin endpoints).
 *  - Outbound fetches keep their abort timer armed until the BODY has been
 *    read (a server that sends headers and trickles the body cannot hang the
 *    login route).
 *  - The client secret lives in OIDC_CLIENT_SECRET (env) — never the settings
 *    KV, which is exported verbatim into every backup file.
 */

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const discoveryCache = new Map<string, { endpoints: OidcEndpoints; at: number }>();

export function isProduction(): boolean {
  // Explicit operator escape hatch: allow an http issuer (e.g. a LAN Keycloak
  // or a local test provider) even in a production-mode server. Off by
  // default — production instances must use https issuers.
  if (process.env.LINKBREEZE_ALLOW_HTTP_ISSUER === "true") return false;
  return process.env.NODE_ENV === "production";
}

/** Fetch + validate discovery for a configured issuer. Null = unusable. */
export async function fetchDiscovery(issuer: string): Promise<OidcEndpoints | null> {
  if (!isValidIssuerUrl(issuer, { production: isProduction() })) return null;
  const cached = discoveryCache.get(issuer);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.endpoints;

  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  try {
    const doc = await fetchJson(url, { method: "GET" });
    const endpoints = parseDiscovery(doc, issuer);
    if (endpoints) discoveryCache.set(issuer, { endpoints, at: Date.now() });
    return endpoints;
  } catch {
    return null;
  }
}

/** Keep the abort timer armed until the BODY read completes. */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return text.length ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
}

export async function exchangeCode(input: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  codeVerifier: string;
}): Promise<TokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code_verifier: input.codeVerifier,
  });
  try {
    const doc = await fetchJson(input.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    if (typeof doc !== "object" || doc === null) return null;
    const accessToken = (doc as Record<string, unknown>).access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) return null;
    return { access_token: accessToken };
  } catch {
    return null;
  }
}

export interface OidcUserInfo {
  sub: string;
  preferredUsername: string | null;
}

export async function fetchUserInfo(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<OidcUserInfo | null> {
  try {
    const doc = await fetchJson(userinfoEndpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    if (typeof doc !== "object" || doc === null) return null;
    const sub = (doc as Record<string, unknown>).sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    const preferred = (doc as Record<string, unknown>).preferred_username;
    return {
      sub,
      preferredUsername: typeof preferred === "string" && preferred.length > 0 ? preferred : null,
    };
  } catch {
    return null;
  }
}

/** Client secret: env-only, never the settings KV (backs up leak plaintext). */
export function getOidcClientSecret(): string | null {
  const secret = process.env.OIDC_CLIENT_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/** Slug for a JIT-provisioned account page: username, -2/-3… on collision. */
async function uniqueSlugFor(username: string): Promise<string> {
  const base = normalizeSlug(username) || "user";
  const taken = new Set((await getAllPages()).map((p) => p.slug.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Username for a JIT account: preferred_username, sanitized, made unique. */
async function uniqueUsername(preferred: string): Promise<string> {
  const base = preferred.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64) || "sso-user";
  if (!(await getUserByUsername(base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!(await getUserByUsername(candidate))) return candidate;
  }
}

/**
 * JIT provisioning (#124 3.3): create the account + identity binding for a
 * first-time SSO login. Respects the instance page policy ('manual' → no
 * page) and the configured default role (falls back to Member). The local
 * password is an unusable random hash — SSO accounts sign in via the IdP.
 */
export async function provisionOidcUser(input: {
  username: string;
  issuer: string;
  subject: string;
}): Promise<{ userId: number; username: string } | null> {
  const jit = (await getSetting("oidcJit")) !== "off";
  if (!jit) return null;

  const username = await uniqueUsername(input.username);
  // 32 random bytes → Argon2id hash no one can match; local login stays dead
  // for JIT accounts unless an admin sets a password.
  const randomPassword = randomBytes(32).toString("base64url");
  const { hashPassword } = await import("@/lib/auth");
  const defaultRoleIdRaw = await getSetting("oidcDefaultRoleId");
  const defaultRoleId = defaultRoleIdRaw ? Number(defaultRoleIdRaw) : null;
  let roleId: number | null = null;
  if (defaultRoleId != null && Number.isInteger(defaultRoleId)) {
    roleId = (await getRoleById(defaultRoleId)) ? defaultRoleId : null;
  }

  const user = await createUser(username, await hashPassword(randomPassword), roleId ? { roleId } : {});

  const policy = await getSetting("accountPagePolicy");
  if (policy !== "manual") {
    await createPage({ slug: await uniqueSlugFor(username), title: username, userId: user.id });
  }

  const { linkOidcIdentity } = await import("@/server/queries");
  await linkOidcIdentity({
    userId: user.id,
    issuer: input.issuer,
    subject: input.subject,
    preferredUsername: input.username,
  });
  return { userId: user.id, username };
}

/** Human-facing quota check for account creation paths (unused here, kept symmetrical). */
export async function memberPageCount(userId: number): Promise<number> {
  const { caps } = await getCapabilitiesForUser(userId);
  if (caps.pagesLimit == null) return 0;
  return countPagesByOwner(userId);
}

export function stateExpiry(): string {
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

export function randomState(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

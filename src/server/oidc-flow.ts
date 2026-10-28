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
  getUserById,
} from "@/server/queries";
import {
  isValidIssuerUrl,
  parseDiscovery,
  resolveRoleFromGroups,
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
  groups: string[];
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
    const d = doc as Record<string, unknown>;
    const sub = d.sub;
    if (typeof sub !== "string" || sub.length === 0) return null;
    const preferred = d.preferred_username;
    // #124 group mapping: IdPs send a groups array (Authentik natively;
    // Keycloak via a client mapper). Absent → empty list (mapping inert).
    const groups = Array.isArray(d.groups)
      ? d.groups.filter((g): g is string => typeof g === "string")
      : [];
    return {
      sub,
      preferredUsername: typeof preferred === "string" && preferred.length > 0 ? preferred : null,
      groups,
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
  /** Role from the group mapping (wins over the default role). */
  mappedRoleId?: number | null;
}): Promise<{ userId: number; username: string } | null> {
  const jit = (await getSetting("oidcJit")) !== "off";
  if (!jit) return null;

  const username = await uniqueUsername(input.username);
  // 32 random bytes → Argon2id hash no one can match; local login stays dead
  // for JIT accounts unless an admin sets a password.
  const randomPassword = randomBytes(32).toString("base64url");
  const { hashPassword } = await import("@/lib/auth");
  // Role precedence: group mapping > default role setting > Member (null).
  const roleId =
    input.mappedRoleId != null ? input.mappedRoleId : await resolvedDefaultRoleId();

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

/** The configured default JIT role id, validated to exist (null → Member). */
async function resolvedDefaultRoleId(): Promise<number | null> {
  const raw = await getSetting("oidcDefaultRoleId");
  const id = raw ? Number(raw) : null;
  if (id == null || !Number.isInteger(id) || id <= 0) return null;
  const { getRoleById } = await import("@/server/queries");
  return (await getRoleById(id)) ? id : null;
}

// ─── SSO group → role mapping (#124) ────────────────────────────────────────

export interface GroupRoleOutcome {
  refused: boolean;
  /** The role the mapping assigns (or null → fall back to default/Member). */
  roleId: number | null;
  applied: boolean;
}

/**
 * Resolve the target role for an SSO identity from its groups. Loads the
 * ordered rules, the no-match policy, and the default role from the settings
 * KV; the matching itself is the pure resolver in lib/oidc.ts.
 */
export async function resolveOidcRole(groups: string[]): Promise<GroupRoleOutcome> {
  const { getOidcSettingsRaw, parseGroupRoleMap, getRoleById } = await import("@/server/queries");
  const raw = await getOidcSettingsRaw();
  // Rules referencing a since-deleted role are inert (the map is JSON — no FK
  // protects it), so each rule's role is verified before it can match.
  const rules: { group: string; roleId: number }[] = [];
  for (const rule of parseGroupRoleMap(raw.groupRoleMap)) {
    if (await getRoleById(rule.roleId)) rules.push(rule);
  }
  const policy = raw.noGroupMatch === "refuse" ? "refuse" : "default_role";
  const defaultRoleId = raw.defaultRoleId ? Number(raw.defaultRoleId) : null;
  const r = resolveRoleFromGroups(groups, rules, defaultRoleId, policy);
  return { refused: r.refused, roleId: r.roleId, applied: r.applied };
}

/**
 * Re-sync a user's role from the group mapping on SSO login (mapping wins,
 * per the locked design). The last-admin invariant guards it: a demotion
 * that would strip the instance's last admin is silently skipped — the user
 * keeps the old role rather than locking the instance out.
 * Returns the (possibly unchanged) roleId now in effect.
 */
export async function applyGroupRoleResync(
  userId: number,
  groups: string[],
): Promise<number | null> {
  const outcome = await resolveOidcRole(groups);
  if (outcome.refused || !outcome.applied || outcome.roleId == null) {
    return null; // nothing to apply (caller handles refusal beforehand)
  }
  const { getCapabilitiesForUser, getRoleById, listInstanceAdminIds, updateUserRoleById, getSetting, updateSetting } =
    await import("@/server/queries");
  const current = await getUserById(userId);
  if (current?.roleId === outcome.roleId) return outcome.roleId;

  const targetRole = await getRoleById(outcome.roleId);
  const caps = (await getCapabilitiesForUser(userId)).caps;
  const wasFullAdmin = caps.manageAccounts && caps.manageInstance;
  const targetIsFullAdmin =
    !!targetRole &&
    ((targetRole.isBuiltin && targetRole.name === "Admin") ||
      (targetRole.canManageAccounts && targetRole.canManageInstance));

  if (wasFullAdmin && !targetIsFullAdmin) {
    const adminIds = await listInstanceAdminIds();
    if (adminIds.length <= 1) {
      return null; // keep the old role — never lock the instance out
    }
  }

  await updateUserRoleById(userId, outcome.roleId);
  // Role changed → existing sessions carry stale claims; re-mint.
  const v = Number(await getSetting("sessionVersion")) || 0;
  await updateSetting("sessionVersion", String(v + 1));
  return outcome.roleId;
}

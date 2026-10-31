/**
 * Generic OIDC SSO (#124 Phase 3) — PURE primitives.
 *
 * No `@/db`, no network: everything an offline test (or a security review)
 * can reason about. The DB-backed parts (state storage/consumption, identity
 * lookup, JIT) live in `@/server/queries` and the callback route; they MUST
 * treat this module's validators as the single security boundary:
 *
 *  - isValidIssuerUrl: the admin-supplied issuer is https-only in production
 *    (localhost http for dev providers) with no credentials/query/fragment —
 *    this is the SSRF guard for the discovery fetch.
 *  - parseDiscovery: a discovery document is only trusted when its `issuer`
 *    matches EXACTLY and every endpoint is https (or the issuer's own
 *    localhost scheme) AND same-origin with the issuer — this kills
 *    discovery poisoning and token exfiltration to a third host.
 *  - createPkce: RFC 7636 S256.
 *  - safeRedirectTo: post-login redirects are site-relative only.
 */
import { createHash, randomBytes } from "node:crypto";

/** How long a stored login state may live. */
export const STATE_TTL_MS = 10 * 60 * 1000;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function httpOrigin(u: URL): string {
  return `${u.protocol}//${u.host}`;
}

/**
 * The issuer the admin configured. Strict shape: an https URL, or http for a
 * localhost host in non-production, or — behind the explicit
 * LINKBREEZE_ALLOW_HTTP_ISSUER=true escape hatch (allowInsecureIssuer) — http
 * for a trusted-LAN provider. No credentials, query, or fragment either way.
 */
export function isValidIssuerUrl(
  raw: string,
  { production, allowInsecureIssuer = false }: { production: boolean; allowInsecureIssuer?: boolean },
): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const local = isLocalHost(u.hostname);
  if (u.protocol === "https:") {
    // ok
  } else if (u.protocol === "http:" && (allowInsecureIssuer || (local && !production))) {
    // local dev providers, or an explicitly opted-in LAN provider
  } else {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.search) return false;
  if (u.hash) return false;
  return u.hostname.length > 0;
}

export interface OidcEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
}

/**
 * Validate a fetched `/.well-known/openid-configuration` document against the
 * issuer we asked for. Returns null for ANY deviation — the callback treats
 * null as a failed login, never a partial one.
 */
export function parseDiscovery(
  doc: unknown,
  expectedIssuer: string,
): OidcEndpoints | null {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if (d.issuer !== expectedIssuer) return null;
  const authorizationEndpoint = d.authorization_endpoint;
  const tokenEndpoint = d.token_endpoint;
  const userinfoEndpoint = d.userinfo_endpoint;
  for (const ep of [authorizationEndpoint, tokenEndpoint, userinfoEndpoint]) {
    if (typeof ep !== "string" || ep.length === 0) return null;
    let u: URL;
    try {
      u = new URL(ep);
    } catch {
      return null;
    }
    // Endpoints must be https — except a localhost dev issuer, whose
    // endpoints may share its http origin.
    let issuerUrl: URL;
    try {
      issuerUrl = new URL(expectedIssuer);
    } catch {
      return null;
    }
    const issuerLocalHttp = issuerUrl.protocol === "http:" && isLocalHost(issuerUrl.hostname);
    if (u.protocol !== "https:" && !(issuerLocalHttp && u.protocol === "http:")) return null;
    // Same-origin with the issuer: no shipping the authorization code or
    // client secret to a host the admin never pointed at.
    if (httpOrigin(u) !== httpOrigin(issuerUrl)) return null;
  }
  return {
    authorizationEndpoint: authorizationEndpoint as string,
    tokenEndpoint: tokenEndpoint as string,
    userinfoEndpoint: userinfoEndpoint as string,
  };
}

/**
 * SSO group → role mapping (#124): resolve which role an identity's groups
 * map to. Rules are an ordered list — FIRST match wins. When nothing matches:
 *  - "default_role" policy → the instance's default role id (or null when
 *    unset, meaning the caller falls back to Member)
 *  - "refuse" policy       → null AND refused=true (login is denied)
 * No rules at all → the mapping system is INACTIVE: not applied (applied=false),
 * so existing users keep their role and JIT falls back to the default role.
 */
export interface GroupRoleRule {
  group: string;
  roleId: number;
}

export interface GroupRoleResolution {
  applied: boolean;
  roleId: number | null;
  matchedGroup: string | null;
  refused: boolean;
}

export function resolveRoleFromGroups(
  groups: string[],
  rules: GroupRoleRule[],
  defaultRoleId: number | null,
  noMatchPolicy: "default_role" | "refuse",
): GroupRoleResolution {
  if (rules.length === 0) {
    return { applied: false, roleId: null, matchedGroup: null, refused: false };
  }
  const normalized = new Set(groups.map((g) => g.trim()));
  for (const rule of rules) {
    if (normalized.has(rule.group.trim())) {
      return { applied: true, roleId: rule.roleId, matchedGroup: rule.group, refused: false };
    }
  }
  if (noMatchPolicy === "refuse") {
    return { applied: true, roleId: null, matchedGroup: null, refused: true };
  }
  return { applied: true, roleId: defaultRoleId, matchedGroup: null, refused: false };
}

/** RFC 7636 PKCE pair: high-entropy verifier + its S256 challenge. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Post-login redirect target: site-relative paths only. Everything else —
 * absolute URLs, protocol-relative `//host`, backslash tricks `/\host`,
 * schemes — falls back to `/`. Mirrors the auth-flow rule; kept here so the
 * OIDC callback and the login start share ONE implementation.
 */
export function safeRedirectTo(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/\\")) return "/";
  return raw;
}

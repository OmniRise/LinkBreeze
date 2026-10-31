/**
 * Host-based routing (custom domains) — pure resolution logic.
 *
 * Spec: GitHub issue #85 "Ability to set custom domains for subpages".
 * This module is deliberately DB-free and side-effect-free so the whole
 * decision table is unit-testable: the proxy (src/proxy.ts) supplies the
 * current bindings + policy (read from SQLite) and executes the returned
 * decision.
 *
 * Mental model:
 *   - A DOMAIN BINDING points a host at a page (primary = canonical identity,
 *     alias = secondary host with its own behavior).
 *   - A page's SCOPE decides what its bound hosts expose:
 *       exclusive → the host IS the page (foreign slugs 404)  [default]
 *       hub       → the host serves the page at root and every other
 *                   slug keeps resolving under it (path routing)
 *   - The INSTANCE POLICY decides global behavior: admin host lock,
 *     unknown-host fallback, implicit www handling, canonical strategy.
 *
 * Everything here normalizes hosts to lowercase punycode with no port and
 * no trailing dot before any comparison — mismatched casing/ports are the
 * #1 way host routing silently breaks.
 */

import { domainToASCII } from "node:url";

// ── Types ────────────────────────────────────────────────────────────────

/** Row shape the proxy hands in (join of domains + pages). */
export interface DomainBinding {
  id: number;
  host: string; // stored normalized (punycode, lowercase, no port)
  pageId: number;
  pageSlug: string;
  kind: "primary" | "alias";
  behavior: "serve" | "redirect_canonical" | "redirect_slug";
  status: "pending" | "active";
}

/** Page-level scope for a bound host. NULL column = "exclusive". */
export type DomainScope = "exclusive" | "hub";

export interface DomainPolicy {
  /** The instance's own host (env LINKBREEZE_PRIMARY_HOST > settings). Null = unknown. */
  primaryHost: string | null;
  /** 404 admin/auth surfaces on non-primary hosts. Only active when primaryHost is known. */
  adminLock: "strict" | "off";
  /** What an unbound host sees: today's path routing, a hard 404, or a redirect to primary. */
  unknownFallback: "path" | "404" | "redirect_primary";
  /** Implicit www.<bound-domain> handling when www is not an explicit binding. */
  wwwPolicy: "redirect" | "serve" | "off";
  /** How slug↔domain duplicates are reconciled. */
  canonical: "301" | "tag" | "off";
}

/** What the proxy must do with the request. */
export type HostDecision =
  /** Rewrite internally to the page route (path is already slug-shaped). */
  | { type: "serve"; binding: DomainBinding; rewritePath: string; activate: boolean }
  /** Browser-level redirect (location is absolute). */
  | { type: "redirect"; location: string; status: 301 | 302 }
  /** Hard 404 (foreign slug on an exclusive host, fallback 404, locked admin). */
  | { type: "not_found" }
  /** No domain logic applies — continue with the existing proxy behavior. */
  | { type: "pass" };

// ── Host normalization ───────────────────────────────────────────────────

/**
 * Normalize a Host/x-forwarded-host header value for comparisons and
 * storage: lowercase, strip port, strip trailing dot, convert IDN to
 * punycode. Returns "" for values that cannot be a routable hostname
 * (empty, IP-literal with port mangled, oversized).
 */
export function normalizeHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let host = raw.trim().toLowerCase();
  if (!host) return "";

  // IPv6 literal: [::1]:3000 → strip brackets+port; bare ::1 kept as-is.
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return "";
    return host.slice(1, end);
  }
  // Strip :port (only safe now that bracketed IPv6 is handled).
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);

  host = host.replace(/\.+$/, ""); // trailing dot (FQDN form)
  if (!host || host.length > 253) return "";
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;

  const ascii = domainToASCII(host);
  return ascii && ascii.length <= 253 ? ascii.toLowerCase() : "";
}

/**
 * Validate + normalize user INPUT for the admin "add domain" form.
 * Strips an accidental scheme/path, then applies normalizeHost.
 * Returns null when the value is not a usable domain name.
 */
export function parseDomainInput(raw: string): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const host = normalizeHost(value);
  if (!host) return null;
  // Must look like a name with at least one dot beyond localhost-style
  // single labels? No — intranet names ("team") are legitimate hosts.
  // Only reject the forms normalizeHost already rejects plus obvious junk.
  if (host.includes(" ")) return null;
  return host;
}

/**
 * Decide which header identifies the request host for domain routing.
 * The raw `Host` header is the safe default: a client behind a header-
 * forwarding proxy (cloudflared forwards client headers verbatim) can set
 * `X-Forwarded-Host` freely, so trusting it lets an attacker pick which
 * binding resolves — bypassing the strict admin host lock, defeating the
 * unknown-host 404 fallback, and flipping pending domains to active.
 * Opt in only when a trusted proxy OVERWRITES the header (nginx/Caddy).
 */
export function pickRequestHost(
  xForwardedHost: string | null | undefined,
  host: string | null | undefined,
  trustXForwardedHost: boolean,
): string | null {
  if (trustXForwardedHost && xForwardedHost) return xForwardedHost;
  return host ?? null;
}

/**
 * www/apex relationship: wwwApexOf("www.jane.com") → { isWww: true, apex: "jane.com" }.
 * Only the exact "www." prefix counts (not arbitrary subdomains).
 */
export function wwwApexOf(host: string): { isWww: boolean; apex: string } {
  if (host.startsWith("www.") && host.length > 4) {
    return { isWww: true, apex: host.slice(4) };
  }
  return { isWww: false, apex: host };
}

/** True when the path is admin/auth surface that a strict host lock covers. */
export function isAdminPath(pathname: string): boolean {
  const adminPrefixes = [
    "/dashboard",
    "/links",
    "/profile",
    "/theme",
    "/settings",
    "/pages",
    "/domains",
    "/accounts",
    "/audit",
  ];
  const adminExact = new Set(["/login", "/setup"]);
  const adminApiPrefixes = ["/api/setup", "/api/onboarding", "/api/backup"];
  const adminApiExact = new Set([
    "/api/analytics/export",
    "/api/subscribers/clear",
    "/api/subscribers/export",
    "/api/themes/import",
    "/api/themes/export",
    "/api/totp-qr",
  ]);
  if (adminExact.has(pathname) || adminApiExact.has(pathname)) return true;
  // /invite/<token> is a PUBLIC auth surface (no session) — still part of the
  // admin/auth plane for the strict-host lock, like /login.
  if (pathname === "/invite" || pathname.startsWith("/invite/")) return true;
  return (
    adminPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    adminApiPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

// ── Resolution ───────────────────────────────────────────────────────────

interface ResolveInput {
  /** Normalized request host ("" = absent/undeterminable → no domain logic). */
  host: string;
  pathname: string;
  /** Request scheme (for building redirect targets). */
  protocol: string;
  bindings: DomainBinding[];
  /** pageId → scope for pages (only pages referenced by bindings matter). */
  scopeByPageId: Map<number, DomainScope>;
  policy: DomainPolicy;
}

/**
 * The primary, active, serving binding of a page — its canonical identity.
 */
export function primaryServeBinding(
  bindings: DomainBinding[],
  pageId: number,
): DomainBinding | undefined {
  return bindings.find(
    (b) =>
      b.pageId === pageId &&
      b.kind === "primary" &&
      b.behavior === "serve" &&
      b.status === "active",
  );
}

/** Absolute origin (proto://host) for a binding's canonical target. */
function bindingOrigin(binding: DomainBinding, protocol: string): string {
  // Custom domains are, by the deploy docs, TLS-terminated at the proxy.
  // Canonical/redirect targets always go https so we never advertise a
  // plaintext URL to crawlers. Local plain-HTTP testing still works —
  // browsers/Playwright follow the redirect regardless of scheme mismatch.
  void protocol;
  return `https://${binding.host}`;
}

/**
 * Paths that a bound host serves in "exclusive" scope: the page itself
 * (root + slug forms) and its own sub-resources / APIs. Anything else
 * page-shaped 404s. Non-page machinery (/go, assets, QR…) always passes.
 */
export function isBoundPagePath(pathname: string, slug: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return (
    p === "/" ||
    p === `/${slug}` ||
    p === `/${slug}/privacy` ||
    p === `/${slug}/opengraph-image`
  );
}

/** Machinery paths that never participate in slug scoping. */
export function isMachinePath(pathname: string): boolean {
  return (
    pathname === "/go" ||
    pathname.startsWith("/go/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

/**
 * Core decision function. See HostDecision for the contract.
 * Steps mirror the spec order: admin lock → explicit binding → implicit
 * www → canonical strategy → unknown fallback.
 */
export function resolveHostRequest(input: ResolveInput): HostDecision {
  const { host, pathname, bindings, policy } = input;
  const path = pathname.replace(/\/+$/, "") || "/";

  // An absent host (HTTP/1.0, exotic clients) can never match a binding.
  if (!host) return { type: "pass" };

  // ── 1. Admin host lock (defense-in-depth; auth is still enforced inside) ──
  if (
    policy.adminLock === "strict" &&
    policy.primaryHost &&
    host !== policy.primaryHost &&
    isAdminPath(path)
  ) {
    return { type: "not_found" };
  }

  // ── 2. Exact binding match ────────────────────────────────────────────────
  const binding = bindings.find((b) => b.host === host);
  if (binding) {
    return decideBoundRequest(input, binding);
  }

  // ── 3. Implicit www (only when the apex itself is bound) ─────────────────
  const { isWww, apex } = wwwApexOf(host);
  if (isWww && policy.wwwPolicy !== "off") {
    const apexBinding = bindings.find((b) => b.host === apex);
    if (apexBinding) {
      if (policy.wwwPolicy === "redirect") {
        return {
          type: "redirect",
          location: `https://${apex}${input.pathname}`,
          status: 301,
        };
      }
      // "serve": the www host behaves exactly like the apex binding.
      return decideBoundRequest(input, apexBinding);
    }
  }

  // ── 4. Canonical 301: slug paths on the primary host move to the domain ──
  // With the 404 unknown-host fallback, canonical is skipped on non-primary
  // hosts: the 301's Location would reveal which slugs are domain-bound,
  // defeating the operator's explicit slug-privacy choice. The fallback
  // below then decides (404 / redirect / pass).
  const hideSlugsOnUnknownHosts =
    policy.unknownFallback === "404" && host !== policy.primaryHost;
  if (policy.canonical === "301" && !hideSlugsOnUnknownHosts) {
    const slugMatch = path.match(/^\/(@?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(\/|$)/i);
    if (slugMatch) {
      const slug = slugMatch[1].toLowerCase();
      const page = bindings.find(
        (b) => b.pageSlug.toLowerCase() === slug && b.behavior === "serve",
      );
      const target = page ? primaryServeBinding(bindings, page.pageId) : undefined;
      if (target && target.host !== host) {
        return {
          type: "redirect",
          location: `${bindingOrigin(target, input.protocol)}${input.pathname}`,
          status: 301,
        };
      }
    }
    // Root on the primary host: follow the default-page redirect only if the
    // default page is bound; the proxy "pass" lets src/app/page.tsx resolve
    // the default page first, so we only handle the case where the resolver
    // is told (via boundDefault) — covered by callers pre-computing nothing:
    // root passes through unchanged. (Root canonicalization is done by the
    // root page redirecting to the slug, which then 301s here.)
  }

  // ── 5. Unknown-host fallback ──────────────────────────────────────────────
  // Only applies to page-shaped paths; machinery (API, /go, sitemap) and
  // admin (already gated above) keep their normal behavior on every host.
  if (policy.unknownFallback !== "path" && !isMachinePath(path) && !isAdminPath(path)) {
    const looksLikeSlug = /^\/[a-z0-9][a-z0-9-]*(\/|$)/i.test(path);
    if (looksLikeSlug || path === "/") {
      if (policy.unknownFallback === "404") {
        return { type: "not_found" };
      }
      // redirect_primary — preserve the path so deep links survive.
      if (policy.primaryHost && host !== policy.primaryHost) {
        return {
          type: "redirect",
          location: `https://${policy.primaryHost}${input.pathname}`,
          status: 301,
        };
      }
    }
  }

  return { type: "pass" };
}

/** Second-phase decision once a binding (explicit or implicit-www) matched. */
function decideBoundRequest(input: ResolveInput, binding: DomainBinding): HostDecision {
  const { pathname, bindings, scopeByPageId } = input;
  const path = pathname.replace(/\/+$/, "") || "/";

  // Non-serving bindings redirect before anything else.
  if (binding.behavior !== "serve") {
    const canonical = primaryServeBinding(bindings, binding.pageId);
    if (!canonical) return { type: "not_found" }; // misconfigured: alias without a live primary
    const origin = bindingOrigin(canonical, input.protocol);
    if (binding.behavior === "redirect_slug") {
      return {
        type: "redirect",
        location: `${origin}/${binding.pageSlug}`,
        status: 301,
      };
    }
    // redirect_canonical: same path, canonical host.
    return { type: "redirect", location: `${origin}${input.pathname}`, status: 301 };
  }

  // A pending binding serves immediately (the operator may have activated it
  // manually or is testing via /etc/hosts) — but its first real hit flips
  // status → active, which is how the UI shows "this domain works".
  const activate = binding.status === "pending";

  const scope = scopeByPageId.get(binding.pageId) ?? "exclusive";

  if (path === "/") {
    return {
      type: "serve",
      binding,
      rewritePath: `/${binding.pageSlug}`,
      activate,
    };
  }

  if (isMachinePath(path) || isAdminPath(path)) {
    // Machinery and admin paths are not domain-scoped; admin is gated by the
    // host lock above, /go + /api by their own auth/validation.
    return { type: "pass" };
  }

  if (isBoundPagePath(path, binding.pageSlug)) {
    return { type: "pass" }; // /<slug>… serves by normal routing
  }

  // Hub scope keeps path routing alive under the bound host.
  if (scope === "hub") return { type: "pass" };

  // Exclusive scope: any other slug is not this host's content.
  return { type: "not_found" };
}

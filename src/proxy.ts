import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/session-token";
import {
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isAvailableLocale,
} from "@/i18n/config";
import {
  normalizeHost,
  pickRequestHost,
  resolveHostRequest,
} from "@/lib/host-routing";
import {
  getDomainBindings,
  getDomainPolicy,
  getDomainScopeMap,
  markDomainActive,
} from "@/server/domains";

/**
 * The Next.js 16 proxy (formerly "middleware"). Runs on the Node.js runtime,
 * so it can read SQLite directly — domain bindings and policy load in two
 * indexed queries per request (better-sqlite3 is synchronous and µs-fast;
 * no cache layer: invalidation on every page edit for zero measurable gain
 * is a bad trade).
 *
 * Responsibilities, in order:
 *   1. i18n — forward the admin UI locale as a request header.
 *   2. Custom domains (#85) — host lock, host→page rewrite, canonical 301s,
 *      www handling, unknown-host fallback (see src/lib/host-routing.ts).
 *   3. Admin auth gate — /dashboard, /links, /profile, /theme, /settings,
 *      /pages, /domains require a VALID session cookie (signature + expiry;
 *      the DB-backed password-version check stays in getSession()).
 *
 * Public routes, the auth/setup pages, and the public API endpoints are
 * always accessible (subject to the domain logic above).
 */
const PROTECTED_PREFIXES = [
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

const PUBLIC_EXACT = new Set([
  "/login",
  "/setup",
  "/api/track",
  "/api/qr",
  "/api/health",
]);

// Admin-reserved paths (never served as public link slugs)
const ADMIN_RESERVED = new Set([
  "/login",
  "/setup",
  "/dashboard",
  "/links",
  "/profile",
  "/theme",
  "/settings",
  "/pages",
  "/domains",
  "/accounts",
  "/audit",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. i18n: forward the admin UI locale as a request header ────────────
  // The lb_locale cookie is the source of truth (set from Settings). The
  // admin layout/server components read x-lb-locale via headers(); public
  // [slug] pages never see it, so they stay English regardless of cookie.
  const isAdminUiPath =
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    ) ||
    pathname === "/login" ||
    pathname === "/setup";

  const localeCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const requestHeaders = new Headers(request.headers);
  if (isAdminUiPath && isAvailableLocale(localeCookie)) {
    requestHeaders.set(LOCALE_HEADER, localeCookie);
  } else {
    requestHeaders.delete(LOCALE_HEADER); // strip client-supplied spoofing
  }

  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Static assets and Next internals never touch domain routing — pass
  // before any DB work (the matcher already skips _next/static & favicon.ico).
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // The dot check passes static-asset-looking paths before domain routing
    // AND the admin gate. No real admin route contains a dot (all protected
    // prefixes are exact static paths), so this is safe today — any new
    // admin route with a dotted segment would skip the auth gate here.
    pathname.includes(".")
  ) {
    return next();
  }

  // ── 2. Custom domains (#85) ──────────────────────────────────────────────
  // The raw Host header decides by default; X-Forwarded-Host is only
  // honored behind an explicit operator opt-in (a trusted proxy that
  // OVERWRITES it). A client-supplied X-Forwarded-Host would otherwise let
  // the attacker choose the host identity: bypass the strict admin lock,
  // defeat the unknown-host 404 fallback, and self-activate bindings.
  const host = normalizeHost(
    pickRequestHost(
      request.headers.get("x-forwarded-host"),
      request.headers.get("host"),
      process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
    ),
  );
  if (host) {
    const [policy, bindings] = await Promise.all([
      getDomainPolicy(),
      getDomainBindings(),
    ]);
    const scopeByPageId = await getDomainScopeMap(bindings);

    const decision = resolveHostRequest({
      host,
      pathname,
      protocol: request.nextUrl.protocol.replace(":", ""),
      bindings,
      scopeByPageId,
      policy,
    });

    switch (decision.type) {
      case "not_found": {
        // Rewrite to an unrouted path so the framework renders its 404 page.
        return NextResponse.rewrite(new URL("/__lb_not_found", request.url));
      }
      case "redirect": {
        return NextResponse.redirect(decision.location, decision.status);
      }
      case "serve": {
        // First real hit on a pending binding proves the DNS/host path works
        // — flip it to active so the UI reflects reality. Never in demo mode
        // (read-only data dir). The flip additionally requires the raw Host
        // header to match the binding: even on opt-in trust-XFH deployments
        // a spoofed forwarded host must not mint an "active" domain.
        const rawHost = normalizeHost(request.headers.get("host"));
        const hostProven = rawHost === normalizeHost(decision.binding.host);
        if (decision.activate && hostProven && process.env.DEMO_MODE !== "true") {
          await markDomainActive(decision.binding.id);
        }
        const rewritten = NextResponse.rewrite(
          new URL(decision.rewritePath + request.nextUrl.search, request.url),
          { request: { headers: requestHeaders } },
        );
        return rewritten;
      }
      case "pass":
        break;
    }
  }

  // ── 3. Admin auth gate ───────────────────────────────────────────────────
  // Always allow the explicit public set.
  if (PUBLIC_EXACT.has(pathname)) {
    return next();
  }

  // Allow all API routes (auth is enforced inside server actions / route handlers).
  if (pathname.startsWith("/api/")) {
    return next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isProtected) {
    // Demo auto-login: skip the cookie check entirely. The admin layout's
    // getSession() also returns a mock session, so the page renders normally.
    if (process.env.DEMO_AUTO_LOGIN === "true") {
      return next();
    }

    const sessionCookie = request.cookies.get("lb_session")?.value;
    // Verify the token — not just cookie existence. A forged or expired
    // cookie is redirected to login just like a missing one.
    //
    // NOTE: This checks signature + expiry only. The password version (pv)
    // is NOT checked here because the pv check needs a settings read and
    // getSession() inside the page layout already performs the authoritative
    // DB-backed check. Defense-in-depth split: the proxy is the fast first
    // gate, getSession() is the second.
    if (!sessionCookie || !verifyToken(sessionCookie)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return next();
  }

  // Everything else (e.g. /<slug>) is treated as a public link page.
  // Block reserved admin words from being served as public pages.
  if (ADMIN_RESERVED.has(pathname)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  // Run on all paths; logic above decides what to protect.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

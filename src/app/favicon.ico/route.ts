import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSetting } from "@/server/queries";
import { trustedForwardedHost } from "@/lib/host-routing";

/**
 * Handle /favicon.ico requests.
 *
 * Without this, Next.js falls through to the catch-all route and returns
 * HTML with a 200 status. Browsers cache that aggressively and never
 * re-request, so the custom favicon never appears in the tab.
 *
 * We redirect to the custom favicon if one is set, otherwise to the default
 * favicon-32.png. A 302 (not 301) ensures browsers re-check each visit so
 * favicon changes are picked up.
 *
 * Uses a RELATIVE redirect (not absolute) so it works regardless of the
 * hostname the user accessed the instance from.
 */
export async function GET() {
  let faviconUrl = "/favicon-32.png";
  try {
    const custom = await getSetting("faviconUrl");
    if (custom) faviconUrl = custom;
  } catch {
    // DB not ready — fall back to default.
  }

  // Use a relative redirect so it resolves against whatever hostname the
  // request came from (localhost, LAN IP, domain name, etc.).
  const h = await headers();
  const host = trustedForwardedHost(h) || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";

  return NextResponse.redirect(new URL(faviconUrl, `${proto}://${host}`), {
    status: 302,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

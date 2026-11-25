import { NextRequest, NextResponse } from "next/server";
import { getPageBySlug, getActiveLinks } from "@/server/queries";
import { isSlugServedOnHost } from "@/server/domains";
import { pickRequestHost } from "@/lib/host-routing";
import { rateLimit } from "@/lib/rate-limit";
import {
  parseGoogleCreds,
  buildGoogleSaveUrl,
} from "@/lib/wallet/google-pass";
import { clientIp } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(request: NextRequest): string {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  // Host-deciding rule matches the domain-routing proxy: only trust
  // X-Forwarded-Host behind LINKBREEZE_TRUST_X_FORWARDED_HOST (a proxy
  // that overwrites it) — otherwise a spoofed header would steer the
  // encoded URL (QR phishing).
  const host =
    pickRequestHost(
      request.headers.get("x-forwarded-host"),
      request.headers.get("host"),
      process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
    ) || "localhost";
  return `${proto}://${host}`;
}

/**
 * Add-to-Google-Wallet: 302 to the pay.google.com save link. BYO creds via
 * GOOGLE_WALLET_ISSUER_ID + GOOGLE_WALLET_SERVICE_ACCOUNT_JSON — without
 * them this route 503s (the UI hides the button, this is defense in depth).
 * Links snapshot for the pass back: capped at 10 to keep the JWT
 * URL-length-safe.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
    const ip =
    clientIp(request.headers);
  const rl = rateLimit(`gwallet:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const creds = parseGoogleCreds(
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON,
    process.env.GOOGLE_WALLET_ISSUER_ID,
  );
  if (!creds) {
    return NextResponse.json(
      { error: "Google Wallet is not configured on this server" },
      { status: 503 },
    );
  }

  const { slug } = await params;
  // Exclusive-scope domains serve only their own page's pass (same rule as
  // the vCard route) — a bound exclusive host IS one page.
  const requestHost = pickRequestHost(
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
  );
  if (!(await isSlugServedOnHost(requestHost, slug))) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const page = await getPageBySlug(slug);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const links = (await getActiveLinks(page.id))
    .filter((l) => /^https?:\/\//.test(l.url))
    .slice(0, 10)
    .map((l) => ({ title: l.title || l.url, url: l.url }));

  const saveUrl = buildGoogleSaveUrl(creds, {
    slug: page.slug,
    title: page.title || page.slug,
    origin: getOrigin(request),
    logoUrl: page.avatarUrl?.startsWith("https://") ? page.avatarUrl : null,
    backgroundColor: "#1a1a2e",
    links,
    savedOn: new Date().toISOString().slice(0, 10),
  });

  if (!saveUrl) {
    return NextResponse.json(
      { error: "Failed to build wallet pass" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(saveUrl, 302);
}

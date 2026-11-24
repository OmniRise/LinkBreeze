import { NextRequest, NextResponse } from "next/server";
import { getPageBySlug, getLink } from "@/server/queries";
import { isSlugServedOnHost } from "@/server/domains";
import { pickRequestHost } from "@/lib/host-routing";
import { rateLimit } from "@/lib/rate-limit";
import { buildVCard, vcardFilename, pageToVCardInput } from "@/lib/wallet/vcard";
import { parseVCardLinkConfig, buildCustomVCard } from "@/lib/vcard-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Absolute origin — BASE_URL when set (anti host-header spoofing, same as /api/qr). */
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
 * vCard download for a public page. Read-only GET, no demoGuard (the demo
 * instance should show the full share feature). Content-Disposition is
 * attachment so browsers hand the file to the contacts app instead of
 * rendering text.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`vcard:${ip}`, 10, 60_000);
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

  const { slug } = await params;
  // Exclusive-scope domains serve only their own page's vCard — an exclusive
  // bound host IS one page, so it must not hand out other pages' artifacts.
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

  const origin = getOrigin(request);

  // Custom per-link card: ?link=<id> selects a vcard link on THIS page whose
  // vcard_config carries a full-replace custom contact card. Any mismatch
  // (unknown id, other page, non-vcard type, malformed config) degrades to
  // the page's default card — the URL shape never 500s or leaks rows.
  let vcard: string;
  const linkParam = request.nextUrl.searchParams.get("link");
  if (linkParam && /^\d+$/.test(linkParam)) {
    const link = await getLink(Number(linkParam));
    const config = link && link.pageId === page.id && link.type === "vcard"
      ? parseVCardLinkConfig(link.vcardConfig)
      : null;
    vcard = config
      ? buildCustomVCard(link!, config, page, origin)
      : buildVCard(pageToVCardInput(page, origin));
  } else {
    vcard = buildVCard(pageToVCardInput(page, origin));
  }

  return new NextResponse(vcard, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFilename(page.slug)}"`,
      "Cache-Control": "no-store",
    },
  });
}

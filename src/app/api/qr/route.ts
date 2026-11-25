import { NextRequest, NextResponse } from "next/server";
import { pickRequestHost } from "@/lib/host-routing";
import {
  generateQrSvg,
  generateQrPng,
  parseQrStyle,
  type QrStyle,
} from "@/lib/qr";
import { getSetting, getPageBySlug } from "@/server/queries";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(request: NextRequest): string {
  // If BASE_URL is set, always use it — prevents host-header injection
  // (X-Forwarded-Host spoofing → QR phishing, OG/canonical spoofing).
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

/** Merge saved page style with per-request overrides from the query string. */
function mergeStyle(saved: QrStyle, params: URLSearchParams): QrStyle {
  const fg = params.get("fg");
  const bg = params.get("bg");
  const logo = params.get("logo");
  const size = params.get("size");
  return {
    fg: fg && /^#[0-9a-fA-F]{6}$/.test(fg) ? fg : saved.fg,
    bg: bg && /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : saved.bg,
    logo:
      logo === "avatar" || logo === "favicon" || logo === "none"
        ? logo
        : saved.logo,
    size: size && !Number.isNaN(Number(size))
      ? Math.min(Math.max(Math.round(Number(size)), 64), 1024)
      : saved.size,
  };
}

export async function GET(request: NextRequest) {
  // Rate limit: 30 QR generations per minute per IP
  const ip = clientIp(request.headers);
  const rl = rateLimit(`qr:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const slugParam = searchParams.get("slug");
  const format = (searchParams.get("format") || "svg").toLowerCase();
  const download = searchParams.get("download") === "1";

  // Resolve the slug from settings if not provided.
  let slug = slugParam;
  if (!slug) {
    slug = (await getSetting("slug")) || "u";
  }
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const targetUrl = `${getOrigin(request)}/${slug}`;

  // Saved per-page style (absent/garbage → defaults), then query overrides.
  const page = await getPageBySlug(slug);
  const style = mergeStyle(parseQrStyle(page?.qrSettings), searchParams);
  const logoUrl =
    style.logo === "avatar"
      ? page?.avatarUrl
      : style.logo === "favicon"
        ? page?.faviconUrl
        : null;

  const downloadHeaders: Record<string, string> = download
    ? { "Content-Disposition": `attachment; filename="linkbreeze-${slug}.svg"` }
    : {};

  try {
    if (format === "png") {
      const png = await generateQrPng(targetUrl, style, logoUrl);
      return new NextResponse(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          ...(download
            ? { "Content-Disposition": `attachment; filename="linkbreeze-${slug}.png"` }
            : {}),
        },
      });
    }

    // Default: SVG
    const svg = await generateQrSvg(targetUrl, style, logoUrl);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        ...downloadHeaders,
      },
    });
  } catch (err) {
    console.error("[qr] error", err);
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}

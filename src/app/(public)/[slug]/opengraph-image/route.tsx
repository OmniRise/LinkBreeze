import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getPageBySlug,
  getActiveTheme,
  getThemeById,
  getActiveLinks,
} from "@/server/queries";
import {
  resolveOgThemeBackground,
  withAlpha,
  selectOgLinks,
} from "@/lib/og-theme";
import { decodeSlugParam } from "@/lib/link-slug";
import { trustedForwardedHost } from "@/lib/host-routing";
import { clientIp } from "@/lib/rate-limit-ip";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Dynamic OG image (AUTO mode) — "Poster Hero" layout.
 *
 * When the page has a custom uploaded OG image (ogImageMode === "custom" &&
 * ogImageUrl), generateMetadata points og:image at that file directly and
 * crawlers never hit this route. The auto card follows the page's theme for
 * EVERY background type (src/lib/og-theme.ts) and showcases the page: big
 * centered identity (avatar/name/bio) plus the top link titles as pills, so
 * the card sells the content instead of floating small text in empty space.
 *
 * Every color derives from the theme: pills/borders are low-alpha mixes of
 * the theme TEXT color (legible on light and dark backgrounds alike),
 * accents use the theme primary. The LinkBreeze mark (top-left) is the real
 * brand asset, always rendered as-is — brand identity is not theme-recolorable.
 */

/** The brand mark, read once from public/ and embedded as a data URI —
 *  satori cannot fetch relative URLs, and crawlers must not wait on a
 *  network fetch for a static asset. Falls back to null (no mark) if the
 *  file is ever missing. */
let brandMarkCache: string | null | undefined;
async function brandMarkDataUri(): Promise<string | null> {
  if (brandMarkCache !== undefined) return brandMarkCache;
  try {
    const svg = await readFile(
      path.join(process.cwd(), "public", "logo-mark.svg"),
      "utf8",
    );
    brandMarkCache = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    brandMarkCache = null;
  }
  return brandMarkCache;
}

/** Max pill count + the "+N more" tail keeps the row on one line for any
 *  page. Bio/name are truncated — satori has no line-clamp. */
const MAX_PILLS = 4;
const BIO_MAX_CHARS = 160;
const NAME_MAX_CHARS = 48;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  // PS-3: satori renders per request — CPU-heavy with no cache to absorb
  // floods. 30 generations/min per identity, same bound as the QR route.
  const ip = clientIp(await headers());
  const rl = rateLimit(`ogimage:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
      },
    });
  }
  const h = await headers();
  const origin = process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/$/, "")
    : `${(h.get("x-forwarded-proto") || "http").toString()}://${(
        trustedForwardedHost(h) ||
        h.get("host") ||
        "localhost"
      ).toString()}`;

  const page = await getPageBySlug(slug);

  // Per-page theme override first, then the globally active one — the same
  // resolution order the public page uses, so the card matches THE page.
  const theme = page?.themeId
    ? ((await getThemeById(page.themeId)) ?? (await getActiveTheme()))
    : await getActiveTheme();

  const name = (page?.title || "LinkBreeze").slice(0, NAME_MAX_CHARS);
  const bio = (page?.bio || "All my links in one place").slice(0, BIO_MAX_CHARS);
  const textColor = theme?.textColor || "#eceafe";
  const primary = theme?.primaryColor || "#533fd6";
  const secondary = theme?.secondaryColor || primary;

  const og = resolveOgThemeBackground(theme);

  // Pills: low-alpha mixes of the TEXT color stay legible on light AND dark
  // backgrounds; an unparseable text color (named CSS color) falls back to
  // primary mixes so the pills never render invisible.
  const pillBg = withAlpha(textColor, 0.07) ?? withAlpha(primary, 0.14) ?? "rgba(128, 128, 128, 0.14)";
  const pillBorder = withAlpha(textColor, 0.2) ?? withAlpha(primary, 0.4) ?? "rgba(128, 128, 128, 0.4)";
  const bioColor = withAlpha(textColor, 0.92) ?? textColor;

  const activeLinks = page ? await getActiveLinks(page.id) : [];
  const pills = selectOgLinks(activeLinks, MAX_PILLS);

  const rawAvatar = page?.avatarUrl || null;
  const avatarSrc = rawAvatar
    ? rawAvatar.startsWith("http")
      ? rawAvatar
      : `${origin}${rawAvatar.startsWith("/") ? "" : "/"}${rawAvatar}`
    : null;

  // Theme background IMAGE (image/gif types): draw as the card backdrop,
  // with the theme's overlay color layered above for text legibility.
  const backdropSrc = og.imageUrl
    ? og.imageUrl.startsWith("http")
      ? og.imageUrl
      : `${origin}${og.imageUrl.startsWith("/") ? "" : "/"}${og.imageUrl}`
    : null;

  const brandMark = await brandMarkDataUri();
  const initial = (name.trim()[0] || "L").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: og.background,
          position: "relative",
        }}
      >
        {backdropSrc ? (
          <img
            src={backdropSrc}
            alt=""
            width={1200}
            height={630}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              objectFit: "cover",
            }}
          />
        ) : null}
        {backdropSrc && og.overlay ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background: overlayRgba(og.overlay.color, og.overlay.opacity),
            }}
          />
        ) : null}

        {/* Brand: real mark top-left, wordmark top-right (banner color split) */}
        {brandMark ? (
          <img
            src={brandMark}
            alt=""
            width={52}
            height={52}
            style={{ position: "absolute", top: 30, left: 46, display: "flex" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 52,
            display: "flex",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: -0.5,
            color: textColor,
          }}
        >
          Link<span style={{ display: "flex", color: primary }}>Breeze</span>
        </div>

        {/* Poster identity */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "56px 90px",
          }}
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              width={170}
              height={170}
              style={{
                display: "flex",
                borderRadius: 9999,
                objectFit: "cover",
                border: `5px solid ${primary}`,
                marginBottom: 36,
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 170,
                height: 170,
                borderRadius: 9999,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 70,
                fontWeight: 800,
                color: "#ffffff",
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                border: `5px solid ${primary}`,
                marginBottom: 36,
              }}
            >
              {initial}
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontSize: name.length > 24 ? 64 : 82,
              fontWeight: 800,
              color: textColor,
              letterSpacing: -2,
              lineHeight: 1.02,
              marginBottom: 22,
              textAlign: "center",
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 31,
              lineHeight: 1.4,
              color: bioColor,
              maxWidth: 780,
              textAlign: "center",
              marginBottom: pills.shown.length > 0 ? 46 : 0,
            }}
          >
            {bio}
          </div>

          {pills.shown.length > 0 ? (
            <div style={{ display: "flex", gap: 16 }}>
              {pills.shown.map((title) => (
                <div
                  key={title}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "13px 24px",
                    borderRadius: 9999,
                    fontSize: 21,
                    fontWeight: 600,
                    color: textColor,
                    background: pillBg,
                    border: `1px solid ${pillBorder}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 9,
                      height: 9,
                      borderRadius: 9999,
                      background: primary,
                    }}
                  />
                  {title}
                </div>
              ))}
              {pills.extra > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "13px 24px",
                    borderRadius: 9999,
                    fontSize: 21,
                    fontWeight: 600,
                    color: textColor,
                    background: pillBg,
                    border: `1px solid ${pillBorder}`,
                  }}
                >
                  + {pills.extra} more
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

/** rgba() string for the overlay layer (satori-safe color form). */
function overlayRgba(color: string, opacity: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

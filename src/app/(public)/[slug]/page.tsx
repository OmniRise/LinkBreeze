import * as React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  getPageBySlug,
  getActiveLinks,
  getSectionsByPage,
  getActiveTheme,
  getThemeById,
  getCustomFontById,
  recordPageview,
  type SocialLink,
} from "@/server/queries";
import { getVisitorHash, getDeviceType, stripReferrer } from "@/lib/visitor";
import { rateLimit } from "@/lib/rate-limit";
import { getCountry } from "@/lib/geo";
import { isBot } from "@/lib/bot-detect";
import { getSession } from "@/lib/auth";
import { getDomainPolicy, getServingBindingForHost } from "@/server/domains";
import { normalizeHost } from "@/lib/host-routing";
import { maybeRunScheduledBackup } from "@/server/backup-scheduler";
import { ProfileHeader } from "@/components/public/ProfileHeader";
import { LinkCard } from "@/components/public/LinkCard";
import { DividerElement } from "@/components/public/DividerElement";
import { EmbedWidget } from "@/components/public/EmbedWidget";
import { EmailCapture } from "@/components/public/EmailCapture";
import { SectionHeader } from "@/components/public/SectionHeader";
import { getSetting } from "@/server/queries";
import { SocialIcons } from "@/components/public/SocialIcons";
import { ShareBlock } from "@/components/public/ShareBlock";
import { parseGoogleCreds } from "@/lib/wallet/google-pass";
import { parseAppleCreds } from "@/lib/wallet/apple-pass";
import { AuroraBackground } from "@/components/aurora/AuroraBackground";
import { VideoBackground } from "@/components/public/VideoBackground";
import { groupLinksBySection, sectionStaggerDelays } from "@/lib/link-sections";
import { truthy } from "@/lib/utils";
import {
  resolveBackground,
  isAnimatedAurora,
  buildThemeStyleBlock,
  revealAnimationStyle,
  type ThemeInput,
} from "@/lib/theme-tokens";
import { parseCustomFontId, buildFontFaceCss } from "@/lib/custom-fonts";
import { decodeSlugParam } from "@/lib/link-slug";

export const revalidate = 60;

// Force dynamic rendering so cookies() and headers() are read at request
// time. Without this, ISR caches the page and getSession() can't see the
// owner's session cookie — so owner views get counted in analytics.
export const dynamic = "force-dynamic";

/** Build the public origin for absolute URLs in metadata. */
async function getOrigin(): Promise<string> {
  // If BASE_URL is set, always use it — prevents host-header injection.
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host =
    (h.get("x-forwarded-host") || h.get("host") || "localhost").toString();
  const proto = (h.get("x-forwarded-proto") || "http").toString();
  return `${proto}://${host}`;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const page = await getPageBySlug(slug);
  if (!page) return { title: "Page not found" };

  const title =
    page.seoTitle || page.title || "LinkBreeze";
  const description = page.seoDescription || page.bio || "My links";
  const origin = await getOrigin();
  const url = `${origin}/${slug}`;

  // Custom domains (#85): when this request arrives on a host bound to a
  // page, the page's identity URL is the domain ROOT — not /slug, and not
  // whatever host the crawler happened to reach. With the default '301'
  // canonical strategy crawlers are redirected before this renders; the
  // 'tag' strategy exists precisely for setups where the redirect is
  // impossible (edge proxies), so it relies on this block.
  let canonicalUrl = url;
  if ((await getDomainPolicy()).canonical !== "off") {
    const hostHeader = normalizeHost(
      (await headers()).get("x-forwarded-host") || (await headers()).get("host"),
    );
    if (await getServingBindingForHost(hostHeader)) {
      canonicalUrl = `https://${hostHeader}/`;
    }
  }

  // Custom OG image (per-page): when the page has an uploaded image AND the
  // mode is custom, point og:image at the file directly (scaled to the
  // crop the user picked); crawlers never hit the dynamic renderer.
  // Custom mode WITHOUT an upload (or any URL problem) falls back to auto.
  const useCustomOg =
    page.ogImageMode === "custom" && !!page.ogImageUrl;
  const ogImage = useCustomOg
    ? page.ogImageUrl!.startsWith("http")
      ? page.ogImageUrl!
      : `${origin}${page.ogImageUrl!.startsWith("/") ? "" : "/"}${page.ogImageUrl!}`
    : `${origin}/${slug}/opengraph-image`;

  // Search-engine visibility (#94): when the operator hides the page from
  // settings, it stays crawlable (see robots.ts for why) but sends a
  // noindex directive — the actual de-listing mechanism — and the sitemap
  // drops it. Follow stays true: blocking outbound link discovery isn't
  // the goal, de-listing this page is.
  const hidden = (await getSetting("searchEngineHidden")) === "true";

  // Build icons: use page-specific favicon if set, else default LinkBreeze icons.
  let icons: Metadata["icons"] = {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  };

  if (page.faviconUrl) {
    const ext = page.faviconUrl.split(".").pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      ico: "image/x-icon",
      png: "image/png",
      svg: "image/svg+xml",
      gif: "image/gif",
      webp: "image/webp",
    };
    const favType = typeMap[ext || ""] || "image/x-icon";
    const isSvg = ext === "svg";
    const sizes = isSvg ? "any" : "16x16 32x32 48x48 96x96 150x150 192x192";
    icons = {
      icon: [{ url: page.faviconUrl, sizes, type: favType }],
      apple: { url: page.faviconUrl, sizes: "180x180", type: favType },
    };
  }

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    ...(hidden ? { robots: { index: false, follow: true } } : {}),
    icons,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "profile",
      siteName: title,
      images: useCustomOg
        ? [{ url: ogImage }] // uploaded file: real dimensions unknown, omit
        : [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const page = await getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  // ── Server-side pageview recording (best-effort) ───────────────────────
  try {
    const h = await headers();
    const ip =
      (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
      (h.get("x-real-ip") || "").toString() ||
      "0.0.0.0";
    const userAgent = (h.get("user-agent") || "").toString();
    const referrer = stripReferrer(
      (h.get("referer") || h.get("referrer") || "").toString(),
    );

    // Skip analytics outside production — dev/preview traffic is the owner.
    // Issue #41: Skip known bots/crawlers.
    // Issue #40: Skip the owner (authenticated admin).
    const isCrawler = isBot(userAgent);
    const hasSessionCookie = !!h.get("cookie")?.includes("lb_session");
    const isOwner = hasSessionCookie ? await getSession() : null;
    if (process.env.NODE_ENV === "production" && !isCrawler && !isOwner) {
      const visitorHash = getVisitorHash(ip, userAgent);
      const deviceType = getDeviceType(userAgent);
      const country = getCountry(h);
      const viewRl = rateLimit(`view:${ip}`, 1, 30_000);
      if (viewRl.ok) {
        await recordPageview(visitorHash, referrer, deviceType, country, page.id);
        // #83: opportunistic scheduled-backup trigger (fire-and-forget,
        // throttled to one settings-read per minute inside the scheduler).
        maybeRunScheduledBackup();
      }
    }
  } catch {
    // Never let analytics break the page render.
  }

  // Resolve theme: page-specific themeId → fallback to global active theme.
  const pageTheme = page.themeId ? await getThemeById(page.themeId) : null;
  const fallbackTheme = await getActiveTheme();
  const theme = pageTheme ?? fallbackTheme;

  const activeLinks = await getActiveLinks(page.id);
  const sections = await getSectionsByPage(page.id);

  // Group links: uncategorized first, then each section in order. Empty
  // sections are dropped so no orphan headers render.
  const groups = groupLinksBySection(activeLinks, sections);
  const delays = sectionStaggerDelays(groups);
  const animate = theme?.animationType !== "none";
  // Socials enter at 240ms, continuing the profile stagger
  // (avatar 0 → name 80 → bio 160 → socials 240 → sections 300+).
  const socialsReveal = revealAnimationStyle(animate ? theme?.animationType : "none", 240);

  // Parse social links from page JSON.
  let socialLinks: SocialLink[] = [];
  try {
    socialLinks = JSON.parse(page.socialLinks || "[]");
  } catch {
    socialLinks = [];
  }

  const themeInput: ThemeInput = theme ?? {};

  // Uploaded fonts (#82): resolve "custom:<id>" refs to @font-face rules +
  // a lookup map so the token resolver emits the right family stacks.
  // Both the site font AND the card font may reference uploaded fonts.
  // Missing rows → resolver falls back to the default font (never a
  // broken stack).
  const customFontIds = [
    parseCustomFontId(themeInput.fontFamily),
    parseCustomFontId(themeInput.cardFontFamily),
  ].filter((id): id is number => id !== null);
  let fontFaceCss: string | undefined;
  let customFontLookup: Map<number, { family: string }> | undefined;
  if (customFontIds.length > 0) {
    const rows = await Promise.all(
      [...new Set(customFontIds)].map((id) => getCustomFontById(id)),
    );
    const found = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    if (found.length > 0) {
      fontFaceCss = found.map((r) => buildFontFaceCss(r)).join("\n");
      customFontLookup = new Map(found.map((r) => [r.id, { family: r.family }]));
    }
  }

  const useAurora = isAnimatedAurora(themeInput);
  const useVideo = themeInput.backgroundType === "video" && !!themeInput.backgroundImageUrl;
  // Per-upload background adjustment override (Spec: Image-Positioning).
  // Zoom applies to IMAGE backgrounds only; video gets fit + position via
  // the VideoBackground prop and never scales.
  const bgAdjustment = {
    fit: page.backgroundFitOverride,
    posX: page.backgroundPosX,
    posY: page.backgroundPosY,
    zoom: page.backgroundZoom,
  };
  const themeInputWithBg: ThemeInput =
    useVideo || (themeInput.backgroundType !== "image" && themeInput.backgroundType !== "gif")
      ? themeInput
      : {
          ...themeInput,
          backgroundFit:
            bgAdjustment.fit === "contain" || bgAdjustment.fit === "cover" || bgAdjustment.fit === "tile"
              ? bgAdjustment.fit
              : themeInput.backgroundFit ?? null,
          backgroundPosition:
            typeof bgAdjustment.posX === "number" || typeof bgAdjustment.posY === "number"
              ? `${(bgAdjustment.posX ?? 0.5) * 100}% ${(bgAdjustment.posY ?? 0.5) * 100}%`
              : themeInput.backgroundPosition ?? null,
          // Zoom rides as an extra field consumed by mediaBackgroundCss.
          ...(typeof bgAdjustment.zoom === "number" && bgAdjustment.zoom > 1
            ? { backgroundZoom: bgAdjustment.zoom }
            : {}),
        } as ThemeInput;
  const background = resolveBackground(themeInputWithBg);

  const themeStyleBlock = buildThemeStyleBlock(themeInput, {
    customFonts: customFontLookup,
    fontFaceCss,
  });

  // Map page row → ProfileRow-compatible object for ProfileHeader.
  const profileCompat = {
    displayName: page.title,
    bio: page.bio,
    avatarUrl: page.avatarUrl,
    bannerUrl: page.bannerUrl,
    badgeText: page.badgeText,
    socialLinks: page.socialLinks,
    // Per-upload image adjustments (Spec: Image-Positioning)
    avatarFit: page.avatarFit,
    avatarPosX: page.avatarPosX,
    avatarPosY: page.avatarPosY,
    avatarZoom: page.avatarZoom,
    bannerFit: page.bannerFit,
    bannerPosX: page.bannerPosX,
    bannerPosY: page.bannerPosY,
    bannerZoom: page.bannerZoom,
  };

  // Share/wallet exports — opt-in per page (share_enabled, default off).
  // Wallet buttons additionally require the operator's BYO credentials.
  const googleWalletEnabled =
    page.shareEnabled === true &&
    !!parseGoogleCreds(
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON,
      process.env.GOOGLE_WALLET_ISSUER_ID,
    );
  const appleWalletEnabled =
    page.shareEnabled === true && !!parseAppleCreds(process.env);

  // JSON-LD structured data.
  const origin = await getOrigin();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: page.title || undefined,
    description: page.bio || undefined,
    url: `${origin}/${slug}`,
    image: page.avatarUrl || undefined,
    mainEntity: {
      "@type": "Person",
      name: page.title || undefined,
      description: page.bio || undefined,
      image: page.avatarUrl || undefined,
      sameAs: socialLinks.flatMap((s) => (s.url ? [s.url] : [])),
    },
  };

  return (
    <>
      {useAurora ? <AuroraBackground /> : null}
      {useVideo ? (
        <VideoBackground
          theme={themeInput}
          adjustment={{
            fit: page.backgroundFitOverride,
            posX: page.backgroundPosX,
            posY: page.backgroundPosY,
          }}
        />
      ) : null}
      {truthy(themeInput.noise) ? <div aria-hidden className="lb-noise" /> : null}
      {page.analyticsScript ? (
        <div dangerouslySetInnerHTML={{ __html: page.analyticsScript }} />
      ) : null}
      {page.customCss ? (
        <style dangerouslySetInnerHTML={{ __html: page.customCss }} />
      ) : null}
      <style dangerouslySetInnerHTML={{ __html: themeStyleBlock }} />
      <a
        href="#lb-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to content
      </a>
      <main
        id="lb-main"
        style={{
          background: useAurora || useVideo ? undefined : background,
          color: "var(--lb-text)",
          fontFamily: "var(--lb-font)",
          minHeight: "100vh",
          boxSizing: "border-box",
        }}
        className={`relative flex w-full flex-col${themeInput.linkStyle === "pixel" ? " lb-pixel-mode" : ""}${themeInput.linkStyle === "gel" ? " lb-gel-mode" : ""}`}
        data-alignment={themeInput.alignment || "center"}
      >
      <div
        className="lb-container w-full px-5 pt-12 pb-6 sm:pt-16 sm:pb-8"
        style={{
          maxWidth: "var(--lb-container-width)",
          margin: "0 auto",
          textAlign: "var(--lb-alignment)" as React.CSSProperties["textAlign"],
        }}
      >
        <ProfileHeader profile={profileCompat as never} theme={themeInput} />

        {socialLinks.length > 0 ? (
          <div className="mb-8 mt-6" style={socialsReveal as React.CSSProperties}>
            <SocialIcons socialLinks={socialLinks} theme={themeInput} />
          </div>
        ) : null}

        <div style={{ marginTop: "var(--lb-spacing)" }}>
          {activeLinks.length > 0 ? (
            groups.map((group, gi) => (
              <section key={group.section?.id ?? "uncategorized"} style={{ marginBottom: "calc(var(--lb-spacing) * 1.5)" }}>
                {group.section ? (
                  <SectionHeader
                    section={group.section}
                    delayMs={delays[gi]?.header ?? 0}
                    animationType={animate ? (theme?.animationType || "lift") : "none"}
                    alignment={themeInput.alignment as "left" | "center" | "right" | undefined}
                  />
                ) : null}
                {group.links.map((link, li) =>
                  link.type === "embed" ? (
                    <EmbedWidget
                      key={link.id}
                      url={link.url}
                      title={link.title}
                      index={0}
                      baseDelayMs={delays[gi]?.links[li] ?? 0}
                      animationType={theme?.animationType || "lift"}
                      theme={themeInput}
                    />
                  ) : link.type === "divider" ? (
                    <DividerElement
                      key={link.id}
                      link={link}
                      index={0}
                      baseDelayMs={delays[gi]?.links[li] ?? 0}
                      theme={themeInput}
                    />
                  ) : (
                    <LinkCard
                      key={link.id}
                      link={link}
                      index={0}
                      baseDelayMs={delays[gi]?.links[li] ?? 0}
                      theme={themeInput}
                      pageSlug={slug}
                    />
                  ),
                )}
              </section>
            ))
          ) : (
            <p
              className="text-center text-sm"
              style={{ color: "var(--lb-text-muted)" }}
            >
              No links yet.
            </p>
          )}
        </div>

        {page.emailCapture || page.shareEnabled ? (
          <div className="lb-footer-zone" data-lb-footer-zone>
            {page.emailCapture ? (
              <EmailCapture consentText={await getSetting("consentText")} />
            ) : null}

            {page.shareEnabled ? (
              <ShareBlock
                slug={page.slug}
                theme={themeInput}
                appleWalletEnabled={appleWalletEnabled}
                googleWalletEnabled={googleWalletEnabled}
              />
            ) : null}
          </div>
        ) : null}

        <footer
          className="lb-footer"
        >
          {page.footerText ? <p className="lb-footer-text">{page.footerText}</p> : null}
          <a
            href={`/${page.slug}/privacy`}
            className="lb-footer-link underline-offset-2 hover:underline"
          >
            Privacy
          </a>
        </footer>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </main>
    </>
  );
}

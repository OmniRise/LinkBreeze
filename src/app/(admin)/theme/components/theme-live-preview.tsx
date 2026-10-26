"use client";

import { useTranslations } from "next-intl";

import * as React from "react";
import {
  resolveThemeTokens,
  resolveBackground,
  normalizeOpacity,
  mediaObjectFit,
  mediaObjectPosition,
  type ThemeInput,
} from "@/lib/theme-tokens";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import { buildDividerHtml } from "@/components/public/build-divider";
import type { LinkRow } from "@/server/queries";
import type { CustomizerState } from "./theme-customizer";
import { parseCustomFontId, buildFontFaceCss, type CustomFontMeta } from "@/lib/custom-fonts";

/** Fake rows so the preview renders realistic link cards. */
function mockLinks(tDemo: ReturnType<typeof useTranslations>): LinkRow[] {
  const base = {
    pageId: 1,
    sectionId: null,
    orderIndex: 0,
    type: "url",
    description: null,
    icon: null,
    iconUrl: null,
    autoIcon: true,
    imageUrl: null,
    customIconUrl: null,
    iconMode: "auto",
    isActive: true,
    scheduleStart: null,
    scheduleEnd: null,
    clicksCount: 0,
    cardStyle: "compact",
    popupText: null,
    ctaLabel: null,
    abConfig: null,
    redirectSlug: null,
    createdAt: "2026-01-01 00:00:00",
  };
  return [
    { ...base, id: 1, title: tDemo("mockWebsite"), url: "https://example.com", isHighlighted: false },
    // #87 divider sample so the visualizer shows the themed line.
    { ...base, id: 90, title: "—", url: "", type: "divider", isHighlighted: false },
    { ...base, id: 2, title: tDemo("mockVideo"), url: "https://youtube.com", isHighlighted: true },
  ];
}

const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Phone-shaped theme visualizer. Runs the production theme resolver + link card
 * builder in the browser so what you see is what the public page renders —
 * admin-side JS only; the public page stays zero-JS. (Not to be confused with
 * the Live Preview button in the admin sidebar, which opens the real public
 * page in a phone frame.)
 */
export function ThemeLivePreview({
  state,
  customFonts = [],
}: {
  state: CustomizerState;
  /** Uploaded fonts (#82) so the preview renders the selected custom font. */
  customFonts?: CustomFontMeta[];
}) {
  const tDemo = useTranslations("theme");
  const theme = React.useMemo<ThemeInput>(() => ({ ...state }), [state]);

  // Uploaded-font lookup for the resolver + the matching @font-face rule.
  // Covers both the site font and the card font refs.
  const activeCustomFonts = React.useMemo(() => {
    const ids = [
      parseCustomFontId(theme.fontFamily),
      parseCustomFontId(theme.cardFontFamily),
    ].filter((id): id is number => id !== null);
    return [...new Set(ids)]
      .map((id) => customFonts.find((f) => f.id === id) ?? null)
      .filter((f): f is CustomFontMeta => f !== null);
  }, [theme.fontFamily, theme.cardFontFamily, customFonts]);

  const customFontsMap = React.useMemo(
    () =>
      activeCustomFonts.length > 0
        ? new Map(activeCustomFonts.map((f) => [f.id, { family: f.family }]))
        : undefined,
    [activeCustomFonts],
  );

  const { cssVars, background } = React.useMemo(() => {
    const isAurora = theme.backgroundType === "aurora";
    const isVideo = theme.backgroundType === "video" && !!theme.backgroundImageUrl;
    const bg = isAurora ? "var(--lb-aurora-base)" : isVideo ? "transparent" : resolveBackground(theme);
    return {
      cssVars: resolveThemeTokens(theme, { customFonts: customFontsMap }).cssVars,
      background: bg,
    };
  }, [theme, customFontsMap]);

  const fontFaceCss = activeCustomFonts.map((f) => buildFontFaceCss(f)).join("\n");

  const cards = React.useMemo(() => {
    const links = mockLinks(tDemo);
    return links
      .map((link, i) =>
        link.type === "divider"
          ? buildDividerHtml({ link, theme, index: i })
          : buildLinkCardHtml({ link, theme, index: i }),
      )
      .join("");
  }, [theme, tDemo]);

  const varStyle = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

  return (
    <div
      className="relative overflow-hidden rounded-[2rem] border-4 border-border shadow-xl"
      style={{ width: 240, height: 460, background: "var(--lb-card-bg, #0a0820)" }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `#lb-theme-preview-root { ${varStyle} }${fontFaceCss ? `\n${fontFaceCss}` : ""}`,
        }}
      />
      <div
        id="lb-theme-preview-root"
        className={`relative flex h-full w-full flex-col items-center overflow-hidden${theme.linkStyle === "gel" ? " lb-gel-mode" : ""}`}
        style={{
          background,
          fontFamily: "var(--lb-font)",
          color: "var(--lb-text)",
          letterSpacing: "var(--lb-letter-spacing)",
        }}
      >
        {theme.backgroundType === "aurora" ? (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <div
              className="absolute rounded-full"
              style={{
                width: "70%",
                paddingTop: "70%",
                left: "-15%",
                top: "-10%",
                background: "var(--lb-aurora-blob-1)",
                filter: "blur(40px)",
                opacity: 0.35,
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: "60%",
                paddingTop: "60%",
                right: "-12%",
                bottom: "-12%",
                background: "var(--lb-aurora-blob-2)",
                filter: "blur(40px)",
                opacity: 0.3,
              }}
            />
          </div>
        ) : null}
        {theme.backgroundType === "video" && theme.backgroundImageUrl ? (
          <video
            aria-hidden
            className="absolute inset-0 h-full w-full"
            src={theme.backgroundImageUrl}
            autoPlay
            muted
            loop
            playsInline
            style={{
              objectFit: mediaObjectFit(theme) as React.CSSProperties["objectFit"],
              objectPosition: mediaObjectPosition(theme),
            }}
          />
        ) : null}
        {theme.backgroundType === "video" && theme.overlayColor && normalizeOpacity(theme.overlayOpacity) > 0 ? (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: theme.overlayColor,
              opacity: normalizeOpacity(theme.overlayOpacity),
            }}
          />
        ) : null}
        {theme.noise === "true" ? (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ opacity: 0.06, mixBlendMode: "overlay", backgroundImage: NOISE_URL }}
          />
        ) : null}

        <div
          className="relative flex w-full flex-col items-center"
          style={{ paddingTop: 28, paddingBottom: 16, paddingLeft: 20, paddingRight: 20 }}
        >
          <div
            style={{
              width: "var(--lb-avatar-size, 64px)",
              height: "var(--lb-avatar-size, 64px)",
              borderRadius: "var(--lb-avatar-radius)",
              background: "var(--lb-avatar-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
              padding: 2,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "var(--lb-avatar-radius)",
                background: "var(--lb-card-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "calc(var(--lb-avatar-size, 64px) * 0.34)",
              }}
            >{tDemo("demoAvatarInitial")}</div>
          </div>
          <div
            style={{
              fontFamily: "var(--lb-font)",
              fontWeight: "var(--lb-font-weight)",
              fontSize: "calc(var(--lb-font-size) * 1.4)",
              marginBottom: 4,
            }}
          >{tDemo("demoName")}</div>
          <div
            style={{
              color: "var(--lb-text-muted)",
              fontSize: "var(--lb-font-size)",
              marginBottom: 18,
              textAlign: "center",
            }}
          >{tDemo("demoBio")}</div>
          <div
            className="lb-preview-cards flex w-full flex-col gap-2"
            data-alignment={theme.alignment}
            dangerouslySetInnerHTML={{ __html: cards }}
          />
        </div>
      </div>
    </div>
  );
}

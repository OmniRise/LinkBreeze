"use client";

import * as React from "react";
import { resolveThemeTokens, resolveBackground, type ThemeInput } from "@/lib/theme-tokens";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import { buildDividerHtml } from "@/components/public/build-divider";
import { MarkdownLite } from "@/components/public/MarkdownLite";
import type { LinkRow } from "@/server/queries";

/**
 * Live card preview for the Add/Edit link sheet.
 *
 * Runs the SAME html builders the public page uses (buildLinkCardHtml /
 * buildDividerHtml) against the page's real resolved theme tokens, so what
 * you see is exactly what visitors see — no iframe, re-renders on every
 * keystroke (Linktree-style). The rendered anchor is inert via
 * pointer-events-none: the preview is visual, clicks must not navigate.
 *
 * For text popups (#93) a second panel renders the popup body exactly as the
 * public popup does (MarkdownLite inside .lb-popup-body, real theme vars) —
 * this replaces the old dialog-inline PopupPreview.
 */
export function CardPreview({
  link,
  theme,
  pageSlug,
}: {
  link: LinkRow;
  /** The page's resolved theme row — real tokens, not approximations. */
  theme?: ThemeInput | null;
  /** Page slug — resolves native vCard links to /api/vcard/<slug>. */
  pageSlug?: string | null;
}) {
  const themeInput = React.useMemo<ThemeInput>(() => theme ?? {}, [theme]);

  const { cssVars, background } = React.useMemo(() => {
    return {
      cssVars: resolveThemeTokens(themeInput).cssVars,
      background: resolveBackground(themeInput),
    };
  }, [themeInput]);

  const cardHtml = React.useMemo(() => {
    return link.type === "divider"
      ? buildDividerHtml({ link, theme: themeInput, index: 0 })
      : buildLinkCardHtml({ link, theme: themeInput, index: 0, pageSlug });
  }, [link, themeInput, pageSlug]);

  const varStyle = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

  return (
    <div
      className="relative w-[240px] overflow-hidden rounded-[2rem] border-4 border-border shadow-xl"
      style={{ background: "var(--lb-card-bg, #0a0820)" }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `#lb-link-preview-root { ${varStyle} }`,
        }}
      />
      <div
        id="lb-link-preview-root"
        className="relative flex min-h-[180px] w-full flex-col items-center justify-center overflow-hidden px-4 py-5"
        style={{
          background,
          fontFamily: "var(--lb-font)",
          color: "var(--lb-text)",
          letterSpacing: "var(--lb-letter-spacing)",
        }}
      >
        <div
          className="lb-preview-cards pointer-events-none w-full"
          dangerouslySetInnerHTML={{ __html: cardHtml }}
        />
      </div>
    </div>
  );
}

/**
 * Popup-body panel (#93): the exact public popup content renderer
 * (MarkdownLite inside .lb-popup-body) under the page's real theme vars.
 * Rendered inside the preview pane for text popup links.
 */
export function PopupBodyPreview({
  content,
  theme,
}: {
  content: string;
  theme?: ThemeInput | null;
}) {
  const themeInput = React.useMemo<ThemeInput>(() => theme ?? {}, [theme]);
  const cssVars = React.useMemo(() => resolveThemeTokens(themeInput).cssVars, [themeInput]);
  const varStyle = Object.entries(cssVars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

  return (
    <div
      className="w-[240px] overflow-hidden rounded-[2rem] border-4 border-border shadow-xl"
      style={{ background: "var(--lb-card-bg, #0a0820)" }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `#lb-popup-preview-root { ${varStyle} }`,
        }}
      />
      <div
        id="lb-popup-preview-root"
        className="min-h-[100px] w-full px-4 py-4"
        style={{
          background: "var(--lb-card-bg, #0a0820)",
          fontFamily: "var(--lb-font)",
          color: "var(--lb-text)",
          letterSpacing: "var(--lb-letter-spacing)",
        }}
      >
        {content.trim() ? (
          <div className="lb-popup-body max-h-72 overflow-y-auto">
            <MarkdownLite content={content} />
          </div>
        ) : (
          <p className="py-4 text-center text-xs" style={{ color: "var(--lb-text-muted)" }}>
            …
          </p>
        )}
      </div>
    </div>
  );
}

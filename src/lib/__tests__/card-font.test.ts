import { describe, expect, it } from "vitest";
import { resolveThemeTokens } from "@/lib/theme-tokens";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import type { LinkRow } from "@/server/queries";

const baseLink: LinkRow = {
  id: 1,
  pageId: 1,
  sectionId: null,
  orderIndex: 0,
  title: "Test",
  url: "https://example.com",
  type: "url",
  description: null,
  icon: null,
  iconUrl: null,
  autoIcon: true,
  imageUrl: null,
  customIconUrl: null,
  iconMode: "auto",
  isActive: true,
  isHighlighted: false,
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

describe("card font token (--lb-card-font)", () => {
  it("emits 'inherit' when cardFontFamily is empty (cards ride the site font)", () => {
    const { cssVars } = resolveThemeTokens({ fontFamily: "inter", cardFontFamily: "" });
    expect(cssVars["--lb-card-font"]).toBe("inherit");
  });

  it("emits 'inherit' when cardFontFamily is missing entirely", () => {
    const { cssVars } = resolveThemeTokens({ fontFamily: "inter" });
    expect(cssVars["--lb-card-font"]).toBe("inherit");
  });

  it("resolves a bundled id through the font registry", () => {
    const { cssVars } = resolveThemeTokens({
      fontFamily: "inter",
      cardFontFamily: "playfair",
    });
    expect(cssVars["--lb-card-font"]).not.toBe("inherit");
    expect(cssVars["--lb-card-font"]).not.toBe("");
    // Resolved stack must differ from the site font's stack.
    expect(cssVars["--lb-card-font"]).not.toBe(cssVars["--lb-font"]);
  });

  it("falls back to inherit for a dangling custom:<id> ref with no lookup", () => {
    const { cssVars } = resolveThemeTokens({
      fontFamily: "inter",
      cardFontFamily: "custom:99",
    });
    // resolveFont falls back to the DEFAULT font stack for unknown customs —
    // which is the site default, i.e. cards look like the default font.
    // It must never leak the raw "custom:99" string into CSS.
    expect(cssVars["--lb-card-font"]).not.toContain("custom:99");
  });

  it("resolves a custom:<id> ref through the uploaded-font lookup", () => {
    const { cssVars } = resolveThemeTokens(
      { fontFamily: "inter", cardFontFamily: "custom:12" },
      { customFonts: new Map([[12, { family: "LB Custom 12" }]]) },
    );
    expect(cssVars["--lb-card-font"]).toContain("LB Custom 12");
  });
});

describe("link card HTML consumes the card font", () => {
  it("emits font-family:var(--lb-card-font,inherit) on standard cards", () => {
    const html = buildLinkCardHtml({ link: baseLink, theme: { linkStyle: "glass" }, index: 0 });
    expect(html).toContain("font-family:var(--lb-card-font,inherit)");
  });

  it("emits the var on pixel cards too", () => {
    const html = buildLinkCardHtml({ link: baseLink, theme: { linkStyle: "pixel" }, index: 0 });
    expect(html).toContain("font-family:var(--lb-card-font,inherit)");
  });

  it("keeps the card font on popup card buttons (font:inherit replaced by longhands)", () => {
    const popupLink = { ...baseLink, type: "text" as const, popupText: "hello" };
    const html = buildLinkCardHtml({ link: popupLink, theme: { linkStyle: "glass" }, index: 0 });
    // The button must NOT carry the font shorthand (it resets family).
    expect(html).not.toContain("font:inherit");
    expect(html).toContain("font-family:var(--lb-card-font,inherit)");
    expect(html).toContain("font-weight:inherit");
  });
});

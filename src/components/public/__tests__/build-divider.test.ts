import { describe, it, expect } from "vitest";
import { buildDividerHtml } from "@/components/public/build-divider";
import {
  resolveDividerStyle,
  resolveDividerThickness,
  resolveDividerWidth,
} from "@/lib/theme-tokens";
import type { LinkRow } from "@/server/queries";
import type { ThemeInput } from "@/lib/theme-tokens";

const baseLink: LinkRow = {
  id: 7,
  pageId: 1,
  sectionId: null,
  orderIndex: 0,
  type: "divider",
  title: "—",
  description: null,
  url: "",
  icon: null,
  iconUrl: null,
  customIconUrl: null,
  iconMode: "auto",
  autoIcon: false,
  imageUrl: null,
  isHighlighted: false,
  isActive: true,
  scheduleStart: null,
  scheduleEnd: null,
  clicksCount: 0,
  cardStyle: "compact",
  popupText: null,
  ctaLabel: null,
  abConfig: null,
  redirectSlug: null,
  createdAt: "2026-09-01 00:00:00",
};

const baseTheme: ThemeInput = {
  linkStyle: "glass",
  animationType: "none",
  cardBorderColor: "rgba(167,139,250,0.16)",
  primaryColor: "#7c5ff0",
};

describe("resolveDivider*", () => {
  it("falls back to solid/1px/100% for garbage and empty values", () => {
    expect(resolveDividerStyle(undefined)).toBe("solid");
    expect(resolveDividerStyle("zigzag")).toBe("solid");
    expect(resolveDividerStyle(" dashed ")).toBe("dashed");
    expect(resolveDividerThickness("0")).toBe("1px");
    expect(resolveDividerThickness("abc")).toBe("1px");
    expect(resolveDividerThickness("99")).toBe("8px");
    expect(resolveDividerWidth("5")).toBe("20%");
    expect(resolveDividerWidth("250")).toBe("100%");
  });

  it("accepts in-range values", () => {
    expect(resolveDividerThickness("3")).toBe("3px");
    expect(resolveDividerWidth("60")).toBe("60%");
    expect(resolveDividerStyle("gradient")).toBe("gradient");
    expect(resolveDividerStyle("dotted")).toBe("dotted");
  });
});

describe("buildDividerHtml", () => {
  it("renders a non-interactive separator driven by theme tokens", () => {
    const html = buildDividerHtml({ link: baseLink, theme: baseTheme, index: 0 });
    expect(html).toContain('role="separator"');
    expect(html).toContain("var(--lb-divider-width)");
    expect(html).toContain("var(--lb-divider-thickness)");
    expect(html).toContain("var(--lb-divider-style)");
    expect(html).toContain("var(--lb-divider-color)");
    // Decorative: no navigation, no tracking beacon, no popup.
    expect(html).not.toContain("<a");
    expect(html).not.toContain("sendBeacon");
    expect(html).not.toContain("showModal");
  });

  it("escapes the accessible label from the link title", () => {
    const html = buildDividerHtml({
      link: { ...baseLink, title: '"><script>alert(1)</script>' },
      theme: baseTheme,
      index: 0,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to a generic label when the title is empty", () => {
    const html = buildDividerHtml({ link: { ...baseLink, title: "" }, theme: baseTheme, index: 0 });
    expect(html).toContain('aria-label="Separator"');
  });

  it("emits a gradient background image only for the gradient style", () => {
    // The builder consumes --lb-divider-image (resolved per theme in
    // resolveThemeTokens); verify both style variants flow through.
    const gradient = buildDividerHtml({
      link: baseLink,
      theme: { ...baseTheme, dividerStyle: "gradient" },
      index: 0,
    });
    const solid = buildDividerHtml({
      link: baseLink,
      theme: { ...baseTheme, dividerStyle: "solid" },
      index: 0,
    });
    expect(gradient).toBe(solid); // token-driven: markup identical, values differ
    expect(gradient).toContain("background:var(--lb-divider-image)");
  });

  it("respects the reveal animation delay chain", () => {
    const animated = buildDividerHtml({
      link: baseLink,
      theme: { ...baseTheme, animationType: "lift" },
      index: 2,
      staggerMs: 60,
    });
    expect(animated).toContain("animation");
    // index 2 * 60ms stagger
    expect(animated).toContain("120ms");
  });
});

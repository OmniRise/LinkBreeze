import { describe, it, expect } from "vitest";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import type { LinkRow } from "@/server/queries";

const baseLink = {
  id: 1,
  title: "My Site",
  description: null,
  url: "https://example.com",
  isHighlighted: false,
} as unknown as LinkRow;

const theme = {
  textColor: "#eceafe",
  primaryColor: "#533fd6",
  linkStyle: "glass",
  animationType: "lift",
};

describe("buildLinkCardHtml", () => {
  it("escapes HTML in title and description", () => {
    const html = buildLinkCardHtml({
      link: { ...baseLink, title: 'A & B <c>' } as LinkRow,
      theme,
      index: 0,
    });
    expect(html).toContain("A &amp; B &lt;c&gt;");
  });

  it("opens http(s) links in a new tab, not mailto/tel", () => {
    expect(
      buildLinkCardHtml({ link: baseLink, theme, index: 0 }),
    ).toContain('target="_blank"');
    const mail = buildLinkCardHtml({
      link: { ...baseLink, url: "mailto:x@y.z" } as LinkRow,
      theme,
      index: 0,
    });
    expect(mail).not.toContain('target="_blank"');
  });

  it("#129 custom URIs render as direct hrefs with escaped scheme parts", () => {
    const html = buildLinkCardHtml({
      link: { ...baseLink, type: "custom", url: "xmpp:user@example.com?message" } as LinkRow,
      theme,
      index: 0,
    });
    // Direct href (no /go/:id — an http redirect cannot serve a URI scheme)
    // and no new-tab attrs; the beacon click tracker rides along like mailto.
    expect(html).toContain('href="xmpp:user@example.com?message"');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain("sendBeacon");
    const evil = buildLinkCardHtml({
      link: { ...baseLink, type: "custom", url: "x:y\" onmouseover=\"alert(1)" } as LinkRow,
      theme,
      index: 0,
    });
    expect(evil).not.toContain('onmouseover="alert(1)"');
  });

  it("adds the featured badge + accent border/background only when highlighted", () => {
    const plain = buildLinkCardHtml({ link: baseLink, theme, index: 0 });
    expect(plain).not.toContain("Featured");
    expect(plain).toContain("var(--lb-card-bg)");
    const hi = buildLinkCardHtml({
      link: { ...baseLink, isHighlighted: true } as LinkRow,
      theme,
      index: 0,
    });
    // Featured badge with star icon
    expect(hi).toContain("Featured");
    // Accent-tinted background via color-mix
    expect(hi).toContain("color-mix(in srgb, var(--lb-accent) 12%, var(--lb-card-bg))");
    // Thicker accent border
    expect(hi).toContain("calc(var(--lb-border-width) + 1px) solid var(--lb-accent)");
    // Bolder font weight
    expect(hi).toContain("calc(var(--lb-font-weight) + 100)");
  });

  it("includes a per-card stagger delay", () => {
    const html = buildLinkCardHtml({
      link: baseLink,
      theme,
      index: 3,
      staggerMs: 60,
    });
    expect(html).toContain("animation-delay:180ms"); // 3 * 60ms
  });

  it("omits the reveal animation when animationType is none", () => {
    const html = buildLinkCardHtml({
      link: baseLink,
      theme: { ...theme, animationType: "none" },
      index: 2,
    });
    expect(html).not.toContain("aurora-rise");
  });

  it("uses CSS custom properties instead of hardcoded colors", () => {
    const html = buildLinkCardHtml({ link: baseLink, theme, index: 0 });
    expect(html).toContain("var(--lb-text)");
    expect(html).toContain("var(--lb-accent)");
    expect(html).toContain("var(--lb-card-bg)");
    expect(html).toContain("var(--lb-card-radius)");
  });

  it("applies neon styling when linkStyle is neon", () => {
    const html = buildLinkCardHtml({
      link: baseLink,
      theme: { ...theme, linkStyle: "neon" },
      index: 0,
    });
    expect(html).toContain("var(--lb-accent)");
  });

  it("uses link title as alt text for thumbnail images", () => {
    const html = buildLinkCardHtml({
      link: {
        ...baseLink,
        title: "My Photography Portfolio",
        imageUrl: "https://example.com/photo.jpg",
      } as LinkRow,
      theme,
      index: 0,
    });
    expect(html).toContain('alt="My Photography Portfolio"');
    expect(html).not.toContain('alt=""');
  });

  it("never loads external resources for links without a cached favicon", () => {
    const html = buildLinkCardHtml({
      link: { ...baseLink, iconUrl: null } as LinkRow,
      theme,
      index: 0,
    });
    // Should use the first-letter avatar, not an external img src
    expect(html).not.toContain("google.com");
    expect(html).not.toContain("s2/favicons");
    expect(html).not.toContain('src="http');
  });

  it("uses cached favicon when iconUrl is present", () => {
    const html = buildLinkCardHtml({
      link: { ...baseLink, iconUrl: "/api/uploads/favicon-abc.png" } as LinkRow,
      theme,
      index: 0,
    });
    expect(html).toContain('src="/api/uploads/favicon-abc.png"');
  });
});

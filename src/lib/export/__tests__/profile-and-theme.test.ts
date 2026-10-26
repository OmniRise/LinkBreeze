import { describe, it, expect } from "vitest";
import {
  buildStaticExport,
  type ExportInput,
  type ExportPageInput,
} from "@/lib/export/build-static-export";
import { EXPORT_CSS } from "@/lib/export/export-css";
import { revealAnimation } from "@/lib/theme-tokens";
import type { LinkRow } from "@/server/queries";

/**
 * E.4 — test-debt pass on the export builder: branches the Phase-1 suite
 * never exercised (profile layouts, text animations, avatar border
 * variants, background types, page bg overrides, uploaded fonts) plus a
 * keyframes-completeness guard against drift between theme-tokens and the
 * exported CSS subset.
 */

const makeLink = (over: Record<string, unknown> = {}): LinkRow =>
  ({
    id: 1,
    pageId: 1,
    sectionId: null,
    orderIndex: 0,
    type: "url",
    title: "Site",
    description: null,
    url: "https://example.com",
    icon: null,
    iconUrl: null,
    customIconUrl: null,
    iconMode: "auto",
    autoIcon: true,
    imageUrl: null,
    isHighlighted: false,
    isActive: true,
    scheduleStart: null,
    scheduleEnd: null,
    clicksCount: 0,
    cardStyle: "compact",
    popupText: null,
    ctaLabel: null,
    redirectSlug: null,
    createdAt: "2026-01-01 00:00:00",
    ...over,
  }) as unknown as LinkRow;

const PAGE: ExportPageInput = {
  slug: "p",
  title: "Jane",
  bio: "Bio line",
  socialLinks: null,
  avatarUrl: "/api/uploads/avatar.png",
  bannerUrl: "/api/uploads/banner.jpg",
  footerText: null,
};

const base = (over: Partial<ExportInput>): ExportInput => ({
  page: PAGE,
  links: [makeLink()],
  sections: [],
  theme: { animationType: "none", linkStyle: "glass" },
  baseUrl: "https://x.example",
  ...over,
});

describe("profile layouts", () => {
  it("hero layout: banner with scrim + overlaid name", () => {
    const html = buildStaticExport(
      base({ theme: { profileLayout: "hero", animationType: "none" } }),
    );
    expect(html).toContain('class="lb-export-banner"');
    expect(html).toContain("linear-gradient(to top, rgba(0,0,0,0.65)");
    expect(html).toContain('<h1 style="color:var(--lb-text)');
  });

  it("banner layout: wide image above the classic block", () => {
    const html = buildStaticExport(
      base({ theme: { profileLayout: "banner", animationType: "none" } }),
    );
    expect(html).toContain('class="lb-export-banner-sm"');
    expect(html).not.toContain('class="lb-export-banner"');
  });

  it("classic layout with no banner renders neither banner block", () => {
    const html = buildStaticExport(
      base({
        page: { ...PAGE, bannerUrl: null },
        theme: { animationType: "none" },
      }),
    );
    expect(html).not.toContain('class="lb-export-banner"');
    expect(html).not.toContain('class="lb-export-banner-sm"');
    // letter fallback avatar (no banner changes nothing there)
    expect(html).toContain("J");
  });
});

describe("text animations", () => {
  it("typewriter emits the clip-path reveal + caret markup", () => {
    const html = buildStaticExport(
      base({ theme: { textAnimation: "typewriter", animationType: "none" } }),
    );
    expect(html).toContain('class="lb-text-anim lb-tw"');
    expect(html).toContain("lb-tw-reveal");
    expect(html).toContain('class="lb-tw-caret"');
    expect(html).toContain("steps(4)"); // "Jane" = 4 chars
  });

  it("gradient-flow uses the avatar gradient as text fill", () => {
    const html = buildStaticExport(
      base({ theme: { textAnimation: "gradient-flow", animationType: "none" } }),
    );
    expect(html).toContain("lb-gradient-text-flow");
    expect(html).toContain("background-clip:text");
    expect(html).toContain("color:transparent");
  });
});

describe("avatar border variants", () => {
  const cases: Array<[string, string]> = [
    ["none", 'data-avatar-shape="circle"'],
    ["glow", "box-shadow:0 0 24px var(--lb-avatar-glow)"],
    ["gradient", "background:var(--lb-avatar-gradient)"],
    ["ring", "box-shadow:0 0 0 3px var(--lb-accent);padding:6px"],
    ["solid", "border:2px solid var(--lb-avatar-border"],
    ["garbage-ignored", 'data-avatar-shape="circle"'],
  ];
  for (const [border, needle] of cases) {
    it(`renders ${border} variant`, () => {
      const html = buildStaticExport(
        base({ theme: { avatarBorder: border, animationType: "none" } }),
      );
      expect(html).toContain(needle);
    });
  }
});

describe("background types", () => {
  it("aurora renders the CSS-only background layers", () => {
    const html = buildStaticExport(
      base({ theme: { backgroundType: "aurora", animationType: "none" } }),
    );
    expect(html).toContain('class="aurora-root"');
    expect(html).toContain("aurora-blob--1");
    expect(html).not.toMatch(/<main[^>]*style="[^"]*background:/);
  });

  it("video renders the <video> layer with an absolutized src", () => {
    const html = buildStaticExport(
      base({
        theme: {
          backgroundType: "video",
          backgroundImageUrl: "/api/uploads/bg.mp4",
          animationType: "none",
        },
      }),
    );
    expect(html).toContain('<video autoplay muted loop playsinline');
    expect(html).toContain('src="https://x.example/api/uploads/bg.mp4"');
    expect(html).toContain('class="lb-video-bg"');
  });

  it("noise flag renders the grain overlay", () => {
    const html = buildStaticExport(
      base({ theme: { noise: true, animationType: "none" } }),
    );
    expect(html).toContain('class="lb-noise"');
  });

  it("page background overrides win over theme fit (contain)", () => {
    const html = buildStaticExport(
      base({
        page: { ...PAGE, backgroundFitOverride: "contain" },
        theme: {
          backgroundType: "image",
          backgroundImageUrl: "/api/uploads/pic.jpg",
          backgroundFit: "cover",
          animationType: "none",
        },
      }),
    );
    expect(html).toContain("/contain no-repeat");
  });
});

describe("uploaded fonts", () => {
  it("fontFaceCss rides into the document head", () => {
    const html = buildStaticExport(
      base({
        fontFaceCss: "@font-face{font-family:'MyFont';src:url(font.woff2)}",
        customFonts: new Map([[7, { family: "MyFont" }]]),
        theme: { fontFamily: "custom:7", animationType: "none" },
      }),
    );
    expect(html).toContain("@font-face{font-family:'MyFont'");
    expect(html).toContain("--lb-font: 'MyFont'");
  });

  it("unknown custom font ref falls back to the default stack", () => {
    const html = buildStaticExport(
      base({ theme: { fontFamily: "custom:99", animationType: "none" } }),
    );
    expect(html).not.toContain("custom:99");
    expect(html).toContain("--lb-font:");
  });
});

describe("keyframes completeness (theme-tokens ↔ EXPORT_CSS drift guard)", () => {
  it("every reveal animation keyframe exists in the exported CSS", () => {
    for (const type of ["lift", "scale", "zoom-in", "fade-up", "slide-in", "blur-in"]) {
      const anim = revealAnimation(type, 0);
      const name = anim.match(/animation: ([a-z-]+)/)?.[1];
      expect(name, `no keyframe name for ${type}`).toBeTruthy();
      expect(EXPORT_CSS, `missing @keyframes ${name} for ${type}`).toContain(
        `@keyframes ${name}`,
      );
    }
  });

  it("typewriter, float and text-flow keyframes are exported", () => {
    for (const name of [
      "lb-tw-reveal",
      "lb-tw-caret-track",
      "lb-caret-blink",
      "lb-float",
      "lb-gradient-text-flow",
      "aurora-drift",
      "aurora-rise",
    ]) {
      expect(EXPORT_CSS).toContain(`@keyframes ${name}`);
    }
  });
});

describe("reduced-motion parity (E.26)", () => {
  it("the prefers-reduced-motion gate ships in EXPORT_CSS", () => {
    expect(EXPORT_CSS).toContain("@media (prefers-reduced-motion:reduce){");
    // every animated surface the export can render is gated
    for (const selector of [
      ".aurora-blob",
      ".aurora-rise",
      ".lb-reveal",
      ".lb-float",
      ".lb-text-anim",
      ".lb-tw-text",
      ".lb-tw-caret",
      ".lb-link-card",
      ".lb-social-icon",
      ".lb-popup-dialog[open]",
    ]) {
      expect(EXPORT_CSS, `gate missing ${selector}`).toContain(selector);
    }
    expect(EXPORT_CSS).toContain("animation:none!important");
  });

  it("the gate actually reaches the composed document", () => {
    const html = buildStaticExport(
      base({ theme: { animationType: "lift", noise: true } }),
    );
    expect(html).toContain("@media (prefers-reduced-motion:reduce){");
  });
});

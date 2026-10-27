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

describe("theme extremes: density × fontScale × linkStyle (E.120)", () => {
  const inputWith = (theme: Record<string, unknown>): ExportInput => ({
    page: {
      slug: "extreme",
      title: "T",
      bio: null,
      socialLinks: null,
      avatarUrl: null,
      bannerUrl: null,
      footerText: null,
    } as unknown as ExportPageInput,
    links: [makeLink({ id: 1, title: "Solo" })],
    sections: [],
    theme: { animationType: "none", ...theme } as ExportInput["theme"],
    baseUrl: "https://links.example.com",
  });

  it("compact density → 8px spacing token, fontScale extremes scale exactly", () => {
    const compact = buildStaticExport(inputWith({ density: "compact", fontScale: "90" }));
    expect(compact).toContain("--lb-spacing: 8px");
    // 90% of the 15px base
    expect(compact).toContain("--lb-font-size: 13.5px");

    const big = buildStaticExport(inputWith({ density: "compact", fontScale: "130" }));
    expect(big).toContain("--lb-spacing: 8px");
    expect(big).toContain("--lb-font-size: 19.5px");

    const normal = buildStaticExport(inputWith({}));
    expect(normal).toContain("--lb-spacing: 12px");
    expect(normal).toContain("--lb-font-size: 15px");

    const relaxed = buildStaticExport(inputWith({ density: "relaxed" }));
    expect(relaxed).toContain("--lb-spacing: 16px");
  });

  it("linkStyle extremes flip the mode class AND keep their card rules", () => {
    const gel = buildStaticExport(inputWith({ linkStyle: "gel", density: "compact" }));
    expect(gel).toContain("lb-gel-mode");
    expect(gel).toContain(".lb-gel-mode .lb-link-card"); // rules ship

    const pixel = buildStaticExport(inputWith({ linkStyle: "pixel", fontScale: "90" }));
    expect(pixel).toContain("lb-pixel-mode");
    expect(pixel).toContain("main.lb-pixel-mode"); // scoped rules ship

    // CSS rules ship unconditionally (E.115) — only the <main> MODE
    // CLASS flips, so assert on the element, not the substring
    // (main tag carries id before class: <main id="lb-main" class="…")
    const mainClass = (html: string) =>
      html.match(/<main[^>]*\sclass="([^"]*)"/)?.[1] ?? "";
    expect(mainClass(gel)).toContain("lb-gel-mode");
    expect(mainClass(gel)).not.toContain("lb-pixel-mode");
    expect(mainClass(pixel)).toContain("lb-pixel-mode");
    expect(mainClass(pixel)).not.toContain("lb-gel-mode");
    const cls = mainClass(buildStaticExport(inputWith({ linkStyle: "glass" })));
    expect(cls).not.toContain("lb-gel-mode");
    expect(cls).not.toContain("lb-pixel-mode");
  });
});

describe("avatar/banner fit adjustments (E.123)", () => {
  const pageWith = (over: Record<string, unknown>): ExportInput => ({
    page: {
      slug: "fitpage",
      title: "Fit",
      bio: null,
      socialLinks: null,
      avatarUrl: "/api/uploads/fit.png",
      bannerUrl: "/api/uploads/banner.png",
      footerText: null,
      ...over,
    } as unknown as ExportPageInput,
    links: [],
    sections: [],
    theme: { animationType: "none" },
    baseUrl: "https://links.example.com",
  });

  it("cover + zoom-1.5 + focus point lands full adjustment math", () => {
    // posX/posY are 0–1 focus points; zoom is a 1–3 multiplier
    // (image-adjustments.ts resolve* functions — spec Image-Positioning)
    const input = pageWith({
      avatarFit: "cover",
      avatarZoom: 1.5,
      avatarPosX: 0.3,
      avatarPosY: 0.4,
      bannerFit: "cover",
      bannerZoom: 1.5,
      bannerPosX: 0.3,
      bannerPosY: 0.4,
    });
    const html = buildStaticExport({
      ...input,
      theme: { ...input.theme, profileLayout: "hero" },
    });
    // avatar img: object-fit + position + scale + origin (line 206 path)
    expect(html).toContain("object-fit:cover;object-position:30% 40%");
    expect(html).toContain("transform:scale(1.5);transform-origin:30% 40%");
    // hero banner img uses the same helper (line 254)
    const banner = html.match(/<img src="[^"]*banner\.png"[^>]*>/)?.[0] ?? "";
    expect(banner, "hero banner img").toContain("class=\"lb-export-banner\"");
    expect(banner).toContain("object-position:30% 40%");
    expect(banner).toContain("transform:scale(1.5);transform-origin:30% 40%");
  });

  it("contain with zoom-1 (identity) emits fit only, no transform", () => {
    const html = buildStaticExport(
      pageWith({ avatarFit: "contain", avatarZoom: 1 }),
    );
    expect(html).toContain("object-fit:contain");
    const avatar = html.match(/<img src="[^"]*fit\.png"[^>]*>/)?.[0] ?? "";
    expect(avatar).toContain("object-fit:contain");
    expect(avatar).toContain("object-position:50% 50%"); // defaults
    expect(avatar).not.toContain("transform:scale");
  });

  it("hero layout renders full overlay structure (E.126)", () => {
    const input = pageWith({
      bannerUrl: "/api/uploads/hero.png",
      badgeText: "Pro",
      bio: "Hero bio",
    });
    const html = buildStaticExport({
      ...input,
      theme: { ...input.theme, profileLayout: "hero" },
    });
    // banner + scrim + absolute name layer + badge (line 251-262 block)
    expect(html).toContain('class="lb-export-banner"');
    expect(html).toContain(
      'style="position:absolute;inset:0;background:linear-gradient(to top',
    );
    expect(html).toContain(
      'style="position:absolute;bottom:0;left:0;width:100%',
    );
    expect(html).toContain(">Pro<");
    expect(html).toContain("Hero bio");
    // overflow-hidden frame around the banner (scale clipping)
    expect(html).toContain("max-height:240px");
  });
  it("banner layout renders the wide strip variant, not hero (E.129)", () => {
    const input = pageWith({ bannerUrl: "/api/uploads/strip.png" });
    const html = buildStaticExport({
      ...input,
      theme: { ...input.theme, profileLayout: "banner" },
    });
    expect(html).toContain('class="lb-export-banner-sm"');
    // the hero-only full banner class must NOT render
    expect(html).not.toContain('class="lb-export-banner"');
    // frame wraps the strip (overflow + radius, no scrim/overlay)
    expect(html).toContain("overflow:hidden");
    expect(html).not.toContain("linear-gradient(to top, rgba(0,0,0,0.65)");
  });
  it("classic baseline ignores bannerUrl entirely (E.132)", () => {
    const input = pageWith({ bannerUrl: "/api/uploads/classic-bg.png" });
    const html = buildStaticExport(input); // no profileLayout set
    // CSS rules ship always (E.115) — the ELEMENT classes must not
    expect(html).not.toContain('class="lb-export-banner');
    // classic keeps the standard avatar/name header flow
    expect(html).toContain('class="lb-export-container"');
  });

  it("youtube + instagram icons render platform labels + hrefs (E.133)", () => {
    const input = pageWith({
      socialLinks: JSON.stringify([
        { platform: "youtube", url: "https://youtube.com/@x" },
        { platform: "instagram", url: "https://instagram.com/x" },
      ]),
    });
    const html = buildStaticExport(input);
    expect(html).toContain('aria-label="YouTube"');
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain('href="https://youtube.com/@x"');
    expect(html).toContain('href="https://instagram.com/x"');
    // both in the same nav row
    expect(html).toContain('aria-label="Social links"');
    expect((html.match(/class="lb-social-icon"/g) ?? []).length).toBe(2);
    // external links carry safe rel (tabnabbing)
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("social URL normalization: scheme-less → https, email → mailto, http:// verbatim (E.135)", () => {
    const input = pageWith({
      socialLinks: JSON.stringify([
        { platform: "youtube", url: "youtube.com/@bare" }, // no scheme
        { platform: "email", url: "@handle" }, // handle form
        { platform: "instagram", url: "http://instagram.com/legacy" }, // http verbatim
      ]),
    });
    const html = buildStaticExport(input);
    expect(html).toContain('href="https://youtube.com/@bare"');
    expect(html).toContain('href="mailto:handle"');
    // http:// passes through as stored (line 289 — no forced upgrade)
    expect(html).toContain('href="http://instagram.com/legacy"');
  });
  it("footer variants: footerText, footer+socials, empty footer (E.136)", () => {
    // footer alone
    const footerOnly = buildStaticExport(pageWith({ footerText: "(c) 2026" }));
    expect(footerOnly).toContain("(c) 2026");
    expect(footerOnly).not.toContain('aria-label="Social links"');

    // footer + socials together — both zones render in one export
    const both = buildStaticExport(
      pageWith({
        footerText: "Both zones",
        socialLinks: JSON.stringify([
          { platform: "x", url: "https://x.com/h" },
        ]),
      }),
    );
    expect(both).toContain("Both zones");
    expect(both).toContain('aria-label="Social links"');
    // footer shell always ships; the TEXT paragraph is the conditional part
    expect(both).toContain('class="lb-footer-text"');

    // empty-string footer: shell remains (template line 534), text gone —
    // identical to a null footerText export
    const emptyFooter = buildStaticExport(pageWith({ footerText: "" }));
    expect(emptyFooter).not.toContain('class="lb-footer-text"');
    expect(emptyFooter).toBe(buildStaticExport(pageWith({})));
  });
});

describe("page bio empty-string vs null (E.127)", () => {
  const bioInput = (bio: string | null): ExportInput => ({
    page: {
      slug: "biopage",
      title: "Bio",
      bio,
      socialLinks: null,
      avatarUrl: null,
      bannerUrl: null,
      footerText: null,
    } as unknown as ExportPageInput,
    links: [],
    sections: [],
    theme: { animationType: "none" },
    baseUrl: "https://links.example.com",
  });

  it("empty string and null produce byte-identical bio-free output", () => {
    const empty = buildStaticExport(bioInput(""));
    const nulled = buildStaticExport(bioInput(null));
    expect(empty).toBe(nulled);
    // and neither carries a bio ELEMENT (the .lb-export-bio CSS rule
    // ships unconditionally per E.115 — match the element form)
    expect(empty).not.toContain('class="lb-export-bio"');
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

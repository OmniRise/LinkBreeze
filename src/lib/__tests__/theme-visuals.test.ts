import { describe, it, expect } from "vitest";
import {
  revealAnimation,
  revealAnimationStyle,
  resolveThemeTokens,
} from "@/lib/theme-tokens";

// ─── Reveal animation variants (1.3) ────────────────────────────────────────

describe("revealAnimationStyle", () => {
  it("returns undefined for 'none'", () => {
    expect(revealAnimationStyle("none", 100)).toBeUndefined();
  });

  it("maps each 1.3 type to its keyframe", () => {
    expect(revealAnimationStyle("lift", 0)?.animation).toContain("aurora-rise");
    expect(revealAnimationStyle("fade-up", 0)?.animation).toContain("lb-fade-up");
    expect(revealAnimationStyle("slide-in", 0)?.animation).toContain("lb-slide-in");
    expect(revealAnimationStyle("zoom-in", 0)?.animation).toContain("lb-zoom-in");
    expect(revealAnimationStyle("blur-in", 0)?.animation).toContain("lb-blur-in");
    expect(revealAnimationStyle("scale", 0)?.animation).toContain("lb-zoom-in");
  });

  it("carries the stagger delay", () => {
    const s = revealAnimationStyle("fade-up", 240);
    expect(s?.animationDelay).toBe("240ms");
  });

  it("falls back to aurora-rise for unknown types", () => {
    expect(revealAnimationStyle("???", 0)?.animation).toContain("aurora-rise");
  });

  it("treats null/undefined as default lift", () => {
    expect(revealAnimationStyle(null, 0)?.animation).toContain("aurora-rise");
    expect(revealAnimationStyle(undefined, 0)?.animation).toContain("aurora-rise");
  });
});

describe("revealAnimation (string form)", () => {
  it("returns '' for 'none' (static element)", () => {
    expect(revealAnimation("none", 0)).toBe("");
  });

  it("emits animation + delay declarations", () => {
    const out = revealAnimation("slide-in", 120);
    expect(out).toContain("animation: lb-slide-in");
    expect(out).toContain("animation-delay:120ms");
  });
});

// ─── Avatar tokens (1.3) ─────────────────────────────────────────────────────

describe("avatar tokens", () => {
  it("defaults to circle radius", () => {
    const { cssVars } = resolveThemeTokens({});
    expect(cssVars["--lb-avatar-radius"]).toBe("9999px");
  });

  it("resolves each shape to a radius", () => {
    const shapes: Array<[string, string]> = [
      ["square", "0px"],
      ["rounded", "12px"],
      ["squircle", "24%"],
      ["circle", "9999px"],
    ];
    for (const [shape, radius] of shapes) {
      const { cssVars } = resolveThemeTokens({ avatarShape: shape });
      expect(cssVars["--lb-avatar-radius"]).toBe(radius);
    }
  });

  it("unknown shape falls back to circle", () => {
    const { cssVars } = resolveThemeTokens({ avatarShape: "hexagon" });
    expect(cssVars["--lb-avatar-radius"]).toBe("9999px");
  });

  it("exposes a gradient built from accent + secondary", () => {
    const { cssVars } = resolveThemeTokens({
      primaryColor: "#123456",
      secondaryColor: "#654321",
    });
    expect(cssVars["--lb-avatar-gradient"]).toContain("#123456");
    expect(cssVars["--lb-avatar-gradient"]).toContain("#654321");
  });
});

// ─── Avatar size (resizable avatar) ─────────────────────────────────────────

describe("avatar size token", () => {
  it("defaults to 94px when the field is absent (pre-slider look)", () => {
    const { cssVars } = resolveThemeTokens({});
    expect(cssVars["--lb-avatar-size"]).toBe("94px");
  });

  it("'auto' resolves to the same 94px default", () => {
    const { cssVars } = resolveThemeTokens({ avatarSize: "auto" });
    expect(cssVars["--lb-avatar-size"]).toBe("94px");
  });

  it("numeric strings resolve to their px value", () => {
    for (const size of ["72", "120", "160"]) {
      const { cssVars } = resolveThemeTokens({ avatarSize: size });
      expect(cssVars["--lb-avatar-size"]).toBe(`${size}px`);
    }
  });

  it("clamps out-of-range values to 48–180", () => {
    expect(resolveThemeTokens({ avatarSize: "10" }).cssVars["--lb-avatar-size"]).toBe("48px");
    expect(resolveThemeTokens({ avatarSize: "999" }).cssVars["--lb-avatar-size"]).toBe("180px");
  });

  it("garbage values fall back to the auto default", () => {
    const { cssVars } = resolveThemeTokens({ avatarSize: "huge" });
    expect(cssVars["--lb-avatar-size"]).toBe("94px");
  });
});

// ─── Divider element (#87) ──────────────────────────────────────────────────

describe("divider tokens", () => {
  it("defaults match the pre-divider look (solid card-border line, full width)", () => {
    const { cssVars } = resolveThemeTokens({});
    expect(cssVars["--lb-divider-style"]).toBe("solid");
    expect(cssVars["--lb-divider-color"]).toBe("var(--lb-card-border)");
    expect(cssVars["--lb-divider-thickness"]).toBe("1px");
    expect(cssVars["--lb-divider-width"]).toBe("100%");
    expect(cssVars["--lb-divider-image"]).toBe("none");
  });

  it("an explicit color overrides the card-border inheritance", () => {
    const { cssVars } = resolveThemeTokens({ dividerColor: "#ff0000" });
    expect(cssVars["--lb-divider-color"]).toBe("#ff0000");
  });

  it("gradient style resolves the line into an accent fade image", () => {
    const { cssVars } = resolveThemeTokens({
      dividerStyle: "gradient",
      primaryColor: "#7c5ff0",
    });
    expect(cssVars["--lb-divider-style"]).toBe("gradient");
    expect(cssVars["--lb-divider-image"]).toContain("linear-gradient(90deg");
    expect(cssVars["--lb-divider-image"]).toContain("#7c5ff0");
  });

  it("thickness and width clamp to the slider ranges (1–8px, 20–100%)", () => {
    expect(resolveThemeTokens({ dividerThickness: "0" }).cssVars["--lb-divider-thickness"]).toBe("1px");
    expect(resolveThemeTokens({ dividerThickness: "50" }).cssVars["--lb-divider-thickness"]).toBe("8px");
    expect(resolveThemeTokens({ dividerWidth: "1" }).cssVars["--lb-divider-width"]).toBe("20%");
    expect(resolveThemeTokens({ dividerWidth: "1000" }).cssVars["--lb-divider-width"]).toBe("100%");
  });
});

// ─── Text animation pass-through (rendered by ProfileHeader) ────────────────

describe("textAnimation values", () => {
  it("is not validated by the token resolver (rendered at component level)", () => {
    // The resolver must not choke on the new field.
    const { cssVars } = resolveThemeTokens({ textAnimation: "typewriter" });
    expect(cssVars["--lb-avatar-radius"]).toBe("9999px");
  });
});

// ─── Background types (1.3): gif + video ────────────────────────────────────

describe("background resolver for gif/video", () => {
  it("gif with image URL resolves like an image background", async () => {
    const { resolveBackground } = await import("@/lib/theme-tokens");
    expect(
      resolveBackground({
        backgroundType: "gif",
        backgroundImageUrl: "/api/uploads/loop.gif",
        backgroundValue: "#0a0820",
      }),
    ).toContain("/api/uploads/loop.gif");
  });

  it("gif without URL falls back to the base color", async () => {
    const { resolveBackground } = await import("@/lib/theme-tokens");
    expect(
      resolveBackground({ backgroundType: "gif", backgroundValue: "#112233" }),
    ).toBe("#112233");
  });

  it("video resolves colors as a gradient — the fallback behind the video", async () => {
    const { resolveBackground } = await import("@/lib/theme-tokens");
    // The <video> covers the page; backgroundValue paints the container so
    // it shows while loading and whenever the video can't play.
    expect(
      resolveBackground({
        backgroundType: "video",
        backgroundImageUrl: "/api/uploads/bg.mp4",
        backgroundValue: "#0689E4,#6DD6EC,#FAEFEF",
        backgroundAngle: "180deg",
      }),
    ).toBe("linear-gradient(180deg, #0689E4, #6DD6EC, #FAEFEF)");
  });

  it("video with a single color resolves to that color", async () => {
    const { resolveBackground } = await import("@/lib/theme-tokens");
    expect(
      resolveBackground({
        backgroundType: "video",
        backgroundValue: "#0a0820",
      }),
    ).toBe("#0a0820");
  });
});

// ─── Gel link style (1.3 Frutiger Aero) ────────────────────────────────────

describe("gel link style", () => {
  it("resolves pill radius for gel", async () => {
    const { resolveThemeTokens } = await import("@/lib/theme-tokens");
    const tokens = resolveThemeTokens({ linkStyle: "gel", radius: "auto" } as never);
    expect(tokens.cssVars["--lb-card-radius"]).toBe("9999px");
  });

  it("emits backdrop blur on the card (frosted glass)", async () => {
    const { buildLinkCardHtml } = await import("@/components/public/build-link-card");
    const html = buildLinkCardHtml({
      link: {
        id: 1,
        pageId: 1,
        sectionId: null,
        orderIndex: 0,
        type: "link",
        autoIcon: false,
        imageUrl: null,
        isHighlighted: false,
        isActive: true,
        title: "Gel test",
        url: "https://example.com",
        icon: null,
        iconUrl: null,
        customIconUrl: null,
        iconMode: "auto",
        description: null,
        scheduleStart: null,
        scheduleEnd: null,
        clicksCount: 0,
        cardStyle: "default",
        popupText: null,
        ctaLabel: null,
        abConfig: null,
        redirectSlug: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      theme: { linkStyle: "gel", blur: "10px" } as never,
      index: 0,
    });
    expect(html).toContain("backdrop-filter:blur(var(--lb-blur))");
  });

  it("Frutiger Aero preset passes Zod with gel + video + nunito", async () => {
    const { customSchema } = await import("@/lib/theme-schema");
    const { PRESETS } = await import("@/lib/theme-presets");
    const fa = PRESETS.find((p) => p.name === "Frutiger Aero");
    if (!fa) throw new Error("Frutiger Aero preset missing");
    const { isPreset: _i, isActive: _a, name: _n, ...fields } = fa;
    void _i; void _a; void _n;
    const result = customSchema.safeParse(fields);
    expect(result.success, JSON.stringify(result.success ? "" : result.error.issues)).toBe(true);
  });

  it("Frutiger Aero button text resolves to ink on bright aqua", async () => {
    const { resolveThemeTokens } = await import("@/lib/theme-tokens");
    const { PRESETS } = await import("@/lib/theme-presets");
    const fa = PRESETS.find((p) => p.name === "Frutiger Aero");
    if (!fa) throw new Error("Frutiger Aero preset missing");
    const tokens = resolveThemeTokens(fa);
    // Luminance of #0689E4 ≈ 0.235 > 0.179 → pickContrastText emits dark ink,
    // so the gel pill keeps white/ink contrast without a custom text color.
    expect(tokens.cssVars["--lb-btn-text"]).not.toBe("#ffffff");
  });
});

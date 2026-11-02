import { describe, it, expect } from "vitest";
import {
  detectPlatform,
  getPlatformLabel,
  getSocialIconSvg,
  normalizeSocialUrl,
  SUPPORTED_PLATFORMS,
  type SocialPlatform,
} from "@/lib/social-icons";

describe("SUPPORTED_PLATFORMS", () => {
  it("contains all 55 platforms", () => {
    expect(SUPPORTED_PLATFORMS).toHaveLength(55);
  });

  it("does not list `twitter` separately (alias of `x` — same X logo)", () => {
    expect(SUPPORTED_PLATFORMS).not.toContain("twitter");
    expect(SUPPORTED_PLATFORMS).toContain("x");
    expect(SUPPORTED_PLATFORMS).toContain("website");
  });
});

describe("getPlatformLabel", () => {
  it("returns the correct label for each platform", () => {
    expect(getPlatformLabel("instagram")).toBe("Instagram");
    expect(getPlatformLabel("tiktok")).toBe("TikTok");
    expect(getPlatformLabel("youtube")).toBe("YouTube");
    expect(getPlatformLabel("twitter")).toBe("X (Twitter)");
    expect(getPlatformLabel("github")).toBe("GitHub");
    expect(getPlatformLabel("discord")).toBe("Discord");
    expect(getPlatformLabel("twitch")).toBe("Twitch");
    expect(getPlatformLabel("spotify")).toBe("Spotify");
    expect(getPlatformLabel("linkedin")).toBe("LinkedIn");
    expect(getPlatformLabel("telegram")).toBe("Telegram");
    expect(getPlatformLabel("whatsapp")).toBe("WhatsApp");
    expect(getPlatformLabel("email")).toBe("Email");
  });
});

describe("detectPlatform", () => {
  it("detects Instagram", () => {
    expect(detectPlatform("https://instagram.com/myprofile")).toBe("instagram");
    expect(detectPlatform("instagram.com/user")).toBe("instagram");
  });

  it("detects YouTube (both domains)", () => {
    expect(detectPlatform("https://youtube.com/@channel")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/abc123")).toBe("youtube");
  });

  it("detects Twitter / X (both map to the single `x` platform)", () => {
    expect(detectPlatform("https://twitter.com/user")).toBe("x");
    expect(detectPlatform("https://x.com/user")).toBe("x");
  });

  it("detects GitHub", () => {
    expect(detectPlatform("https://github.com/Manak-hash")).toBe("github");
  });

  it("detects Discord (both domains + protocol)", () => {
    expect(detectPlatform("https://discord.gg/abc")).toBe("discord");
    expect(detectPlatform("https://discord.com/invite/abc")).toBe("discord");
    expect(detectPlatform("discord:abc123")).toBe("discord");
  });

  it("detects Telegram", () => {
    expect(detectPlatform("https://t.me/mychannel")).toBe("telegram");
    expect(detectPlatform("telegram:mychannel")).toBe("telegram");
  });

  it("detects WhatsApp", () => {
    expect(detectPlatform("https://wa.me/212600000000")).toBe("whatsapp");
    expect(detectPlatform("whatsapp:+212600000000")).toBe("whatsapp");
  });

  it("detects Email (mailto)", () => {
    expect(detectPlatform("mailto:user@example.com")).toBe("email");
  });

  it("returns null for empty input", () => {
    expect(detectPlatform("")).toBeNull();
  });

  it("returns null for unknown URLs", () => {
    expect(detectPlatform("https://random-example-site.com")).toBeNull();
  });

  it("does not false-match evil.com/github.com as GitHub", () => {
    expect(detectPlatform("https://evil.com/github.com")).not.toBe("github");
  });
});

describe("getSocialIconSvg", () => {
  it("returns SVG markup for each platform", () => {
    const platforms: SocialPlatform[] = [
      "instagram", "tiktok", "youtube", "x", "github",
      "discord", "twitch", "spotify", "linkedin", "telegram",
      "whatsapp", "email",
    ];
    for (const p of platforms) {
      const svg = getSocialIconSvg(p);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });

  it("returns SVG markup for each new platform", () => {
    const platforms: SocialPlatform[] = [
      "threads", "bluesky", "mastodon", "reddit", "facebook",
      "pinterest", "snapchat", "patreon", "substack", "gumroad",
      "behance", "dribbble", "soundcloud", "bandcamp", "vimeo",
      "signal", "paypal", "buymeacoffee", "kofi", "medium",
    ];
    for (const p of platforms) {
      const svg = getSocialIconSvg(p);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });
});

describe("normalizeSocialUrl", () => {
  it("returns mailto: link for email platform", () => {
    expect(normalizeSocialUrl("email", "user@example.com")).toBe("mailto:user@example.com");
  });

  it("strips leading @ from email", () => {
    expect(normalizeSocialUrl("email", "@user@example.com")).toBe("mailto:user@example.com");
  });

  it("preserves existing mailto: prefix", () => {
    expect(normalizeSocialUrl("email", "mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("preserves existing https:// for other platforms", () => {
    expect(normalizeSocialUrl("github", "https://github.com/user")).toBe("https://github.com/user");
  });

  it("adds https:// prefix when missing", () => {
    expect(normalizeSocialUrl("github", "github.com/user")).toBe("https://github.com/user");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeSocialUrl("github", "")).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import {
  normalizeSlug,
  slugError,
  isNumericRef,
  RESERVED_SLUGS,
  MAX_SLUG_LENGTH,
} from "@/lib/link-slug";

describe("normalizeSlug", () => {
  it("lowercases and converts separators", () => {
    expect(normalizeSlug("My Consulting!")).toBe("my-consulting");
    expect(normalizeSlug("  Hello World  ")).toBe("hello-world");
    expect(normalizeSlug("under_scored")).toBe("under-scored");
  });

  it("collapses and trims hyphens", () => {
    expect(normalizeSlug("a--b")).toBe("a-b");
    expect(normalizeSlug("-leading-and-trailing-")).toBe("leading-and-trailing");
  });

  it("keeps digits and hyphens, drops other punctuation", () => {
    expect(normalizeSlug("Spring-Sale-2026")).toBe("spring-sale-2026");
    expect(normalizeSlug("café")).toBe("caf");
  });

  it("preserves a pending trailing separator while typing (keystroke bug)", () => {
    // "my-" mid-typing must stay "my-", NOT collapse to "my" — a same-string
    // result makes React skip the re-render and the next keystroke swallows
    // the separator.
    expect(normalizeSlug("my-", { keepTrailingSeparator: true })).toBe("my-");
    expect(normalizeSlug("my ", { keepTrailingSeparator: true })).toBe("my-");
    expect(normalizeSlug("my_", { keepTrailingSeparator: true })).toBe("my-");
    // Mid-string typing continues correctly after the pending separator.
    expect(normalizeSlug("my-C", { keepTrailingSeparator: true })).toBe("my-c");
    // Default (submit-time) normalization still trims it.
    expect(normalizeSlug("my-")).toBe("my");
  });
});

describe("slugError", () => {
  it("accepts empty (no slug) and well-formed slugs", () => {
    expect(slugError("")).toBeNull();
    expect(slugError("my-consulting")).toBeNull();
    expect(slugError("a")).toBeNull();
  });

  it.each(["login", "setup", "dashboard", "links", "settings", "api", "sitemap.xml", "robots.txt"])(
    "rejects reserved word %s",
    (slug) => {
      expect(slugError(slug)).toBe("reserved");
    },
  );

  it("rejects pure-numeric slugs (reserved for /go/:id)", () => {
    expect(slugError("123")).toBe("numeric");
    expect(slugError("0")).toBe("numeric");
  });

  it("rejects invalid characters", () => {
    expect(slugError("has space")).toBe("invalid");
    expect(slugError("UPPER")).toBe("invalid");
    expect(slugError("a/b")).toBe("invalid");
  });

  it("rejects over-length slugs", () => {
    expect(slugError("a".repeat(MAX_SLUG_LENGTH))).toBeNull();
    expect(slugError("a".repeat(MAX_SLUG_LENGTH + 1))).toBe("length");
  });

  it("reserved list contains exactly the app route names", () => {
    expect([...RESERVED_SLUGS]).toEqual([
      "login",
      "setup",
      "invite",
      "dashboard",
      "links",
      "settings",
      "profile",
      "theme",
      "domains",
      "pages",
      "accounts",
      "audit",
      "api",
      "sitemap.xml",
      "robots.txt",
    ]);
  });
});

describe("isNumericRef", () => {
  it("detects the /go/:id form", () => {
    expect(isNumericRef("42")).toBe(true);
    expect(isNumericRef("0")).toBe(true);
    expect(isNumericRef("my-consulting")).toBe(false);
    expect(isNumericRef("12a")).toBe(false);
  });
});

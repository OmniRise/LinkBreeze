import { describe, expect, it } from "vitest";
import { isAllowedLinkUrl, buildMapsUrl, mapEmbedSrc, isMapsShortLink } from "@/lib/link-url";

describe("isAllowedLinkUrl", () => {
  it("allows regular http and https links", () => {
    expect(isAllowedLinkUrl("url", "https://example.com")).toBe(true);
    expect(isAllowedLinkUrl("url", "http://example.com")).toBe(true);
  });

  // #129 custom URI links: any RFC 3986 non-web scheme EXCEPT the
  // browser-executable denylist.
  it("accepts real-world non-web schemes as custom links", () => {
    expect(isAllowedLinkUrl("custom", "xmpp:user@example.com?message")).toBe(true);
    expect(isAllowedLinkUrl("custom", "matrix:r/example.org")).toBe(true);
    expect(isAllowedLinkUrl("custom", "nostr:npub1abc")).toBe(true);
    expect(isAllowedLinkUrl("custom", "bitcoin:1AbC?amount=1")).toBe(true);
    expect(isAllowedLinkUrl("custom", "xmpp:user@example.com")).toBe(true);
  });

  it("normalizes scheme casing before the custom denylist compare", () => {
    expect(isAllowedLinkUrl("custom", "JaVaScRiPt:alert(1)")).toBe(false);
    expect(isAllowedLinkUrl("custom", "XMPP:user@example.com")).toBe(true);
  });

  it("rejects browser-executable and local-resource schemes as custom links", () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "blob:https://example.com/abc",
      "file:///etc/passwd",
      "about:blank",
      "view-source:https://example.com",
    ]) {
      expect(isAllowedLinkUrl("custom", uri)).toBe(false);
    }
  });

  it("rejects malformed custom URIs", () => {
    expect(isAllowedLinkUrl("custom", "")).toBe(false);
    expect(isAllowedLinkUrl("custom", "xmpp:")).toBe(false);
    expect(isAllowedLinkUrl("custom", "xmpp:   ")).toBe(false);
    expect(isAllowedLinkUrl("custom", "no scheme at all")).toBe(false);
    expect(isAllowedLinkUrl("custom", "1abc:x")).toBe(false);
    expect(isAllowedLinkUrl("custom", "a b:x")).toBe(false);
    expect(isAllowedLinkUrl("custom", "not a url")).toBe(false);
  });

  it("blocks executable schemes for regular links", () => {
    expect(isAllowedLinkUrl("url", "javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkUrl("url", "data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("allows each contact link type only for its expected scheme", () => {
    expect(isAllowedLinkUrl("email", "mailto:hello@example.com")).toBe(true);
    expect(isAllowedLinkUrl("phone", "tel:+15551234567")).toBe(true);
    expect(isAllowedLinkUrl("sms", "sms:+15551234567")).toBe(true);

    expect(isAllowedLinkUrl("email", "https://example.com")).toBe(false);
    expect(isAllowedLinkUrl("phone", "javascript:alert(1)")).toBe(false);
  });

  it("only allows WhatsApp links through wa.me over https", () => {
    expect(isAllowedLinkUrl("whatsapp", "https://wa.me/15551234567")).toBe(true);
    expect(isAllowedLinkUrl("whatsapp", "whatsapp://send?phone=15551234567")).toBe(true);
    expect(isAllowedLinkUrl("whatsapp", "http://wa.me/15551234567")).toBe(false);
    expect(isAllowedLinkUrl("whatsapp", "https://example.com/15551234567")).toBe(false);
  });

  it("allows local file paths without protocol-relative URLs", () => {
    expect(isAllowedLinkUrl("file", "/uploads/demo.pdf")).toBe(true);
    expect(isAllowedLinkUrl("file", "//evil.example/file.pdf")).toBe(false);
  });
});

describe("buildMapsUrl", () => {
  it("wraps a raw place query into a Maps search URL", () => {
    expect(buildMapsUrl("Hassan II Mosque, Casablanca")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Hassan%20II%20Mosque%2C%20Casablanca",
    );
  });

  it("passes through full Google Maps URLs untouched (keeps pin/coords)", () => {
    const pasted = "https://www.google.com/maps/place/Hassan+II+Mosque/@33.6083,-7.6325,17z";
    expect(buildMapsUrl(pasted)).toBe(pasted);
  });

  it("accepts google.com without www and upgrades http to https", () => {
    expect(buildMapsUrl("http://google.com/maps/place/X/@33.6,-7.6,17z")).toBe(
      "https://google.com/maps/place/X/@33.6,-7.6,17z",
    );
  });

  it("accepts maps.google.com hosts", () => {
    expect(buildMapsUrl("https://maps.google.com/?q=Casablanca")).toBe(
      "https://maps.google.com/?q=Casablanca",
    );
  });

  it("recognizes mobile share short links", () => {
    expect(isMapsShortLink("https://maps.app.goo.gl/AbCdEf123?g_st=ic")).toBe(true);
    expect(isMapsShortLink("https://goo.gl/maps/AbCdEf123")).toBe(true);
    expect(isMapsShortLink("https://www.google.com/maps")).toBe(false);
    expect(isMapsShortLink("Hassan II Mosque")).toBe(false);
  });
});

describe("mapEmbedSrc", () => {
  it("reads the query param from our constructed search URLs", () => {
    expect(mapEmbedSrc("https://www.google.com/maps/search/?api=1&query=Koutoubia%20Mosque")).toBe(
      "https://maps.google.com/maps?q=Koutoubia%20Mosque&output=embed",
    );
  });

  it("extracts exact coordinates (with zoom) from pasted place URLs", () => {
    expect(
      mapEmbedSrc("https://www.google.com/maps/place/Hassan+II+Mosque/@33.6083,-7.6325,17z"),
    ).toBe("https://maps.google.com/maps?q=33.6083,-7.6325&z=17&output=embed");
  });

  it("falls back to the place name when coords are absent", () => {
    expect(mapEmbedSrc("https://www.google.com/maps/place/Koutoubia+Mosque/")).toBe(
      "https://maps.google.com/maps?q=Koutoubia%20Mosque&output=embed",
    );
  });

  it("handles the ?q= param shape and bare coords", () => {
    expect(mapEmbedSrc("https://maps.google.com/?q=Casablanca")).toBe(
      "https://maps.google.com/maps?q=Casablanca&output=embed",
    );
    expect(mapEmbedSrc("https://www.google.com/maps/@33.6,-7.6,15z")).toBe(
      "https://maps.google.com/maps?q=33.6,-7.6&z=15&output=embed",
    );
  });

  it("returns null for non-maps garbage", () => {
    expect(mapEmbedSrc("javascript:alert(1)")).toBeNull();
    expect(mapEmbedSrc("not a url")).toBeNull();
    expect(mapEmbedSrc("https://example.com/nothing")).toBeNull();
  });
});

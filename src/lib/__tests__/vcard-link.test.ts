import { describe, it, expect } from "vitest";
import {
  parseVCardLinkConfig,
  encodeVCardLinkConfig,
  buildCustomVCard,
} from "@/lib/vcard-link";
import type { PageRow } from "@/server/queries";

describe("parseVCardLinkConfig", () => {
  it("parses a valid stored config", () => {
    const raw = encodeVCardLinkConfig({
      organization: " Acme ",
      jobTitle: null,
      email: "hi@acme.com",
      phone: "",
      address: null,
    });
    const cfg = parseVCardLinkConfig(raw);
    expect(cfg).toEqual({
      v: 1,
      organization: "Acme",
      jobTitle: null,
      email: "hi@acme.com",
      phone: null,
      address: null,
    });
  });

  it("degrades null/undefined to null (default card)", () => {
    expect(parseVCardLinkConfig(null)).toBeNull();
  });

  it("degrades malformed JSON to null", () => {
    expect(parseVCardLinkConfig("{not json")).toBeNull();
  });

  it("degrades tampered shapes to null", () => {
    expect(parseVCardLinkConfig(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseVCardLinkConfig(JSON.stringify({ v: 1, organization: 42 }))).toBeNull();
    expect(parseVCardLinkConfig(JSON.stringify(["v", 1]))).toBeNull();
  });

  it("rejects over-length field values", () => {
    const long = "x".repeat(121);
    expect(
      parseVCardLinkConfig(JSON.stringify({ v: 1, organization: long, jobTitle: null, email: null, phone: null, address: null })),
    ).toBeNull();
  });
});

describe("encodeVCardLinkConfig", () => {
  it("trims and nulls blank values", () => {
    const cfg = parseVCardLinkConfig(
      encodeVCardLinkConfig({
        organization: "  Spaced  ",
        jobTitle: "   ",
        email: undefined,
        phone: null,
        address: "12 Main St",
      }),
    );
    expect(cfg).toEqual({
      v: 1,
      organization: "Spaced",
      jobTitle: null,
      email: null,
      phone: null,
      address: "12 Main St",
    });
  });
});

describe("buildCustomVCard", () => {
  const page = {
    slug: "rene",
    avatarUrl: "/api/uploads/avatar.jpg",
    socialLinks: JSON.stringify([
      { platform: "instagram", url: "https://instagram.com/rene" },
      { platform: "bad", url: 123 }, // malformed entry — skipped
    ]),
  } as unknown as PageRow;
  const origin = "https://links.example.com";

  it("emits only typed fields plus page avatar/socials (full replace)", () => {
    const vcard = buildCustomVCard(
      { title: "WhatsApp orders" },
      {
        v: 1,
        organization: "Acme",
        jobTitle: null,
        email: "hi@acme.com",
        phone: "+212600000000",
        address: null,
      },
      page,
      origin,
    );
    const lines = vcard.split("\r\n");
    expect(lines).toContain("FN:WhatsApp orders");
    expect(lines).toContain("N:WhatsApp orders");
    expect(lines).toContain("ORG:Acme");
    expect(lines).toContain("EMAIL;TYPE=INTERNET:hi@acme.com");
    expect(lines).toContain("TEL;TYPE=CELL:+212600000000");
    expect(lines).toContain("PHOTO;VALUE=URI:https://links.example.com/api/uploads/avatar.jpg");
    expect(lines.some((l) => l.startsWith("X-SOCIALPROFILE;TYPE=instagram:"))).toBe(true);
    // Full replace: bio NOTE and slug NICKNAME never appear, unticked fields too.
    expect(lines.some((l) => l.startsWith("NOTE:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("NICKNAME:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("TITLE:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("ADR"))).toBe(false);
  });

  it("keeps URL pointing at the page address", () => {
    const vcard = buildCustomVCard(
      { title: "X" },
      { v: 1, organization: null, jobTitle: null, email: null, phone: null, address: null },
      page,
      origin,
    );
    expect(vcard).toContain("URL:https://links.example.com/rene");
    expect(vcard).toContain("END:VCARD");
  });
});

import { describe, it, expect } from "vitest";
import { buildVCard, vcardFilename, pageToVCardInput } from "../vcard";

describe("buildVCard", () => {
  const base = {
    title: "Jane Doe",
    slug: "jane",
    origin: "https://links.example.com",
  };

  it("produces a minimal spec-valid vCard 4.0", () => {
    const vc = buildVCard(base);
    expect(vc).toContain("BEGIN:VCARD");
    expect(vc).toContain("VERSION:4.0");
    expect(vc).toContain("FN:Jane Doe");
    expect(vc).toContain("URL:https://links.example.com/jane");
    expect(vc).toContain("END:VCARD");
    expect(vc.endsWith("\r\n")).toBe(true);
  });

  it("uses CRLF line endings (RFC 6350)", () => {
    const vc = buildVCard(base);
    // No bare LF outside CRLF pairs
    expect(vc.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("escapes commas, semicolons, backslashes and newlines in values", () => {
    const vc = buildVCard({
      ...base,
      title: "Doe, Jane; CEO\\Boss\nsecond line",
    });
    expect(vc).toContain(
      "FN:Doe\\, Jane\\; CEO\\\\Boss\\nsecond line",
    );
  });

  it("includes NOTE when bio is present and skips it when blank", () => {
    const withBio = buildVCard({ ...base, bio: "Designer & maker" });
    expect(withBio).toContain("NOTE:Designer & maker");

    const blankBio = buildVCard({ ...base, bio: "   " });
    expect(blankBio).not.toContain("NOTE:");
  });

  it("omits ORG when no organization given (no hardcoded brand)", () => {
    const vc = buildVCard(base);
    expect(vc).not.toContain("ORG:");
  });

  it("escapes ORG when provided", () => {
    const vc = buildVCard({ ...base, organization: "Acme, Inc" });
    expect(vc).toContain("ORG:Acme\\, Inc");
  });

  it("emits the extended contact fields only when set", () => {
    const vc = buildVCard({
      ...base,
      jobTitle: "Founder",
      email: "hi@acme.dev",
      phone: "+212600000000",
      address: "Casablanca, MA",
      photoUrl: "https://acme.dev/me.png",
      socials: [{ platform: "x", url: "https://x.com/acme" }],
    });
    expect(vc).toContain("TITLE:Founder");
    expect(vc).toContain("EMAIL;TYPE=INTERNET:hi@acme.dev");
    expect(vc).toContain("TEL;TYPE=CELL:+212600000000");
    expect(vc).toContain("ADR;TYPE=WORK:;;Casablanca\\, MA");
    expect(vc).toContain("PHOTO;VALUE=URI:https://acme.dev/me.png");
    expect(vc).toContain("X-SOCIALPROFILE;TYPE=x:https://x.com/acme");
  });

  it("pageToVCardInput layers vcard_* overrides over page data", () => {
    const page = {
      title: "Jane",
      slug: "jane",
      bio: "Designer",
      socialLinks: JSON.stringify([{ platform: "x", url: "https://x.com/jane" }]),
      avatarUrl: "/api/uploads/a.png",
      vcardOrganization: "Acme",
      vcardJobTitle: null,
      vcardEmail: "jane@acme.dev",
      vcardPhone: null,
      vcardAddress: null,
    } as unknown as Parameters<typeof pageToVCardInput>[0];
    const input = pageToVCardInput(page, "https://links.example.com");
    expect(input.organization).toBe("Acme");
    expect(input.email).toBe("jane@acme.dev");
    expect(input.jobTitle).toBeNull();
    expect(input.photoUrl).toBe("https://links.example.com/api/uploads/a.png");
    expect(input.socials).toEqual([{ platform: "x", url: "https://x.com/jane" }]);
  });

  it("falls back to slug for empty title (FN is required by spec)", () => {
    const vc = buildVCard({ ...base, title: "" });
    expect(vc).toContain("FN:jane");
  });

  it("folds lines longer than 75 chars with space continuation", () => {
    const vc = buildVCard({
      ...base,
      bio: "x".repeat(200),
    });
    // The NOTE line: "NOTE:" (5) + 200 chars → folded into continuations
    expect(vc).toMatch(/NOTE:x{70}\r\n x+/);
    // Folding must preserve value when unfolded
    const unfolded = vc.replace(/\r\n /g, "");
    expect(unfolded).toContain(`NOTE:${"x".repeat(200)}`);
  });

  it("folds extremely long URLs from long slugs", () => {
    const vc = buildVCard({
      ...base,
      slug: "a".repeat(100),
      origin: "https://subdomain-two.example-plus.example",
    });
    const unfolded = vc.replace(/\r\n /g, "");
    expect(unfolded).toContain(`URL:https://subdomain-two.example-plus.example/${"a".repeat(100)}`);
  });
});

describe("vcardFilename", () => {
  it("sanitizes unsafe characters", () => {
    expect(vcardFilename("jane")).toBe("jane.vcf");
    expect(vcardFilename("ja../ne")).toBe("jane.vcf");
    expect(vcardFilename("")).toBe("contact.vcf");
    expect(vcardFilename("a".repeat(100))).toBe(`${"a".repeat(60)}.vcf`);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildStaticExport,
  type ExportInput,
  type ExportPageInput,
} from "@/lib/export/build-static-export";
import type { LinkRow } from "@/server/queries";

/**
 * E.9 — excluded-surface parity regression. The live page renders email
 * capture, the share/wallet block and a privacy footer link; the export
 * MUST NOT, even when the page has them enabled — every one of those
 * surfaces needs server routes, and a silent "restore" would ship links
 * that 404 on any static host. These tests pin the exclusion list from
 * DESIGN-80.md so a future builder refactor fails loudly.
 */

const PAGE: ExportPageInput = {
  slug: "jane",
  title: "Jane",
  bio: "Bio",
  socialLinks: null,
  avatarUrl: null,
  bannerUrl: null,
  footerText: null,
};

const LINK: LinkRow = {
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
} as unknown as LinkRow;

function buildWithEnabledServerSurfaces(): string {
  return buildStaticExport({
    page: {
      ...PAGE,
      // Full PageRow at runtime; the builder ignores every field below.
      emailCapture: true,
      shareEnabled: true,
      privacyPolicy: "We respect your privacy. Contact us anytime.",
    } as ExportInput["page"],
    links: [LINK],
    sections: [],
    theme: { animationType: "none" },
    baseUrl: "https://links.example.com",
  });
}

describe("E.9 excluded surfaces never ship, even when enabled", () => {
  it("no email capture form leaks", () => {
    const html = buildWithEnabledServerSurfaces();
    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("your@email.com");
    expect(html).not.toContain("/api/email");
  });

  it("no share/vcard/wallet block leaks", () => {
    const html = buildWithEnabledServerSurfaces();
    expect(html).not.toContain("/api/vcard/");
    expect(html).not.toContain("data-lb-share-vcard");
    expect(html).not.toContain("Save contact");
    expect(html).not.toContain("Google Wallet");
    expect(html).not.toContain("Apple Wallet");
  });

  it("no privacy footer link leaks", () => {
    const html = buildWithEnabledServerSurfaces();
    expect(html).not.toContain("/jane/privacy");
    expect(html).not.toContain("privacy-policy");
  });

  it("embed widgets stay plain links (never iframes), complementing E.3", () => {
    const html = buildStaticExport({
      page: PAGE,
      links: [
        { ...LINK, type: "embed", url: "https://www.youtube.com/watch?v=abc" },
      ],
      sections: [],
      theme: { animationType: "none" },
      baseUrl: "https://links.example.com",
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc"');
  });
});

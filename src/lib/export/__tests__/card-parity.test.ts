import { describe, it, expect } from "vitest";
import { buildStaticExport, type ExportInput } from "@/lib/export/build-static-export";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import type { LinkRow } from "@/server/queries";

/**
 * E.61 — export vs live card-markup parity. The export pipeline wraps the
 * SHARED buildLinkCardHtml and then post-transforms (direct href, beacon
 * strip). This pins that the transform only CHANGES href/beacon and never
 * drops an attribute (aria-*, rel, target, class, style, data-* …) the
 * live page's card carries.
 */

const LINK = {
  id: 7,
  pageId: 1,
  sectionId: null,
  orderIndex: 0,
  type: "url",
  title: "Parity Probe",
  description: "desc",
  url: "https://dest.example/x",
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

const THEME = { animationType: "lift" } as const;

function attrNames(tag: string): string[] {
  return [...tag.matchAll(/(?:^|\s)([a-zA-Z-]+)=/g)].map((m) => m[1]).sort();
}

describe("export vs shared card markup (E.61)", () => {
  it("the export keeps EVERY attribute of the shared card (href value aside)", () => {
    const raw = buildLinkCardHtml({ link: LINK, theme: THEME, index: 0 });
    const input: ExportInput = {
      page: {
        slug: "p",
        title: "T",
        bio: null,
        socialLinks: null,
        avatarUrl: null,
        bannerUrl: null,
        footerText: null,
      },
      links: [LINK],
      sections: [],
      theme: THEME,
      baseUrl: "https://links.example.com",
    };
    const html = buildStaticExport(input);

    // locate the card's interactive tag in each (raw points at /go/7)
    const rawTag = raw.match(/<(?:a|button)\s[^>]*\/go\/7[^>]*>/)?.[0];
    const exportTag = html.match(
      /<(?:a|button)\s[^>]*https:\/\/dest\.example\/x[^>]*>/,
    )?.[0];
    expect(rawTag, "raw card tag not found").toBeTruthy();
    expect(exportTag, "export card tag not found").toBeTruthy();

    const rawAttrs = attrNames(rawTag!);
    const exportAttrs = attrNames(exportTag!);

    // nothing lost
    for (const attr of rawAttrs) {
      expect(exportAttrs, `lost attribute: ${attr}`).toContain(attr);
    }
    // only href's VALUE changed — no attribute renames/additions beyond it
    const extra = exportAttrs.filter((a) => !rawAttrs.includes(a));
    expect(extra, "unexpected added attributes").toEqual([]);
    // and the rewrite is real: direct destination replaced /go/7
    expect(exportTag).toContain('href="https://dest.example/x"');
    expect(exportTag).not.toContain("/go/7");
    // beacons gone, aria/rel/target survive (spot assertions on the export)
    expect(exportTag).not.toContain("sendBeacon");
    if (rawTag!.includes("aria-")) expect(exportTag).toMatch(/aria-/);
    if (rawTag!.includes("rel=")) expect(exportTag).toMatch(/rel=/);
    if (rawTag!.includes("target=")) expect(exportTag).toMatch(/target=/);
  });
});

import { describe, it, expect } from "vitest";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";
import {
  buildStaticExport,
  type ExportInput,
  type ExportPageInput,
} from "@/lib/export/build-static-export";
import { EXPORT_MAX_BYTES } from "@/lib/export/size";
import type { LinkRow } from "@/server/queries";

/**
 * E.5 — export size for a 50-link page + compression documentation.
 * Documents the real numbers in assertions so future regressions (e.g.
 * someone inlining a huge library into EXPORT_CSS) fail loudly.
 */

const makeLink = (i: number): LinkRow =>
  ({
    id: i,
    pageId: 1,
    sectionId: i > 25 ? 1 : null,
    orderIndex: i,
    type: "url",
    title: `Link number ${i} with a reasonably long title`,
    description: `A short description for link ${i} explaining where it leads and why it matters.`,
    url: `https://example.com/page/${i}`,
    icon: null,
    iconUrl: i % 3 === 0 ? `/api/uploads/favicon-${i}.png` : null,
    customIconUrl: null,
    iconMode: "auto",
    autoIcon: true,
    imageUrl: i % 5 === 0 ? `/api/uploads/thumb-${i}.jpg` : null,
    isHighlighted: i === 1,
    isActive: true,
    scheduleStart: null,
    scheduleEnd: null,
    clicksCount: 0,
    cardStyle: "compact",
    popupText: null,
    ctaLabel: null,
    redirectSlug: null,
    createdAt: "2026-01-01 00:00:00",
  }) as unknown as LinkRow;

const PAGE: ExportPageInput = {
  slug: "big",
  title: "Big Page",
  bio: "Fifty links deep",
  socialLinks: JSON.stringify([
    { platform: "github", url: "https://github.com/x" },
    { platform: "youtube", url: "https://youtube.com/@x" },
  ]),
  avatarUrl: "/api/uploads/avatar.png",
  bannerUrl: null,
  footerText: "Footer",
};

function buildBigExport(): string {
  const links = Array.from({ length: 50 }, (_, i) => makeLink(i + 1));
  const input: ExportInput = {
    page: PAGE,
    links,
    sections: [{ id: 1, title: "Later links", icon: "📁", orderIndex: 0 }],
    theme: {
      primaryColor: "#533fd6",
      linkStyle: "glass",
      animationType: "lift",
      backgroundType: "gradient",
      backgroundValue: "#0a0820,#1a1040",
    },
    baseUrl: "https://links.example.com",
  };
  return buildStaticExport(input);
}

describe("E.5 export size (50-link page)", () => {
  it("stays far below the 2 MiB cap and reports the real footprint", () => {
    const html = buildBigExport();
    const bytes = Buffer.byteLength(html, "utf-8");
    // Generous regression tripwire: a 50-link export with the full CSS
    // subset is ~100-150KB today; 400KB means something got inlined.
    expect(bytes).toBeLessThan(400 * 1024);
    expect(bytes).toBeLessThan(EXPORT_MAX_BYTES);
    // Documented compression behavior (see DESIGN-80.md § E.5):
    // plain HTML gzip is typically 6-8x on this content shape.
    const gz = gzipSync(html, { level: constants.Z_BEST_COMPRESSION }).length;
    const br = brotliCompressSync(html).length;
    console.log(
      `[E.5] raw=${bytes}B gzip=${gz}B (${(gz / bytes).toFixed(2)}) brotli=${br}B (${(br / bytes).toFixed(2)})`,
    );
    expect(gz / bytes).toBeLessThan(0.3);
    expect(br / bytes).toBeLessThan(0.3);
  });

  it("keeps per-link overhead small (no per-card CSS duplication)", () => {
    const small = buildStaticExport({
      page: PAGE,
      links: [makeLink(1)],
      sections: [],
      theme: { animationType: "none" },
      baseUrl: "https://links.example.com",
    });
    const big = buildBigExport();
    // 49 extra links must not grow the document by more than ~2.5KB each.
    const perLink = (big.length - small.length) / 49;
    expect(perLink).toBeLessThan(2500);
  });
});

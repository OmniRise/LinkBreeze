import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { links, pages } from "@/db/schema";

/**
 * E.55 — fixture/schema drift guard. Route and builder tests hand-build
 * row objects and cast them through `as never`, so a SCHEMA change that
 * adds a required column (notNull, no default) would never fail tsc or
 * the fixtures — tests would silently keep passing against an unrealistic
 * row while production reads a value the fixture leaves undefined.
 *
 * This test introspects the REAL drizzle tables and fails the moment a
 * required column appears that the hand-built fixtures don't provide.
 */

/** Keys the test fixtures define (route.test.ts PAGE + Link-shaped rows). */
const PAGE_FIXTURE_KEYS = [
  "id",
  "slug",
  "title",
  "bio",
  "themeId",
  "emailCapture",
  "shareEnabled",
  // extra keys provided by some fixtures:
  "avatarUrl",
  "socialLinks",
  "footerText",
  "seoTitle",
  "seoDescription",
  "customCss",
  "analyticsScript",
  "isPublished",
  "orderIndex",
  "isDefault",
  "createdAt",
];

const LINK_FIXTURE_KEYS = [
  "id",
  "pageId",
  "sectionId",
  "orderIndex",
  "type",
  "title",
  "description",
  "url",
  "icon",
  "iconUrl",
  "customIconUrl",
  "iconMode",
  "autoIcon",
  "imageUrl",
  "isHighlighted",
  "isActive",
  "scheduleStart",
  "scheduleEnd",
  "clicksCount",
  "cardStyle",
  "popupText",
  "ctaLabel",
  "redirectSlug",
  "createdAt",
];

function requiredColumns(table: ReturnType<typeof getTableColumns>): string[] {
  return Object.values(table)
    .filter((col) => col.notNull && !("hasDefault" in col && col.hasDefault))
    .map((col) => col.name);
}

describe("fixture ↔ schema drift guard (E.55)", () => {
  it("every required pages column is provided by the page fixtures", () => {
    const missing = requiredColumns(getTableColumns(pages)).filter(
      (name) => !PAGE_FIXTURE_KEYS.includes(name),
    );
    expect(
      missing,
      `pages gained required column(s): ${missing.join(", ")} — add them to the hand-built fixtures`,
    ).toEqual([]);
  });

  it("every required links column is provided by the link fixtures", () => {
    const missing = requiredColumns(getTableColumns(links)).filter(
      (name) => !LINK_FIXTURE_KEYS.includes(name),
    );
    expect(
      missing,
      `links gained required column(s): ${missing.join(", ")} — add them to the hand-built fixtures`,
    ).toEqual([]);
  });

  it("introspection itself is sane (guards not vacuous)", () => {
    const pageCols = Object.keys(getTableColumns(pages));
    const linkCols = Object.keys(getTableColumns(links));
    expect(pageCols).toContain("slug");
    expect(linkCols).toContain("pageId");
    // real required columns today (notNull && !hasDefault)
    expect(requiredColumns(getTableColumns(pages))).toContain("slug");
    expect(requiredColumns(getTableColumns(links))).toEqual(
      expect.arrayContaining(["title", "url"]),
    );
    expect(requiredColumns(getTableColumns(links)).length).toBeGreaterThan(0);
    expect(requiredColumns(getTableColumns(pages)).length).toBeGreaterThan(0);
  });
});

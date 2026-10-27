import { describe, it, expect } from "vitest";
import { buildStaticExport, type ExportInput } from "@/lib/export/build-static-export";

/**
 * E.78 — customCss url() handling across modes.
 *
 * Observed and pinned behavior:
 * - embed mode: rewriteUploadPaths REACHES the customCss <style> block →
 *   /api/uploads/x becomes uploads/x, so offline bundles style correctly.
 * - plain mode: customCss stays verbatim (site-relative refs included) —
 *   the E.3 trust boundary says admin code is emitted as written; the
 *   documented remedy for foreign hosts is ?embed=1 (README "What stays
 *   home"). Page-level media (avatar etc.) absolutizes at the ROUTE level
 *   and is a separate, already-tested path.
 */

const CSS = "body{background:url(/api/uploads/bg.png)} .x{background:url('fonts/f.woff2')}";

function inputWithCss(assetBase?: string): ExportInput {
  return {
    page: {
      slug: "cssref",
      title: "T",
      bio: null,
      socialLinks: null,
      avatarUrl: "/api/uploads/avatar.png",
      bannerUrl: null,
      footerText: null,
      customCss: CSS,
    },
    links: [],
    sections: [],
    theme: { animationType: "none" },
    baseUrl: "https://links.example.com",
    ...(assetBase ? { assetBase } : {}),
  };
}

function styleBlock(html: string): string {
  const m = html.match(/<style>body\{[^<]*<\/style>/);
  expect(m, "customCss style block missing").toBeTruthy();
  return m![0];
}

describe("customCss url() across export modes (E.78)", () => {
  it("embed mode rewrites uploads paths inside customCss", () => {
    const block = styleBlock(buildStaticExport(inputWithCss("uploads")));
    expect(block).toContain("url(uploads/bg.png)");
    expect(block).not.toContain("/api/uploads/");
    // non-upload refs untouched (relative font path stays as written)
    expect(block).toContain("url('fonts/f.woff2')");
  });

  it("plain mode keeps customCss verbatim (E.3 trust boundary)", () => {
    const block = styleBlock(buildStaticExport(inputWithCss()));
    expect(block).toContain(CSS);
    expect(block).toContain("url(/api/uploads/bg.png)");
  });

  it("the rewrite never leaks into page-level media handling", () => {
    const plain = buildStaticExport(inputWithCss());
    // avatar goes through absolutizeAsset inside the builder — plain mode
    // is origin-absolute per DESIGN-80 (media travels from the instance)
    expect(plain).toContain('src="https://links.example.com/api/uploads/avatar.png"');
    const embed = buildStaticExport(inputWithCss("uploads"));
    expect(embed).toContain('src="uploads/avatar.png"');
    // …and the customCss rule still stayed verbatim even in embed mode's
    // sibling context — media src and css url() rewrite independently
    expect(styleBlock(embed)).toContain("url(uploads/bg.png)");
  });
});

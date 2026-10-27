import { describe, it, expect } from "vitest";
import { exportFilename } from "@/lib/export/filename";

describe("exportFilename", () => {
  it("uses the slug with an .html extension", () => {
    expect(exportFilename("jane")).toBe("jane.html");
  });

  it("keeps opt-in @-slugs intact", () => {
    expect(exportFilename("@churchname")).toBe("@churchname.html");
  });

  it("strips path separators and quote characters", () => {
    expect(exportFilename('a/b"c')).toBe("abc.html");
  });

  it("falls back to page.html for empty/unsafe slugs", () => {
    expect(exportFilename("")).toBe("page.html");
    expect(exportFilename("../..")).toBe("page.html");
    expect(exportFilename(" ")).toBe("page.html");
  });

  it("caps very long slugs", () => {
    expect(exportFilename("x".repeat(200))).toBe(`${"x".repeat(64)}.html`);
  });

  it("unicode slugs degrade to pure-ASCII names, never throw (E.42)", () => {
    // three scripts: latin-diacritic, CJK, cyrillic
    const cases: Array<[string, string]> = [
      ["café", "caf.html"], // diacritic stripped, ASCII stem survives
      ["日本語", "page.html"], // fully stripped → fallback
      ["профиль", "page.html"], // fully stripped → fallback
      ["café-du-monde", "caf-du-monde.html"],
    ];
    for (const [slug, expected] of cases) {
      const name = exportFilename(slug);
      expect(name, slug).toBe(expected);
      // header-safety: Content-Disposition must never carry raw non-ASCII
      expect(name, slug).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

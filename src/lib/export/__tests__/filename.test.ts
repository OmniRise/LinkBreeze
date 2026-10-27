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

  it("interior dots in slug survive; only leading dots are stripped (E.169)", () => {
    expect(exportFilename("my.blog")).toBe("my.blog.html");
    expect(exportFilename("v1.2.3.release")).toBe("v1.2.3.release.html");
    // leading-dot forms still collapse (already pinned for "../..")
    expect(exportFilename(".hidden")).toBe("hidden.html");
    expect(exportFilename(".")).toBe("page.html");
  });

  it("header injection class closed: hostile slug reduced to safe ASCII (E.190)", () => {
    const hostile = 'a";\r\nX-Injected: evil\r\n';
    const out = exportFilename(hostile);
    // every byte outside the allowlist (quotes, CR, LF, colon, space,
    // semicolon) is stripped — the Content-Disposition template
    // (route.ts:257) can never receive a quote or newline from it.
    // Hyphen survives (it's filename-safe; X-Injected keeps its dash)
    expect(out).toBe("aX-Injectedevil.html");
    expect(out).toMatch(/^[A-Za-z0-9\-_.@]+\.html$/);
    expect(out).not.toContain('"');
    expect(out).not.toMatch(/[\r\n;]/);
    // second hostile shape: percent + backslash + angle brackets
    expect(exportFilename("<script>%%\\x")).toBe("scriptx.html");
  });

  it("falls back to page.html for empty/unsafe slugs", () => {
    expect(exportFilename("")).toBe("page.html");
    expect(exportFilename("../..")).toBe("page.html");
    expect(exportFilename(" ")).toBe("page.html");
  });

  it("caps very long slugs", () => {
    expect(exportFilename("x".repeat(200))).toBe(`${"x".repeat(64)}.html`);
  });

  it("backslash slugs never yield separators (Windows traversal, E.88)", () => {
    // `[^A-Za-z0-9-_.@]` allowlist strips \ by construction — pin it:
    // Windows extractors treat \ as a path separator (zip-slip on unzip)
    const cases: Array<[string, string]> = [
      ["C:\\evil", "Cevil.html"],
      ["dir\\file", "dirfile.html"],
      ["..\\..\\windows\\system32", "windowssystem32.html"],
      ["mixed/slash\\both", "mixedslashboth.html"],
    ];
    for (const [slug, expected] of cases) {
      const name = exportFilename(slug);
      expect(name, slug).toBe(expected);
      expect(name, slug).not.toContain("\\");
      expect(name, slug).not.toContain("/");
    }
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

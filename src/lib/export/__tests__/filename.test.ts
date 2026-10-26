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
});

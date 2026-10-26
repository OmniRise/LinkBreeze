import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E.7 — accessibility contract for the export UI in PageSwitcher.
 *
 * The repo has no component render tests (no jsdom — UI is verified
 * live), so this pins the accessibility contract by reading the source:
 * the per-page control is an ICON-ONLY link whose only accessible name
 * is the aria-label, so dropping it would silently strand screen-reader
 * users; the batch control must keep a visible text label; and both must
 * stay plain anchors (a file download must not become a client-side
 * navigation via <Link>).
 */

const source = readFileSync(
  join(__dirname, "../../admin/PageSwitcher.tsx"),
  "utf8",
);

describe("export UI accessibility (PageSwitcher source contract)", () => {
  it("per-page export link carries an aria-label and a hover title", () => {
    const anchor = source.match(
      /<a\s+href=\{`\/api\/pages\/export\?id=\$\{page\.id\}`\}[\s\S]*?<\/a>/,
    );
    expect(anchor, "per-page export anchor not found").toBeTruthy();
    expect(anchor![0]).toContain('aria-label={t("exportHtml"');
    expect(anchor![0]).toContain('title={t("exportHtml"');
    // icon-only content must not be the sole name source
    expect(anchor![0]).toContain("<Download");
  });

  it("batch export link has a visible text label (not icon-only)", () => {
    const anchor = source.match(
      /<a\s+href="\/api\/pages\/export\?all=1"[\s\S]*?<\/a>/,
    );
    expect(anchor, "export-all anchor not found").toBeTruthy();
    expect(anchor![0]).toContain("{t(\"exportAll\")}");
    expect(anchor![0]).toContain("<Archive");
  });

  it("both export controls are plain anchors (download semantics)", () => {
    // Plain <a>: native download + UA focus outline, consistent with the
    // dropdown's other controls (star/delete/slug all rely on the UA ring).
    expect(source).toContain('href={`/api/pages/export?id=${page.id}`}');
    expect(source).toContain('href="/api/pages/export?all=1"');
    expect(source).not.toContain("<Link\n                href=\"/api/pages/export");
  });
});

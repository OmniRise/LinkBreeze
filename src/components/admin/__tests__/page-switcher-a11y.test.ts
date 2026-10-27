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

  it("download mechanics: server-driven, no target/download/ping attrs (E.72)", () => {
    // The real download mechanism is Content-Disposition: attachment from
    // the route (pinned in route.test.ts), NOT anchor attributes — document
    // the current state so a "helpful" target=_blank (blank-tab on a
    // misconfigured server) or ping= (tracking) addition fails review.
    const perPage = source.match(
      /<a\s+href=\{`\/api\/pages\/export\?id=\$\{page\.id\}`\}[\s\S]*?<\/a>/,
    );
    const batch = source.match(
      /<a\s+href="\/api\/pages\/export\?all=1"[\s\S]*?<\/a>/,
    );
    expect(perPage, "per-page anchor").toBeTruthy();
    expect(batch, "batch anchor").toBeTruthy();
    for (const [name, anchor] of [
      ["per-page", perPage![0]],
      ["batch", batch![0]],
    ] as const) {
      // no new-tab/popup semantics on an attachment endpoint
      expect(anchor, name).not.toMatch(/\starget=/);
      expect(anchor, name).not.toMatch(/\sping=/);
      // download attr deliberately ABSENT — server decides via
      // Content-Disposition (works for cross-origin mirrors too)
      expect(anchor, name).not.toMatch(/\sdownload=/);
      // both keep the eslint justification for the plain <a> (documented
      // in the JSX comment right above the batch anchor)
    }
    expect(source).toContain(
      "a plain anchor lets the browser handle\n                Content-Disposition natively",
    );
  });
});

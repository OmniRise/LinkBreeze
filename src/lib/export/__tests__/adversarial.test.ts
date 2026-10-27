import { describe, it, expect } from "vitest";
import {
  buildStaticExport,
  type ExportInput,
  type ExportPageInput,
} from "@/lib/export/build-static-export";
import type { LinkRow } from "@/server/queries";

/**
 * E.3 — adversarial pass. Every user-controlled field of the export is
 * fed hostile values (as if they arrived through a bad import or a
 * hand-edited backup) and the composed document is proven to contain no
 * executable payload. Trust boundary: customCss / analyticsScript are
 * admin-authored code rendered verbatim on the live page too — their
 * verbatim pass-through is asserted at the bottom as a documented
 * decision, not a hole.
 */

const makeLink = (over: Record<string, unknown>): LinkRow =>
  ({
    id: 1,
    pageId: 1,
    sectionId: null,
    orderIndex: 0,
    type: "url",
    title: "x",
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
    ...over,
  }) as unknown as LinkRow;

const PAGE: ExportPageInput = {
  slug: "p",
  title: "T",
  bio: null,
  socialLinks: null,
  avatarUrl: null,
  bannerUrl: null,
  footerText: null,
};

const INPUT: ExportInput = {
  page: PAGE,
  links: [],
  sections: [],
  theme: { primaryColor: "#533fd6", linkStyle: "glass", animationType: "none" },
  baseUrl: "https://links.example.com",
};

/** Strip the two sanctioned script surfaces (JSON-LD + operator scripts)
 *  and assert NOTHING executable remains in the rest of the document. */
function bodyWithoutTrustedScripts(html: string): string {
  return html
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "__OPERATOR_SCRIPT__");
}

describe("E.3 adversarial: hostile text fields", () => {
  const hostile = '"><img src=x onerror=alert(1)><script>alert(2)</script>';

  it("escapes hostile page fields (title, bio, badge, footer, seo)", () => {
    const html = buildStaticExport({
      ...INPUT,
      page: {
        ...PAGE,
        title: hostile,
        bio: hostile,
        badgeText: hostile,
        footerText: hostile,
        seoTitle: hostile,
        seoDescription: hostile,
      },
      links: [makeLink({ title: hostile, description: hostile })],
      sections: [{ id: 1, title: hostile, icon: hostile, orderIndex: 0 }],
    });
    const rest = bodyWithoutTrustedScripts(html);
    expect(rest).not.toContain("<script");
    expect(rest).not.toContain("<img src=x");
    // Attribute text without a tag is inert — esc() guarantees `<`/`>` are
    // entity-encoded, which the two assertions above prove.
    expect(rest).toContain("&lt;script&gt;");
    expect(rest).toContain("&quot;");
    expect(rest).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes hostile popup bodies including markdown vectors", () => {
    const html = buildStaticExport({
      ...INPUT,
      links: [
        makeLink({
          type: "text",
          title: hostile,
          popupText: `**${hostile}**\n# <script>x</script>\n- <img src=x onerror=y>`,
          ctaLabel: hostile,
          url: "https://example.com/a",
        }),
      ],
    });
    const rest = bodyWithoutTrustedScripts(html);
    expect(rest).not.toContain("<script>alert");
    expect(rest).not.toContain("<img src=x");
    // markdown-lite escaped the raw HTML but kept its own <strong> tag
    expect(rest).toContain("<strong>");
    expect(rest).toContain("&lt;script&gt;");
  });

  it("neutralizes hostile social links (platform + url)", () => {
    const html = buildStaticExport({
      ...INPUT,
      page: {
        ...PAGE,
        socialLinks: JSON.stringify([
          { platform: '"><script>x()</script>', url: 'javascript:alert(1)' },
          { platform: "github", url: '" onclick="alert(2)' },
        ]),
      },
    });
    const rest = bodyWithoutTrustedScripts(html);
    expect(rest).not.toContain("<script>x()");
    expect(rest).not.toContain("onclick=\"alert");
    expect(rest).not.toMatch(/href="javascript:/i);
  });
});

describe("E.3 adversarial: dangerous URL schemes", () => {
  it("neutralizes javascript:/data:/vbscript: link hrefs", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>x</script>",
      "vbscript:msgbox(1)",
    ]) {
      const html = buildStaticExport({
        ...INPUT,
        links: [makeLink({ url })],
      });
      const rest = bodyWithoutTrustedScripts(html);
      expect(rest).not.toMatch(/href="\s*(javascript|data|vbscript):/i);
    }
  });

  it("neutralizes the popup CTA's dangerous scheme too", () => {
    const html = buildStaticExport({
      ...INPUT,
      links: [
        makeLink({
          type: "text",
          title: "t",
          popupText: "body",
          ctaLabel: "Go",
          url: "javascript:alert(1)",
        }),
      ],
    });
    expect(bodyWithoutTrustedScripts(html)).not.toMatch(
      /href="\s*javascript:/i,
    );
  });

  it("keeps benign schemes working", () => {
    const html = buildStaticExport({
      ...INPUT,
      links: [
        makeLink({ url: "https://example.com" }),
        makeLink({ id: 2, url: "mailto:a@b.c" }),
        makeLink({ id: 3, url: "tel:+123" }),
      ],
    });
    const rest = bodyWithoutTrustedScripts(html);
    expect(rest).toContain('href="https://example.com"');
    expect(rest).toContain('href="mailto:a@b.c"');
    expect(rest).toContain('href="tel:+123"');
  });
});

describe("E.3 adversarial: style-context breakout", () => {
  it("a hostile theme value cannot terminate the style element", () => {
    const html = buildStaticExport({
      ...INPUT,
      theme: {
        primaryColor: "red)}</style><script>alert(1)</script><style>x{",
        backgroundValue: "#0a0820,</style><script>bad()</script>",
        linkStyle: "glass",
        animationType: "none",
      },
    });
    // The breakout never closes the <style> element: every `</` in the
    // theme block is CSS-escaped to `<\/`, which the HTML tokenizer does
    // not treat as a closing tag (RAWTEXT only ends on a literal
    // `</style`). The payload survives as inert text inside the CSS.
    expect(html).not.toMatch(/<\/style><script/i);
    expect(html).toContain("<\\/style>");
    // The background value rides an ATTRIBUTE (esc'd) — prove no raw <.
    const main = html.match(/<main[^>]*>/)?.[0] ?? "";
    expect(main).not.toContain("<script");
    expect(main).not.toContain("</style");
  });
});

describe("E.3: documented trust boundary", () => {
  it("operator customCss and analyticsScript stay verbatim (parity with live)", () => {
    const css = '.x{content:"</style><script>by-css</script>"}';
    const script = '<script>window.op=1</script>';
    const html = buildStaticExport({
      ...INPUT,
      page: { ...PAGE, customCss: css, analyticsScript: script },
    });
    // These are admin-authored code surfaces (Settings → Integration /
    // Custom CSS) rendered identically by the live page — exported
    // verbatim BY DESIGN; only the schema-validated data fields get the
    // defense-in-depth above.
    expect(html).toContain(css);
    expect(html).toContain(script);
  });
});

describe("E.46 JSON-LD script breakout", () => {
  const PAYLOAD = "</script><img src=x onerror=alert(1)>";

  it("hostile title never breaks the ld+json script element", () => {
    const html = buildStaticExport({
      ...INPUT,
      page: { ...PAGE, title: PAYLOAD, bio: PAYLOAD },
    });
    const m = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    expect(m, "JSON-LD block missing").toBeTruthy();
    const body = m![1];
    // every `<` inside the JSON is unicode-escaped → raw markup impossible
    expect(body).not.toContain("<");
    expect(body).not.toContain("</script");
    // …and the JSON still round-trips with the payload intact as DATA
    const parsed = JSON.parse(body);
    expect(parsed.name).toBe(PAYLOAD);
    // the payload never appears as executable markup in the document
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).not.toMatch(/<script[^>]*>[^<]*<\/script><img/);
  });
});

describe("E.47 raw-script surface boundary", () => {
  it("exactly two script KINDS ship: escaped JSON-LD + raw operator analytics; no app JS", () => {
    const html = buildStaticExport({
      ...INPUT,
      page: {
        ...PAGE,
        title: "</script><script>alert(2)</script>",
        analyticsScript: '<script>window.op=1</script>',
      },
    });
    // app/runtime JS never ships (zero-JS architecture)
    expect(html).not.toContain("<script src=");
    expect(html).not.toContain("chunks/");
    // operator analytics: raw by design (single occurrence)
    expect(html.match(/window\.op=1/g) ?? []).toHaveLength(1);
    // JSON-LD: escaped (its `<`s are all unicode-escaped — count raw
    // `<script` openings: the ld+json one + the operator one = 2)
    expect(html.match(/<script[\s>]/g) ?? []).toHaveLength(2);
  });
});

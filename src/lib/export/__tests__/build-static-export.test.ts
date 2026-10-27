import { describe, it, expect } from "vitest";
import {
  buildStaticExport,
  type ExportInput,
  type ExportPageInput,
} from "@/lib/export/build-static-export";
import type { LinkRow } from "@/server/queries";
import { EXPORT_CSS } from "@/lib/export/export-css";

// Fixture helpers — LinkRow is a full drizzle row; the builder reads a
// handful of fields, so partials get cast once here.
const makeLink = (over: Record<string, unknown>): LinkRow =>
  ({
    id: 1,
    pageId: 1,
    sectionId: null,
    orderIndex: 0,
    type: "url",
    title: "My Site",
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

const basePage: ExportPageInput = {
  slug: "jane",
  title: "Jane Doe",
  bio: "Designer & maker",
  seoTitle: "Jane - links",
  seoDescription: "All my links",
  badgeText: null,
  socialLinks: JSON.stringify([
    { platform: "github", url: "https://github.com/jane" },
  ]),
  avatarUrl: "/api/uploads/avatar-1.png",
  bannerUrl: null,
  footerText: "© Jane",
  customCss: null,
  analyticsScript: null,
};

const baseInput: ExportInput = {
  page: basePage,
  links: [
    makeLink({ id: 1, title: "Portfolio", url: "https://janedoe.design" }),
    makeLink({ id: 2, title: "Email me", url: "mailto:jane@example.com" }),
  ],
  sections: [],
  theme: {
    primaryColor: "#533fd6",
    textColor: "#eceafe",
    linkStyle: "glass",
    animationType: "lift",
    backgroundType: "gradient",
    backgroundValue: "#0a0820,#1a1040",
  },
  baseUrl: "https://links.example.com",
};

describe("buildStaticExport", () => {
  it("emits a complete standalone document with theme tokens inlined", () => {
    const html = buildStaticExport(baseInput);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<title>Jane - links</title>");
    expect(html).toContain('content="All my links"');
    // Theme CSS custom properties are inlined so the look survives offline.
    expect(html).toContain("--lb-accent: #533fd6;");
    expect(html).toContain("--lb-text: #eceafe;");
    // Curated .lb-* CSS subset rides along.
    expect(html).toContain(".lb-link-card:hover");
    expect(html).toContain("@keyframes aurora-rise");
    // JSON-LD structured data, same shape as the live page.
    expect(html).toContain('application/ld+json');
  });

  it("rewrites card hrefs to direct destinations (no /go/, no beacons)", () => {
    const html = buildStaticExport(baseInput);
    expect(html).toContain('href="https://janedoe.design"');
    expect(html).not.toContain("/go/");
    expect(html).not.toContain("sendBeacon");
    expect(html).not.toContain("/api/track");
    // mailto links keep working too.
    expect(html).toContain('href="mailto:jane@example.com"');
    // External links still open safely in a new tab.
    expect(html).toContain('target="_blank" rel="noopener noreferrer nofollow"');
  });

  it("absolutizes media URLs against the export origin", () => {
    const html = buildStaticExport(baseInput);
    expect(html).toContain('src="https://links.example.com/api/uploads/avatar-1.png"');
  });

  it("renders profile header, socials and footer text", () => {
    const html = buildStaticExport(baseInput);
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Designer &amp; maker");
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain("© Jane");
    // Excluded server-dependent surfaces never render.
    expect(html).not.toContain("Privacy");
    expect(html).not.toContain("email-capture");
  });

  it("exports an empty page as valid minimal HTML", () => {
    const html = buildStaticExport({
      ...baseInput,
      page: { ...basePage, socialLinks: null, avatarUrl: null, footerText: null },
      links: [],
      sections: [],
    });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("No links yet.");
    expect(html).toContain("</html>");
    expect(html).not.toContain("<img");
  });

  it("renders section headers between grouped links", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        makeLink({ id: 1, sectionId: 7 }),
        makeLink({ id: 2, sectionId: null }),
      ],
      sections: [{ id: 7, title: "Work", icon: "💼", orderIndex: 0 }],
    });
    expect(html).toContain("Work");
    expect(html).toContain("💼");
  });

  it("renders dividers via the shared divider builder", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [makeLink({ id: 9, type: "divider", title: "Break" })],
    });
    expect(html).toContain('role="separator"');
  });

  it("escapes hostile titles/descriptions (no script leak)", () => {
    const html = buildStaticExport({
      ...baseInput,
      page: {
        ...basePage,
        title: '<script>alert("x")</script>',
        bio: '"><img src=x onerror=alert(1)>',
      },
      links: [
        makeLink({
          id: 1,
          title: '<script>alert(1)</script>',
          description: '"><script>bad()</script>',
        }),
      ],
    });
    // No raw script tag from user text (only the sanctioned JSON-LD block
    // and nothing else uses <script>).
    expect(html).not.toContain('<script>alert');
    expect(html).toContain("&lt;script&gt;");
  });

  it("skip-link target resolves: #lb-main href pairs with id (E.240)", () => {
    const html = buildStaticExport(baseInput);
    const hrefs = [...html.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
    // the skip link's fragment must have a matching id= element
    expect(hrefs).toContain("#lb-main");
    expect(html.match(/href="#lb-main"/g)).toHaveLength(1);
    expect(html.match(/id="lb-main"/g)).toHaveLength(1);
    // generic rule: EVERY internal fragment href resolves to an id
    for (const frag of hrefs) {
      expect(
        html.includes(`id="${frag.slice(1)}"`),
        `unresolved anchor: ${frag}`,
      ).toBe(true);
    }
  });

  it("sections render in GIVEN order, not alphabetical (E.243)", () => {
    // Zebra first in fixture, Alpha second — an alphabetical sort or a
    // reverse would flip them; the builder must pass orderIndex order
    const html = buildStaticExport({
      ...baseInput,
      sections: [
        { id: 81, title: "Zebra Section", icon: "🦓", orderIndex: 0 },
        { id: 82, title: "Alpha Section", icon: "🅰️", orderIndex: 1 },
      ],
      // headers render per section GROUP (groupLinksBySection) — empty
      // sections produce no group, so each needs a link to show
      links: [
        makeLink({ id: 101, sectionId: 81, title: "InZebra" }),
        makeLink({ id: 102, sectionId: 82, title: "InAlpha" }),
      ],
    });
    const z = html.indexOf("Zebra Section");
    const a = html.indexOf("Alpha Section");
    expect(z).toBeGreaterThan(-1);
    expect(a).toBeGreaterThan(-1);
    expect(z).toBeLessThan(a); // given order preserved
  });

  it("keeps operator-provided analytics + custom CSS verbatim", () => {
    const html = buildStaticExport({
      ...baseInput,
      page: {
        ...basePage,
        analyticsScript:
          '<script async src="https://plausible.io/js/script.js"></script>',
        customCss: ".custom-thing { color: red; }",
      },
    });
    expect(html).toContain('src="https://plausible.io/js/script.js"');
    expect(html).toContain(".custom-thing { color: red; }");
  });

  it("analyticsScript placement: verbatim, exactly once, top-of-body (E.232)", () => {
    const script =
      '<script async src="https://plausible.io/js/script.js"></script>';
    const html = buildStaticExport({
      ...baseInput,
      page: { ...basePage, analyticsScript: script },
    });
    // verbatim inside its wrapping div, EXACTLY one occurrence
    expect(html).toContain(`<div>${script}</div>`);
    expect(html.split(script).length - 1).toBe(1);
    // placement: inside <body>, BEFORE the styles/skip-link/heading
    // (top-of-body, build-static-export.ts:520 — first body child)
    const bodyIdx = html.indexOf("<body");
    const scriptIdx = html.indexOf(script);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(scriptIdx).toBeGreaterThan(bodyIdx);
    expect(scriptIdx).toBeLessThan(html.indexOf("Skip to content"));
    // (head's own <style> legitimately precedes <body> — the ordering
    // vs the skip-link already pins top-of-body: body → script →
    // theme style chain → skip link)
    // absent case: no wrapper div leaks
    const noScript = buildStaticExport({
      ...baseInput,
      page: { ...basePage, analyticsScript: null },
    });
    expect(noScript).not.toContain("plausible.io");
  });

  it("renders popup dialogs for text/location links", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        makeLink({
          id: 5,
          type: "text",
          title: "About me",
          popupText: "Hello **world**",
          ctaLabel: "More",
          url: "https://example.com/about",
        }),
      ],
    });
    expect(html).toContain('<dialog id="lb-popup-5"');
    expect(html).toContain("showModal()");
    // CTA rides the direct URL too.
    expect(html).toContain('href="https://example.com/about"');
    expect(html).not.toContain("/go/");
  });

  it("falls back to a plain link card for embeds (iframes don't travel)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        makeLink({
          id: 6,
          type: "embed",
          title: "My video",
          url: "https://www.youtube.com/watch?v=abc123",
        }),
      ],
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc123"');
  });

  it("rewrites uploads to the flat asset base in embed mode (E.2)", () => {
    const html = buildStaticExport({
      ...baseInput,
      assetBase: "uploads",
    });
    expect(html).toContain('src="uploads/avatar-1.png"');
    expect(html).not.toContain("links.example.com");
    expect(html).not.toContain("/api/uploads/");
  });
});

describe("popup mechanics in exports (E.27)", () => {
  const popupInput: ExportInput = {
    ...baseInput,
    links: [
      makeLink({
        id: 4,
        type: "text",
        title: "About me",
        popupText: "Hello there",
        ctaLabel: "Go",
        url: "https://example.com/about",
      }),
    ],
  };

  it("opens without external JS: inline onclick calls showModal()", () => {
    const html = buildStaticExport(popupInput);
    // trigger button (shared builder) carries the self-contained handler
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("aria-controls=\"lb-popup-4\"");
    expect(html).toMatch(/onclick="[^"]*getElementById\('lb-popup-4'\)/);
    expect(html).toMatch(/onclick="[^"]*showModal\(\)/);
  });

  it("closes without external JS: backdrop + × inline handlers ship", () => {
    const html = buildStaticExport(popupInput);
    expect(html).toMatch(/<dialog id="lb-popup-4"[^>]*onclick="[^"]*close\('x'\)/);
    expect(html).toMatch(/class="lb-popup-close"[^>]*onclick="[^"]*close\('x'\)/);
  });

  it("strips every beacon (click + popup-open) while the handler still works", () => {
    const html = buildStaticExport(popupInput);
    // applyDirectUrls removes ALL sendBeacon calls — click and open — so a
    // static host sees zero /api/track requests (no dead-end noise).
    expect(html).not.toContain("sendBeacon");
    expect(html).not.toContain("/api/track");
    // the popup handler survives beacon removal and still opens the dialog
    expect(html).toMatch(/onclick="[^"]*getElementById\('lb-popup-4'\)/);
    expect(html).toContain("d.showModal()");
  });

  it("popup CTA still points at the direct destination", () => {
    const html = buildStaticExport(popupInput);
    expect(html).toContain('href="https://example.com/about"');
  });
});

describe("export determinism (E.32)", () => {
  it("identical input yields byte-identical html", () => {
    const a = buildStaticExport(baseInput);
    const b = buildStaticExport(baseInput);
    expect(a).toBe(b);
  });

  it("no timestamps or random tokens leak into the document", () => {
    const html = buildStaticExport(baseInput);
    // fixed generator tag, no dates/uuids/random ids
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(html.match(/Generated by LinkBreeze/g) ?? []).toHaveLength(1);
  });

  it("rebuilding through the zip path is byte-identical", async () => {
    const { createZip } = await import("@/lib/export/zip");
    const entries = [
      { name: "a.html", content: buildStaticExport(baseInput) },
      { name: "b.html", content: buildStaticExport(baseInput) },
    ];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });
});

describe("corrupt socialLinks resilience (E.43)", () => {
  const badValues = [
    "{{{ not json", // parse failure (pre-existing catch)
    "42", // parses to a number → .length/.map would crash
    '"just a string"',
    "null",
    "[null]",
    '[1, 2, true]',
    '[[{"platform":"github"}]]',
  ];

  it.each(badValues)("builds without crashing: %s", (socialLinks) => {
    const html = buildStaticExport({
      ...baseInput,
      page: { ...baseInput.page, socialLinks },
    });
    expect(html).toContain("<!DOCTYPE html>");
    // degraded to no social icons, no leaked garbage
    expect(html).not.toContain('class="lb-social-icon"');
    expect(html).not.toContain("undefined</a>");
  });

  it("keeps well-formed entries when mixed with junk", () => {
    const html = buildStaticExport({
      ...baseInput,
      page: {
        ...baseInput.page,
        socialLinks: '[null, {"platform":"github","url":"https://gh.example/u"}, 7]',
      },
    });
    expect(html).toContain('href="https://gh.example/u"');
    expect(html).toContain('class="lb-social-icon"');
  });
});

describe("title/SEO fallback chain (E.67)", () => {
  const basePage = {
    slug: "p",
    title: "Plain Title",
    bio: "Plain bio",
    socialLinks: null,
    avatarUrl: null,
    bannerUrl: null,
    footerText: null,
  };

  it("seoTitle wins for <title>, then title, then LinkBreeze", () => {
    const withSeo = buildStaticExport({
      ...baseInput,
      page: { ...basePage, seoTitle: "SEO Wins" },
    });
    expect(withSeo).toContain("<title>SEO Wins</title>");

    const noSeo = buildStaticExport({ ...baseInput, page: basePage });
    expect(noSeo).toContain("<title>Plain Title</title>");

    const nothing = buildStaticExport({
      ...baseInput,
      page: { ...basePage, title: "" },
    });
    expect(nothing).toContain("<title>LinkBreeze</title>");
  });

  it("meta description: seoDescription > bio > My links", () => {
    const withSeo = buildStaticExport({
      ...baseInput,
      page: { ...basePage, seoDescription: "SEO desc" },
    });
    expect(withSeo).toContain('<meta name="description" content="SEO desc">');

    const bioOnly = buildStaticExport({ ...baseInput, page: basePage });
    expect(bioOnly).toContain('<meta name="description" content="Plain bio">');

    const neither = buildStaticExport({
      ...baseInput,
      page: { ...basePage, bio: null },
    });
    expect(neither).toContain('<meta name="description" content="My links">');
  });

  it("JSON-LD entity uses RAW title/bio (SEO copy is for the tab/snippet only)", () => {
    const html = buildStaticExport({
      ...baseInput,
      page: { ...basePage, seoTitle: "Tab Copy", seoDescription: "Snippet" },
    });
    const m = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    const parsed = JSON.parse(m![1]);
    expect(parsed.name).toBe("Plain Title");
    expect(parsed.description).toBe("Plain bio");
  });
});

describe("E.115 EXPORT_CSS selector prefix discipline", () => {
  it("only resets/tokens/keyframes/shared-skin families may be non-.lb-", () => {
    const css = EXPORT_CSS;
    // capture every selector opener: text between } (or start) and {
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}]+)\{/g)].map((m) =>
      m[1].trim(),
    );
    expect(selectors.length).toBeGreaterThan(40); // non-vacuous

    // Legitimate forms: reset elements + universal (normalize-style),
    // :root tokens, keyframe steps (single or comma groups), at-rules,
    // any .lb- namespaced selector (incl. main.lb-* skin scopes), and
    // the .aurora-* family — a VERBATIM globals.css port shared with the
    // live page (renaming it only here would break parity, E.69 precedent).
    const ALLOWED_ELEMENTS = new Set([
      "html",
      "body",
      "img,svg,video",
      "button",
      "a",
      "*,*::before,*::after",
      ":root",
    ]);
    const offenders: string[] = [];
    for (const sel of selectors) {
      if (ALLOWED_ELEMENTS.has(sel)) continue;
      if (sel.startsWith("@")) continue;
      if (sel.split(",").every((p) => /^(\d+%|from|to)$/.test(p.trim())))
        continue;
      if (/(^|[,\s])\.lb-/.test(sel) || sel.includes("main.lb-")) continue;
      if (sel.startsWith(".aurora-")) continue;
      offenders.push(sel);
    }
    expect(offenders, "selectors outside the documented families").toEqual([]);
    // and .lb- discipline carries the bulk of the weight
    expect(selectors.filter((s) => s.includes(".lb-")).length).toBeGreaterThanOrEqual(
      100,
    );
  });
});

describe("section emoji icon rendering (E.139)", () => {
  it("emoji icon renders once, un-double-escaped, beside the title", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [makeLink({ id: 1, title: "In section", sectionId: 7 })],
      sections: [{ id: 7, title: "Writing", icon: "📝", orderIndex: 0 }],
    });
    // emoji passes through esc() untouched (esc handles & < > " only)
    expect(html).toContain("📝");
    expect(html).not.toContain("&#x1F4DD;"); // no hex-entity mangling
    expect((html.match(/📝/g) ?? []).length).toBe(1); // exactly once
    expect(html).toContain("Writing");
  });
});

describe("highlighted-in-section + multibyte charset (E.141/E.142)", () => {
  const sectionLink = (over: Record<string, unknown>) =>
    ({
      id: 1,
      pageId: 1,
      sectionId: 7,
      orderIndex: 0,
      type: "url",
      title: "Section card",
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

  it("highlighted card in a section carries the featured padding (E.141)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [sectionLink({ id: 1, isHighlighted: true })],
      sections: [{ id: 7, title: "Sec", icon: null, orderIndex: 0 }],
    });
    // featured padding on the card tag (build-link-card.ts:219-222)
    expect(html).toContain(
      "padding-top:calc(var(--lb-btn-padding-y) + 6px);padding-bottom:calc(var(--lb-btn-padding-y) + 6px)",
    );
    // same page's card is inside the section wrapper
    expect(html).toContain("lb-section-header");

    const plain = buildStaticExport({
      ...baseInput,
      links: [sectionLink({ id: 1, isHighlighted: false })],
      sections: [{ id: 7, title: "Sec", icon: null, orderIndex: 0 }],
    });
    expect(plain).not.toContain("padding-top:calc(var(--lb-btn-padding-y) + 6px)");
  });

  it("multibyte title (CJK+Cyrillic+emoji) survives byte-exact with utf-8 meta (E.142)", () => {
    const SOUP = "日本語 Привет 🌍 café";
    const html = buildStaticExport({
      ...baseInput,
      page: { ...baseInput.page, title: SOUP },
    });
    // utf-8 declared, content byte-exact through a real buffer round-trip
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(SOUP);
    const round = Buffer.from(html, "utf-8").toString("utf-8");
    expect(round).toBe(html);
    expect(round).toContain(SOUP);
  });
});

describe("popup CTA + divider in sections (E.144/E.145)", () => {
  const mkLink = (over: Record<string, unknown>) =>
    ({
      id: 1,
      pageId: 1,
      sectionId: 7,
      orderIndex: 0,
      type: "url",
      title: "Card",
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

  it("popup CTA renders its label with a DIRECT href (E.144)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        mkLink({
          id: 9,
          type: "text",
          popupText: "Body",
          ctaLabel: "Read <more>",
          url: "https://dest.example/deep",
        }),
      ],
    });
    // CTA anchor inside the dialog: class + escaped label + direct href
    expect(html).toContain('class="lb-popup-cta');
    expect(html).toContain("Read &lt;more&gt;"); // escaped label
    expect(html).toContain('href="https://dest.example/deep"'); // direct
    expect(html).not.toContain("/go/9"); // beacon path rewritten
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("divider in a section: separator role + themed vars (E.145)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        mkLink({ id: 1, title: "Before" }),
        mkLink({ id: 2, type: "divider", title: "Mid rule" }),
        mkLink({ id: 3, title: "After" }),
      ],
      sections: [{ id: 7, title: "Grouped", icon: null, orderIndex: 0 }],
    });
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="Mid rule"');
    // themed divider vars consumed (width/thickness/image from tokens)
    expect(html).toContain("width:var(--lb-divider-width)");
    expect(html).toContain("height:var(--lb-divider-thickness)");
    expect(html).toContain("background:var(--lb-divider-image)");
    // no <hr> (design: div separator, build-divider.ts:8)
    expect(html).not.toContain("<hr");
  });
});

describe("embed downgrade fidelity + empty socials array (E.147/E.148)", () => {
  const mkLink = (over: Record<string, unknown>) =>
    ({
      id: 1,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Widget",
      description: null,
      url: "https://www.youtube.com/watch?v=abc123",
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

  it("embed widget downgrades to a full card: title, direct href, icon (E.147)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [mkLink({ id: 5, type: "embed", title: "My Video" })],
    });
    // no iframe/provider chrome
    expect(html).not.toContain("<iframe");
    // the card keeps every piece of identity
    expect(html).toContain("My Video");
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc123"');
    // icon slot still renders (letter fallback from title initial)
    expect(html).toContain(">M<");
    // card element intact
    expect(html).toContain('class="lb-link-card"');
    // embeds are NOT popup-capable types → no dialog shipped
    expect(html).not.toContain("<dialog");
  });

  it("empty socials array behaves exactly like null (E.148)", () => {
    const emptyArr = buildStaticExport(
      baseInput.page
        ? {
            ...baseInput,
            page: { ...baseInput.page, socialLinks: "[]" },
          }
        : baseInput,
    );
    const nulled = buildStaticExport(
      baseInput.page
        ? { ...baseInput, page: { ...baseInput.page, socialLinks: null } }
        : baseInput,
    );
    expect(emptyArr).toBe(nulled);
    expect(emptyArr).not.toContain('aria-label="Social links"');
    expect(emptyArr).not.toContain('class="lb-social-icon"');
  });
});

describe("section-header rule geometry (E.69)", () => {
  const headerFor = (alignment: "center" | "left" | "right") =>
    buildStaticExport({
      ...baseInput,
      links: [
        {
          id: 20,
          pageId: 1,
          sectionId: 3,
          orderIndex: 0,
          type: "url",
          title: "Grouped",
          description: null,
          url: "https://example.com/g",
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
        } as unknown as LinkRow,
      ],
      sections: [{ id: 3, title: "Zone", icon: null, orderIndex: 0 }],
      theme: { animationType: "none", alignment },
    });

  function headerRegion(html: string): string {
    const i = html.indexOf("Zone");
    expect(i, "section label not found").toBeGreaterThanOrEqual(0);
    // the header band spans the label ± 800 chars
    return html.slice(Math.max(0, i - 800), i + 800);
  }

  it("centered themes get BOTH mirrored rules (to left + to right)", () => {
    const region = headerRegion(headerFor("center"));
    expect((region.match(/height:1px/g) ?? []).length).toBe(2);
    expect(region).toContain("linear-gradient(to right");
    expect(region).toContain("linear-gradient(to left");
  });

  it("side-aligned themes get exactly ONE rule, stretched away from the label", () => {
    for (const alignment of ["left", "right"] as const) {
      const region = headerRegion(headerFor(alignment));
      expect(region.match(/height:1px/g) ?? [], alignment).toHaveLength(1);
      // complete markup: rule div opened and closed within the region
      const rules = region.match(/<div[^>]*height:1px[^>]*><\/div>/g) ?? [];
      expect(rules, alignment).toHaveLength(1);
    }
  });
});

describe("section heading edges (E.57)", () => {
  const link = (id: number, sectionId: number | null) =>
    ({
      id,
      pageId: 1,
      sectionId,
      orderIndex: id,
      type: "url",
      title: `Link ${id}`,
      description: null,
      url: `https://example.com/${id}`,
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
    }) as unknown as LinkRow;

  it("empty-titled section WITH links keeps the heading band (live parity)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [link(10, 7)],
      sections: [{ id: 7, title: "", icon: null, orderIndex: 0 }],
    });
    // SectionHeader (shared live component) renders {title} unguarded —
    // parity means the export does the same; no orphan-logic divergence.
    expect(html).toContain("<h2");
    expect(html).toContain(">Link 10</");
  });

  it("link-less section never emits a heading (shared groupLinksBySection drops it)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [link(11, null)],
      sections: [{ id: 8, title: "Orphan Section", icon: null, orderIndex: 0 }],
    });
    expect(html).not.toContain("Orphan Section");
    expect(html).not.toContain("<h2");
  });
});

describe("cardStyle variants (E.124)", () => {
  const cardLink = (over: Record<string, unknown>) =>
    ({
      id: 1,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Rich Card",
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

  it("cardStyle 'rich' + imageUrl → full-bleed image card; no image → compact fallthrough", () => {
    const rich = buildStaticExport({
      ...baseInput,
      links: [
        cardLink({ id: 1, cardStyle: "rich", imageUrl: "/api/uploads/rc.png" }),
      ],
    });
    const noImg = buildStaticExport({
      ...baseInput,
      links: [cardLink({ id: 3, title: "RichNoImg", cardStyle: "rich" })],
    });

    // rich WITH image: full-bleed image block renders (hasImage path)
    expect(rich).toContain("rc.png");
    // distinct card body: the image card carries a media block the
    // compact card does not
    expect(rich).not.toEqual(noImg);

    // rich WITHOUT image: documented fallthrough to standard compact
    // (build-link-card.ts:316-318) — same card shape as a plain link
    const cardBody = (html: string) =>
      (html.match(/<a[^>]*class="lb-link-card[^"]*"[^>]*/g) ?? []).join("");
    const noImgTag = cardBody(noImg);
    expect(noImgTag).toContain("var(--lb-card-radius)");
    expect(noImgTag).not.toContain("var(--lb-media-radius)");
    // rich WITH image uses the media radius (full-bleed branch)
    expect(cardBody(rich)).toContain("var(--lb-media-radius)");
  });
});

describe("icon fallback chain edges (E.108/E.109)", () => {
  const link = (over: Record<string, unknown>) =>
    ({
      id: 1,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Zebra",
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

  it("iconMode 'custom' with null URL falls back to letter, never empty src (E.108)", () => {
    const html = buildStaticExport({
      ...baseInput,
      links: [
        link({ iconMode: "custom", customIconUrl: null, autoIcon: false }),
      ],
    });
    // guard at build-link-card.ts:75 requires the URL — null falls
    // through to the first-letter avatar
    expect(html).not.toContain('src=""');
    expect(html).not.toContain("src=''");
    // letter fallback rendered from the title initial
    expect(html).toMatch(
      /<span aria-hidden="true"[^>]*font-size:11px[^>]*>Z<\/span>/,
    );
  });

  it("builder ignores schedule fields entirely (single-sourced filtering, E.109)", () => {
    // The route's getActiveLinks applies the schedule window at query
    // level; the builder has NO schedule logic — a row that reaches it
    // renders regardless of its window values (never re-filters).
    const expired = buildStaticExport({
      ...baseInput,
      links: [
        link({
          scheduleStart: "2000-01-01 00:00:00",
          scheduleEnd: "2000-01-02 00:00:00",
        }),
      ],
    });
    const future = buildStaticExport({
      ...baseInput,
      links: [
        link({
          scheduleStart: "2099-01-01 00:00:00",
          scheduleEnd: "2099-01-02 00:00:00",
        }),
      ],
    });
    // identical output: the window itself never influences rendering
    expect(expired).toContain(">Zebra<");
    expect(future).toContain(">Zebra<");
    expect(expired).not.toContain("2000-01-01");
    expect(future).not.toContain("2099-01-01");
    // (in production the row would never arrive: query filters first)
  });
});

describe("input-order preservation (E.49)", () => {
  const link = (id: number, title: string, orderIndex: number): LinkRow =>
    ({
      id,
      pageId: 1,
      sectionId: null,
      orderIndex,
      type: "url",
      title,
      description: null,
      url: `https://example.com/${id}`,
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
    }) as unknown as LinkRow;

  it("renders links in ARRAY order — never re-sorts by orderIndex", () => {
    // deliberately adversarial: orderIndex says 5,1,3 but array says A,B,C
    const links = [link(1, "Alpha", 5), link(2, "Bravo", 1), link(3, "Cobra", 3)];
    const html = buildStaticExport({ ...baseInput, links });
    const pos = (t: string) => html.indexOf(`>${t}</`);
    expect(pos("Alpha")).toBeLessThan(pos("Bravo"));
    expect(pos("Bravo")).toBeLessThan(pos("Cobra"));
    // so byte-identity holds only for identical ARRAYS (the DB supplies
    // ORDER BY order_index, id — queries pinned in route/E.24 tests)
    const again = buildStaticExport({ ...baseInput, links });
    expect(again).toBe(html);
  });

  it("tied orderIndex values never wobble between runs", () => {
    const links = [link(1, "TieOne", 0), link(2, "TieTwo", 0), link(3, "TieThree", 0)];
    const runs = Array.from({ length: 3 }, () =>
      buildStaticExport({ ...baseInput, links }),
    );
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
  });
});

describe("data-URI asset passthrough (E.36)", () => {
  const uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==AAAA";
  const withDataAvatar: ExportInput = {
    ...baseInput,
    page: { ...baseInput.page, avatarUrl: uri },
  };

  it("plain export keeps the data: avatar byte-verbatim", () => {
    const html = buildStaticExport(withDataAvatar);
    expect(html).toContain(`src="${uri}"`);
    expect(html).not.toContain("data:image/png;base64,http");
    expect(html).not.toContain(`https://links.example.com/data:`);
  });

  it("embed export keeps the data: avatar and collects nothing for it", async () => {
    const html = buildStaticExport({ ...withDataAvatar, assetBase: "uploads" });
    expect(html).toContain(`src="${uri}"`);
    expect(html).not.toContain("uploads/data:image");
    const { collectUploadNames } = await import("@/lib/export/url-rewrite");
    expect(collectUploadNames(html, "uploads")).toEqual([]);
  });
});

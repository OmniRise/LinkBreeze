/**
 * SVG icon sanitizer + magic-byte sniffing tests (#91).
 */
import { describe, it, expect } from "vitest";
import {
  sniffIconFormat,
  sanitizeSvgIcon,
  ICON_UPLOAD_MAX_BYTES,
} from "@/lib/link-icons";

// ─── sniffIconFormat ────────────────────────────────────────────────

describe("sniffIconFormat", () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1b, 0x0a, 0, 0, 0, 0]);
  const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const gifHeader = Buffer.from("GIF89a\x00\x00\x00\x00\x00\x00", "latin1");
  const webpHeader = Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP", "latin1"),
    Buffer.from("VP8 ", "latin1"),
  ]);
  const icoHeader = Buffer.from([0x00, 0x00, 0x01, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
  const svgText = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>`);
  const xmlSvg = Buffer.from(
    `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>`,
  );

  it("detects PNG by magic bytes", () => {
    expect(sniffIconFormat(pngHeader)).toBe("png");
  });
  it("detects JPEG by magic bytes", () => {
    expect(sniffIconFormat(jpgHeader)).toBe("jpg");
  });
  it("detects GIF by magic bytes", () => {
    expect(sniffIconFormat(gifHeader)).toBe("gif");
  });
  it("detects WebP by magic bytes", () => {
    expect(sniffIconFormat(webpHeader)).toBe("webp");
  });
  it("detects ICO by magic bytes", () => {
    expect(sniffIconFormat(icoHeader)).toBe("ico");
  });
  it("detects SVG (<svg prefix)", () => {
    expect(sniffIconFormat(svgText)).toBe("svg");
  });
  it("detects SVG (<?xml prefix)", () => {
    expect(sniffIconFormat(xmlSvg)).toBe("svg");
  });
  it("rejects unknown binary junk", () => {
    expect(sniffIconFormat(Buffer.from("MZdummyfile!!", "latin1"))).toBeNull();
  });
  it("rejects short buffers", () => {
    expect(sniffIconFormat(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

// ─── sanitizeSvgIcon ────────────────────────────────────────────────

describe("sanitizeSvgIcon", () => {
  const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>`;

  it("keeps a clean SVG intact (attributes preserved)", () => {
    const out = sanitizeSvgIcon(clean);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain("<path");
  });

  it("strips <script> elements entirely", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M5 12h14"/></svg>`;
    const out = sanitizeSvgIcon(evil);
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<path");
  });

  it("strips inline onload handlers", () => {
    const evil = `<svg xmlns="http://swiper/2000/svg" onload="alert(1)"><path d="M5 12h14"/></svg>`;
    const out = sanitizeSvgIcon(evil);
    expect(out).not.toContain("onload");
    expect(out).toContain("<path");
  });

  it("strips external href on <use>", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x#y"/></svg>`;
    const out = sanitizeSvgIcon(evil);
    expect(out).not.toContain("evil.example");
  });

  it("allows fragment-only href on <use>", () => {
    const ok = `<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="p" d="M5 12h14"/></defs><use href="#p"/></svg>`;
    const out = sanitizeSvgIcon(ok);
    expect(out).toContain('href="#p"');
  });

  it("rejects doctype declarations", () => {
    const evil = `<!DOCTYPE svg [<!ENTITY xxe "test">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>`;
    expect(sanitizeSvgIcon(evil)).toBeNull();
  });

  it("rejects CDATA sections", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14"/><![CDATA[ <!-- hack --> ]]></svg>`;
    expect(sanitizeSvgIcon(evil)).toBeNull();
  });

  it("drops style attributes containing url()", () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://evil.example/steal)" d="M5 12h14"/></svg>`;
    const out = sanitizeSvgIcon(evil);
    expect(out).not.toContain("evil.example");
    expect(out).toContain("<path");
  });

  it("returns null when no svg root survives", () => {
    expect(sanitizeSvgIcon("<div>not an svg</div>")).toBeNull();
  });

  it("returns null for oversized input", () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg">${"x".repeat(ICON_UPLOAD_MAX_BYTES)}</svg>`;
    expect(sanitizeSvgIcon(big)).toBeNull();
  });
});

// ─── buildIcon resolution in the public renderer ────────────────────

describe("buildLinkCardHtml icon modes (#91)", () => {
  it("renders a picked lucide icon inline", async () => {
    const { buildLinkCardHtml } = await import("@/components/public/build-link-card");
    const base = {
      id: 1,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Lucide link",
      description: null,
      url: "https://example.com",
      icon: "rocket",
      iconUrl: null,
      customIconUrl: null,
      iconMode: "lucide",
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
      abConfig: null,
      redirectSlug: null,
      createdAt: "2026-01-01 00:00:00",
    } as const;
    const html = buildLinkCardHtml({ link: base, theme: {} as never, index: 0 });
    // Hand-serialized SVG: stroke path data inline, no <img>, no network.
    expect(html).toContain("<svg");
    expect(html).toMatch(/M12 15v5/); // rocket path data
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toContain("<img");
  });

  it("renders an uploaded icon image for custom mode", async () => {
    const { buildLinkCardHtml } = await import("@/components/public/build-link-card");
    const link = {
      id: 2,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Custom link",
      description: null,
      icon: null,
      url: "https://example.com",
      iconUrl: null,
      customIconUrl: "/api/uploads/icon-abc123.png",
      iconMode: "custom",
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
      abConfig: null,
      redirectSlug: null,
      createdAt: "2026-01-01 00:00:00",
    };
    const html = buildLinkCardHtml({ link, theme: {} as never, index: 0 });
    expect(html).toContain("/api/uploads/icon-abc123.png");
  });

  it("falls back to favicon when mode is auto", async () => {
    const { buildLinkCardHtml } = await import("@/components/public/build-link-card");
    const link = {
      id: 3,
      pageId: 1,
      sectionId: null,
      orderIndex: 0,
      type: "url",
      title: "Auto link",
      description: null,
      icon: null,
      url: "https://example.com",
      iconUrl: "/api/uploads/favicon-old.png",
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
      abConfig: null,
      redirectSlug: null,
      createdAt: "2026-01-01 00:00:00",
    };
    const html = buildLinkCardHtml({ link, theme: {} as never, index: 0 });
    expect(html).toContain("/api/uploads/favicon-old.png");
  });
});

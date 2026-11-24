/**
 * Embed modal tile + dialog builder: structure, lazy loading, output
 * encoding, and the click-to-open contract. Pure string checks.
 */
import { describe, it, expect } from "vitest";

import { buildEmbedModalHtml } from "@/components/public/build-embed-modal";
import { resolveEmbedFrame } from "@/lib/embed-providers";

const tiktok =
  resolveEmbedFrame("https://www.tiktok.com/@c/video/7301234567890123456")!;
const calcom = resolveEmbedFrame("https://cal.com/jane-doe/30min")!;
const form =
  resolveEmbedFrame("https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviForm/viewform")!;

describe("buildEmbedModalHtml", () => {
  it("renders a preview tile button and a hidden dialog with a lazy iframe", () => {
    const html = buildEmbedModalHtml(tiktok, "My TikTok", 42);
    expect(html).toContain('id="lb-embed-42"');
    expect(html).toContain('aria-haspopup="dialog"');
    // Lazy: the iframe carries data-src, never a live src.
    expect(html).toContain(`data-src="${tiktok.src}"`);
    expect(html).not.toContain("<iframe src=");
    expect(html).toContain("d.showModal()");
    expect(html).toContain("showModal()");
  });

  it("opens with the open beacon carrying the link id", () => {
    const html = buildEmbedModalHtml(tiktok, "T", 42);
    expect(html).toContain(`{type:'open',linkId:42}`);
  });

  it("escapes the title into attributes and text (output encoding)", () => {
    const html = buildEmbedModalHtml(calcom, `Jane's "Book" <me>`, 7);
    // esc() leaves apostrophes literal (legal inside double-quoted attrs),
    // encodes double quotes, angle brackets and ampersands.
    expect(html).toContain("Jane's &quot;Book&quot; &lt;me&gt;");
    expect(html).not.toContain('<me>');
    // The raw double-quote must never break out of the double-quoted attr.
    expect(html).not.toContain('aria-label="Cal.com booking: Jane\'s "');
  });

  it("dialog is hidden until open (native dialog semantics)", () => {
    const html = buildEmbedModalHtml(tiktok, "T", 42);
    expect(html).toContain("<dialog");
    expect(html).toContain("lb-popup-dialog");
    expect(html).toContain('type="button" class="lb-popup-close"');
    expect(html).toContain("this.closest('dialog').close('x')");
    expect(html).toContain("if(t===this)this.close('x')");
  });

  it("portrait providers get a 9/16 dialog frame; tall documents a capped panel", () => {
    const tiktokHtml = buildEmbedModalHtml(tiktok, "T", 1);
    expect(tiktokHtml).toContain("aspect-ratio:9/16");
    expect(tiktokHtml).toContain("height:min(80vh,640px)");

    const calHtml = buildEmbedModalHtml(calcom, "C", 2);
    expect(calHtml).toContain("width:min(92vw,720px)");
    expect(calHtml).toContain("height:min(80vh,900px)");
  });

  it("renders the provider label and lucide icon svg", () => {
    const html = buildEmbedModalHtml(form, "Feedback form", 3);
    expect(html).toContain("Google Form");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
  });

  it("embed src survives into the iframe data-src unmodified (validated upstream)", () => {
    const html = buildEmbedModalHtml(form, "F", 4);
    expect(html).toContain(
      `data-src="https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviForm/viewform?embedded=true"`,
    );
  });
});

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
    const { tile, dialog } = buildEmbedModalHtml(tiktok, "My TikTok", 42);
    expect(tile).toContain('aria-haspopup="dialog"');
    expect(tile).toContain('aria-controls="lb-embed-42"');
    // Lazy: the iframe carries data-src, never a live src.
    expect(dialog).toContain('id="lb-embed-42"');
    expect(dialog).toContain(`data-src="${tiktok.src}"`);
    expect(dialog).not.toContain("<iframe src=");
    expect(tile).toContain("d.showModal()");
    expect(tile).toContain("showModal()");
  });

  it("opens with the open beacon carrying the link id", () => {
    const { tile } = buildEmbedModalHtml(tiktok, "T", 42);
    expect(tile).toContain(`{type:'open',linkId:42}`);
  });

  it("escapes the title into attributes and text (output encoding)", () => {
    const { tile, dialog } = buildEmbedModalHtml(calcom, `Jane's "Book" <me>`, 7);
    // esc() leaves apostrophes literal (legal inside double-quoted attrs),
    // encodes double quotes, angle brackets and ampersands.
    expect(tile).toContain("Jane's &quot;Book&quot; &lt;me&gt;");
    expect(dialog).toContain("&quot;Book&quot;");
    expect(dialog).not.toContain("<me>");
    expect(dialog).toContain("&lt;me&gt;");
    // The raw double-quote must never break out of the double-quoted attr.
    expect(tile).not.toContain('aria-label="Cal.com booking: Jane\'s "');
  });

  it("dialog is hidden until open (native dialog semantics)", () => {
    const { dialog } = buildEmbedModalHtml(tiktok, "T", 42);
    expect(dialog).toContain("<dialog");
    expect(dialog).toContain("lb-popup-dialog");
    expect(dialog).toContain('type="button" class="lb-popup-close"');
    expect(dialog).toContain("this.closest('dialog').close('x')");
    expect(dialog).toContain("if(t===this)this.close('x')");
  });

  it("portrait providers get a 9/16 dialog frame; tall documents a capped panel", () => {
    const { dialog: tiktokDialog } = buildEmbedModalHtml(tiktok, "T", 1);
    expect(tiktokDialog).toContain("aspect-ratio:9/16");
    expect(tiktokDialog).toContain("height:min(80vh,640px)");
    expect(tiktokDialog).toContain("width:auto");

    const { dialog: calDialog } = buildEmbedModalHtml(calcom, "C", 2);
    // The dialog carries the size; the iframe fills the padded body.
    expect(calDialog).toContain("width:min(92vw,720px);height:min(80vh,860px)");
    expect(calDialog).toContain("width:100%;height:100%");
  });

  it("renders the provider label and lucide icon svg", () => {
    const { tile } = buildEmbedModalHtml(form, "Feedback form", 3);
    expect(tile).toContain("Google Form");
    expect(tile).toContain("<svg");
    expect(tile).toContain('aria-hidden="true"');
  });

  it("embed src survives into the iframe data-src unmodified (validated upstream)", () => {
    const { dialog } = buildEmbedModalHtml(form, "F", 4);
    expect(dialog).toContain(
      `data-src="https://docs.google.com/forms/d/e/1FAIpQLSf9D3AhX0QviForm/viewform?embedded=true"`,
    );
  });
});

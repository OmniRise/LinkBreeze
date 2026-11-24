import type { EmbedFrame } from "@/lib/embed-providers";
import { lucideIconSvg } from "@/components/public/build-link-card";
import { POPUP_BACKDROP_CLOSE, POPUP_CLOSE } from "@/components/public/build-popup-card";

/**
 * Embed modal tiles (#13 follow-up — click-to-open embeds).
 *
 * For modal-mode providers (TikTok 9:16 portrait, Cal.com bookings, Google
 * Forms, Tally — tall interactive documents) the public page renders a
 * themed preview tile; tapping opens a native <dialog> whose iframe src is
 * attached lazily, so no third-party contact happens until the visitor asks
 * for it — the same click-to-load contract as the #93 location popups.
 *
 * Zero client JS preserved: one inline onclick per tile (showModal + lazy
 * src attach + open beacon) and the shared backdrop/close handlers from the
 * popup-card module. The dialog reuses the .lb-popup-dialog/.lb-popup-panel
 * classes verbatim, so every theme (glass/gel/pixel + tokens) reaches it
 * without per-provider styling.
 */

/** Escape attribute/HTML text for safe inline-HTML injection (output encoding). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline onclick for the preview tile: beacon, lazy-attach, open. */
function openHandler(dialogId: string, linkId: number): string {
  const parts = [
    `var d=document.getElementById('${dialogId}')`,
    "if(!d)return false",
    // Every open beacons — same semantics as the #93 popups and link clicks.
    `navigator.sendBeacon('/api/track',JSON.stringify({type:'open',linkId:${linkId}}))`,
    "var f=d.querySelector('iframe[data-src]')",
    "if(f&&!f.src)f.src=f.getAttribute('data-src')",
    "d.showModal()",
    "return false",
  ];
  return esc(parts.join(";"));
}

/**
 * Iframe sizing inside the dialog:
 * - portrait (TikTok 9:16): height capped to the viewport, width follows
 *   the ratio — never taller than 85vh, never wider than the screen.
 * - tall documents (Forms/Tally/Cal.com): fixed 85vh scrollable panel.
 */
function frameStyle(embed: EmbedFrame): string {
  if (embed.aspect === "9 / 16") {
    return "height:min(80vh,640px);aspect-ratio:9/16;width:auto;max-width:100%;border:0;display:block;margin:0 auto";
  }
  return "width:min(92vw,720px);height:min(80vh,900px);border:0;display:block";
}

/**
 * Build the preview tile + hidden <dialog> for a modal-mode embed.
 * Rendered inside EmbedWidget's themed frame (glass/gel/pixel wrapper),
 * which continues to own the outer card look — this module owns only the
 * tile and the dialog. `dialogId` must be unique per link (lb-embed-<id>).
 */
export function buildEmbedModalHtml(
  embed: EmbedFrame,
  title: string,
  linkId: number,
): string {
  const dialogId = `lb-embed-${linkId}`;
  const icon = embed.icon ? lucideIconSvg(embed.icon, 22) : null;
  const label = embed.label ?? "Open";
  const skinStyle =
    embed.aspect === "9 / 16" ? "width:auto" : "width:min(92vw,720px)";

  return `<button type="button" class="lb-embed-open" onclick="${openHandler(dialogId, linkId)}" aria-haspopup="dialog" aria-label="${esc(label)}: ${esc(title)}">
  <span class="lb-embed-open-icon">${icon ?? "&#9654;"}</span>
  <span class="lb-embed-open-text">
    <span class="lb-embed-open-title">${esc(title)}</span>
    <span class="lb-embed-open-label">${esc(label)} &#8250;</span>
  </span>
</button>
<dialog id="${dialogId}" class="lb-popup-dialog lb-embed-dialog" style="${skinStyle}" onclick="${POPUP_BACKDROP_CLOSE}">
  <div class="lb-popup-panel">
    <button type="button" class="lb-popup-close" onclick="${POPUP_CLOSE}" aria-label="Close">&#215;</button>
    <div class="lb-embed-dialog-body">
      <iframe
        data-src="${esc(embed.src)}"
        title="${esc(title)}"
        class="lb-embed-frame"
        style="${frameStyle(embed)}"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
  </div>
</dialog>`;
}

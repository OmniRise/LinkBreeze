import type { LinkRow } from "@/server/queries";
import { revealAnimation, type ThemeInput } from "@/lib/theme-tokens";
import { resolveIcon } from "@/lib/icon-registry";
import {
  isPopupType,
  popupOpenHandler,
  buildPopupDialogHtml,
  DEFAULT_POPUP_ICON,
} from "@/components/public/build-popup-card";

export type LinkCardTheme = ThemeInput;

/**
 * Render a picked lucide icon as an inline SVG string (#91) — no
 * react-dom/server (forbidden in client bundles) and no DOM. lucide's
 * forwardRef render function is pure: calling it directly yields the
 * element tree's props, including the raw icon node ([tag, attrs][]),
 * which we serialize to plain SVG markup ourselves. Works identically
 * on the server (public page) and in a client bundle (theme preview).
 * The node lives at props.iconNode (≤1.44) or props.icon.node (≥1.45).
 */
const LUCIDE_SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Serialize one iconNode attribute bag to an attribute string. */
function svgAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .filter(([k]) => k !== "key") // react bookkeeping, not SVG
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(" ");
}

function lucideIconSvg(name: string, size = 20): string | null {
  const Component = resolveIcon(name);
  if (!Component) return null;
  // forwardRef.render(props, ref) → element whose props carry the raw icon
  // node. lucide-react ≤1.44: props.iconNode. ≥1.45: props.icon.node.
  type RenderedIcon = {
    props: {
      iconNode?: Array<[string, Record<string, string>]>;
      icon?: { node?: Array<[string, Record<string, string>]> };
    };
  };
  const el = (Component as unknown as { render: (p: Record<string, unknown>, ref: null) => RenderedIcon }).render(
    { size },
    null,
  );
  const node = el.props.iconNode ?? el.props.icon?.node;
  if (!node) return null;
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${svgAttrs(attrs)}></${tag}>`)
    .join("");
  return `<svg ${LUCIDE_SVG_ATTRS} width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}

const ICON_SLOT_STYLE =
  "width:20px;height:20px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center";

/**
 * Build the icon element shown before the title.
 * Priority (#91): uploaded icon → picked lucide icon → cached favicon →
 * first-letter avatar. Uploaded/lucide choices override auto behavior.
 * Only shown for cards WITHOUT a thumbnail (thumbnail cards use the
 * full-bleed image at the top instead).
 */
function buildIcon(link: LinkRow): string {
  // Operator-chosen lucide icon — inherits theme text color via currentColor.
  if (link.iconMode === "lucide" && link.icon) {
    const svg = lucideIconSvg(link.icon);
    if (svg) {
      return `<span aria-hidden="true" style="${ICON_SLOT_STYLE};color:var(--lb-text)">${svg}</span>`;
    }
  }

  // Operator-uploaded icon image — same-origin, from the uploads volume.
  if (link.iconMode === "custom" && link.customIconUrl) {
    return `<img src="${esc(link.customIconUrl)}" alt="" loading="lazy" style="width:20px;height:20px;border-radius:4px;flex-shrink:0;object-fit:cover" />`;
  }

  // Cached favicon from fetchAndCacheFavicon — always preferred when present.
  if (link.iconUrl) {
    return `<img src="${esc(link.iconUrl)}" alt="" loading="lazy" style="width:20px;height:20px;border-radius:4px;flex-shrink:0;object-fit:cover" />`;
  }

  // #93 popup cards: themed default lucide icon (align-left / map-pin)
  // instead of the letter avatar — a better floor, still overridable.
  if (isPopupType(link.type)) {
    const svg = lucideIconSvg(DEFAULT_POPUP_ICON[link.type] ?? "align-left");
    if (svg) {
      return `<span aria-hidden="true" style="${ICON_SLOT_STYLE};color:var(--lb-text)">${svg}</span>`;
    }
  }

  // First-letter fallback using the title's initial.
  const letter = (link.title || "?").trim().charAt(0).toUpperCase();
  return `<span aria-hidden="true" style="${ICON_SLOT_STYLE};font-size:11px;font-weight:700;background:var(--lb-accent);color:var(--lb-btn-text, #fff)">${esc(letter)}</span>`;
}

/** Escape attribute/HTML text for safe inline-HTML injection (output encoding). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Resolve a link's URL attributes for the <a> tag.
 *
 * For http(s) links: use /go/:id redirect as the href — records the click
 * server-side and works without JS (crawlers, in-app browsers, JS-disabled).
 * For other link types (mailto, tel, etc.): keep the direct href and fire
 * sendBeacon for best-effort tracking.
 */
function resolveLinkUrl(link: LinkRow, pageSlug?: string | null): {
  href: string;
  targetAttr: string;
  onclickAttr: string;
} {
  // Native vCard links always point at the page's own /api/vcard/<slug>
  // route (Content-Disposition: attachment downloads without navigating).
  if (link.type === "vcard" && pageSlug) {
    return {
      href: `/api/vcard/${esc(pageSlug)}`,
      targetAttr: "",
      onclickAttr: "",
    };
  }

  const rawUrl = link.url;
  const isExternal =
    rawUrl.startsWith("http://") || rawUrl.startsWith("https://");

  // #96: prefer the custom redirect slug — stable across delete-and-recreate.
  const href = isExternal ? `/go/${link.redirectSlug || link.id}` : esc(rawUrl);
  const targetAttr = isExternal
    ? ` target="_blank" rel="noopener noreferrer nofollow"`
    : "";
  const clickHandler = isExternal
    ? ""
    : `navigator.sendBeacon('/api/track', JSON.stringify({type:'click',linkId:${link.id}}))`;
  const onclickAttr = clickHandler ? `\n  onclick="${clickHandler}"` : "";

  return { href, targetAttr, onclickAttr };
}

/**
 * Build the content row: icon, title, description, highlight dot, and arrow.
 * Shared between cards with and without a thumbnail image.
 * Popup cards (#93) swap the ↗ navigation arrow for a › chevron — the card
 * opens a dialog, it doesn't navigate, and the glyph shouldn't promise that.
 */
function buildContentRow(link: LinkRow): string {
  const icon = buildIcon(link);
  const featured = link.isHighlighted;

  // Featured links get a "Featured" badge instead of the small dot.
  // Text sits on the card background, so color-mix guarantees AA contrast
  // (4.5:1+) against it even when the raw accent alone would fall short.
  const featuredBadge = featured
    ? `<span aria-hidden="true" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:color-mix(in srgb, var(--lb-accent) 80%, white 20%);margin-bottom:4px">&#9733; Featured</span>`
    : "";

  const description = link.description
    ? `<p style="font-size:var(--lb-font-size);color:var(--lb-text-muted);margin:2px 0 0">${esc(link.description)}</p>`
    : "";

  const title = esc(link.title);
  // Featured links: bolder title + slightly larger font
  const fontWeight = featured
    ? "calc(var(--lb-font-weight) + 100)"
    : "var(--lb-font-weight)";
  const fontSize = featured
    ? "calc(var(--lb-font-size) + 3px)"
    : "calc(var(--lb-font-size) + 1px)";

  return `<span style="display:flex;flex-direction:column;flex:1;min-width:0">
      ${featuredBadge}
      <span style="display:flex;align-items:center;font-weight:${fontWeight};font-size:${fontSize};letter-spacing:var(--lb-letter-spacing)">${title}</span>
      ${description}
    </span>
    ${icon}
    <span aria-hidden="true" style="margin-left:10px;opacity:.6;font-size:18px;color:var(--lb-accent)">${isPopupType(link.type) ? "&#8250;" : "&#8599;"}</span>`;
}

/**
 * Pure builder for a public link card's HTML (zero client JS).
 * All user-controlled fields (title, description, url) pass through esc()
 * before injection; the click beacon is fired from an inline onclick.
 *
 * Styling now consumes CSS custom properties (--lb-*) set by theme-tokens.
 * No hardcoded colors, radii, or shadows.
 */
export function buildLinkCardHtml(options: {
  link: LinkRow;
  theme: LinkCardTheme;
  index: number;
  staggerMs?: number;
  /** Extra delay added to index*staggerMs (e.g. section header position). */
  baseDelayMs?: number;
  /** Page slug — resolves native vCard links to /api/vcard/<slug>. */
  pageSlug?: string | null;
}): string {
  const { link, theme, index, staggerMs = 60, baseDelayMs = 0, pageSlug } = options;

  const linkStyle = theme.linkStyle || "glass";
  const hoverEffect = theme.hoverEffect || theme.animationType || "lift";

  // Neon style: glowing border
  const isNeon = linkStyle === "neon";
  const isGlass = linkStyle === "glass";
  const isPixel = linkStyle === "pixel";
  // Gel (Frutiger Aero): glossy pill — most visuals live in globals.css
  // under main.lb-gel-mode; the builder only opts the card into blur.
  const isGel = linkStyle === "gel";

  // Featured links: accent-tinted background + thicker accent border
  const featured = link.isHighlighted;
  const border = featured
    ? `calc(var(--lb-border-width) + 1px) solid var(--lb-accent)`
    : isNeon
      ? `var(--lb-border-width) solid var(--lb-accent)`
      : `var(--lb-border-width) solid var(--lb-card-border)`;

  // Featured links get a subtle accent-tinted background overlay
  const cardBg = featured
    ? `color-mix(in srgb, var(--lb-accent) 12%, var(--lb-card-bg))`
    : `var(--lb-card-bg)`;

  // Featured links: extra vertical padding for a taller card
  const featuredPadding = featured
    ? `padding-top:calc(var(--lb-btn-padding-y) + 6px);padding-bottom:calc(var(--lb-btn-padding-y) + 6px);`
    : ``;

  const reveal =
    theme.animationType === "none"
      ? ""
      : revealAnimation(theme.animationType, baseDelayMs + index * staggerMs);

  const { href, targetAttr, onclickAttr } = resolveLinkUrl(link, pageSlug);

  // CSS-based hover effects (class + data attributes) — replaces inline
  // onmouseover/onmouseout so prefers-reduced-motion can gate them.
  const hoverAttrs = ` class="lb-link-card" data-hover="${hoverEffect}"${isNeon ? ` data-neon="true"` : ""}${isPixel ? ` data-pixel="true"` : ""}`;

  const imageUrl = link.imageUrl ?? "";
  const hasImage = !!imageUrl;

  // Thumbnail rendered as a full-bleed image at the top of the card.
  // alt text uses the link title so screen readers and search engines
  // get meaningful context (not an empty string). The card's
  // overflow:hidden clips it to the card's border-radius.
  const image = hasImage
    ? `<img src="${esc(imageUrl)}" alt="${esc(link.title)}" loading="lazy" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover" />`
    : "";

  // Thumbnail cards need overflow:hidden so the image clips to the card radius.
  const overflow = hasImage ? `overflow:hidden;` : "";

  // Backdrop blur for glass / neon / gel styles
  const backdropBlur =
    isGlass || isNeon || isGel
      ? `backdrop-filter:blur(var(--lb-blur));-webkit-backdrop-filter:blur(var(--lb-blur));`
      : "";

  // Pixel style: stepped clip-path corners (the ReactBits 8-bit signature look)
  // For pixel cards: wrap in a div that acts as the orange border layer.
  // The inner <a> is inset 3px with its own clip-path, creating a stepped
  // orange border without expensive GPU filters.
  const pixelClip = isPixel
    ? `clip-path:polygon(8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px),0 8px,4px 8px,4px 4px);`
    : "";

  // Layout differs: cards with thumbnail use block layout (image on top,
  // content row below). Cards without thumbnail use flex directly on the <a>.
  const display = hasImage
    ? "display:block"
    : "display:flex;align-items:center";
  const paddingStyle = hasImage
    ? ""
    : "padding:var(--lb-btn-padding-y) var(--lb-btn-padding-x);";

  const contentRow = buildContentRow(link);
  const innerContent = hasImage
    ? `${image}\n  <div style="display:flex;align-items:center;padding:var(--lb-btn-padding-y) var(--lb-btn-padding-x)">\n    ${contentRow}\n  </div>`
    : contentRow;

  // #93 popup cards: the card is a <button> that opens the dialog instead
  // of an <a> that navigates. Same classes/data-attrs so skins and hovers
  // apply identically; the dialog markup is appended after the card.
  // Note: buttons don't inherit fonts from ancestors, but `font:inherit`
  // (a shorthand) would reset the font-family set in ${style} — restore
  // everything EXCEPT family with longhands so --lb-card-font survives.
  const isPopup = isPopupType(link.type);
  const dialogHtml = isPopup ? buildPopupDialogHtml(link, theme) : "";
  const cardOpen = (style: string): string =>
    isPopup
      ? `<button type="button"${hoverAttrs} aria-haspopup="dialog" aria-controls="lb-popup-${link.id}" onclick="${popupOpenHandler(link)}" style="${style};cursor:pointer;font-style:inherit;font-variant:inherit;font-weight:inherit;font-stretch:inherit;font-size:inherit;line-height:inherit;text-align:left">`
      : `<a\n  href="${href}"${targetAttr}${onclickAttr}${hoverAttrs}\n  style="${style}">`;
  const cardClose = isPopup ? "</button>" : "</a>";

  if (isPixel) {
    // Pixel cards: wrap the card in a div that serves as the orange border layer.
    // The div has the accent background + outer clip-path.
    // The card is positioned inside with inset:3px + inner clip-path.
    return `<div class="lb-pixel-card-wrap" style="position:relative;margin:0 0 var(--lb-spacing);${pixelClip}">
  <div style="position:absolute;inset:0;background:var(--lb-accent);${pixelClip};z-index:0"></div>
  ${cardOpen(`
      ${display};text-decoration:none;width:calc(100% - 6px);box-sizing:border-box;
      ${paddingStyle}${featuredPadding}
      position:relative;z-index:1;
      background:${cardBg};border:none;border-radius:0;
      color:var(--lb-text);font-family:var(--lb-card-font,inherit);
      transition:transform .15s ease,box-shadow .15s ease;
      margin:3px;
      clip-path:polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px);
      box-shadow:4px 4px 0 var(--lb-accent);
      ${reveal}
    `)}
    ${innerContent}
  ${cardClose}
</div>
${dialogHtml}`;
  }

  // Rich preview cards (cardStyle="rich") with an image use the same
  // full-bleed image rendering as thumbnail cards — the existing hasImage
  // path below handles it. Rich cards without an image fall through to the
  // standard compact card path. No special-casing needed.

  return `${cardOpen(`
    ${display};text-decoration:none;width:100%;box-sizing:border-box;
    ${paddingStyle}${featuredPadding}margin:0 0 var(--lb-spacing);
    background:${cardBg};border:${border};border-radius:${hasImage ? "var(--lb-media-radius)" : "var(--lb-card-radius)"};
    color:var(--lb-text);font-family:var(--lb-card-font,inherit);
    transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
    ${backdropBlur}${overflow}${reveal}
  `)}
  ${innerContent}
${cardClose}
${dialogHtml}`;
}

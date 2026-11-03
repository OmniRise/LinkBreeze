import type { LinkRow } from "@/server/queries";
import { buildLinkCardHtml, type LinkCardTheme } from "@/components/public/build-link-card";

interface LinkCardProps {
  link: LinkRow;
  index: number;
  theme: LinkCardTheme;
  /** Extra entrance delay (ms) — used to continue the stagger across sections. */
  baseDelayMs?: number;
  /** Page slug — resolves native vCard links to /api/vcard/<slug>. */
  pageSlug?: string | null;
}

/**
 * Pure Server Component — zero client JavaScript.
 *
 * The anchor is emitted as a raw HTML string via dangerouslySetInnerHTML so
 * that the inline `onclick` (using navigator.sendBeacon) survives into the
 * static HTML untouched. This keeps the public page 100% client-JS-free while
 * still tracking outbound clicks.
 */
export function LinkCard({ link, index, theme, baseDelayMs = 0, pageSlug }: LinkCardProps) {
  const html = buildLinkCardHtml({ link, theme, index, baseDelayMs, pageSlug });

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

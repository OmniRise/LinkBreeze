/**
 * Direct-URL post-transform for static exports (#80).
 *
 * The shared card builders point http(s) links at the origin's `/go/:ref`
 * redirect (click tracking) and fire `navigator.sendBeacon('/api/track', …)`
 * for everything else. Neither endpoint resolves when the page is exported
 * and hosted elsewhere, so the export:
 *   1. rewrites every `href="/go/<ref>"` to the link's direct destination,
 *   2. strips every sendBeacon call (click + popup-open beacons).
 *
 * The rewrite operates on the COMPOSED html and matches the exact
 * attribute the builders emit (`href="/go/<ref>"`, fully quoted), so
 * `/go/1` can never clobber `/go/12` and mailto/tel hrefs are untouched.
 *
 * This lives in the export module (not the shared builders) on purpose:
 * the builders' live-page behavior must stay byte-identical, and the two
 * #80 worktrees must not conflict on shared files.
 */

import type { LinkRow } from "@/server/queries";

/** Escape attribute/HTML text for safe inline-HTML injection (output encoding). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * One nesting level of parens covers `sendBeacon('…', JSON.stringify({…}))`
 * — the only call shape the builders emit.
 */
const BEACON_RE = /navigator\.sendBeacon\((?:[^()]|\([^()]*\))*\)/g;

export function applyDirectUrls(
  html: string,
  links: Array<Pick<LinkRow, "id" | "url" | "redirectSlug">>,
): string {
  let out = html.replace(BEACON_RE, "");
  // Cards whose ONLY handler was the beacon end up with an empty (or
  // whitespace-only — the builder formats the attr across lines) onclick.
  out = out.replace(/ onclick="\s*"/g, "");
  for (const link of links) {
    const ref = link.redirectSlug || String(link.id);
    out = out
      .split(`href="/go/${ref}"`)
      .join(`href="${esc(link.url)}"`);
  }
  return out;
}

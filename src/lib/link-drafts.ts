"use client";

/**
 * Add/Edit-link draft persistence (#Rene follow-up).
 *
 * Keeps half-typed link-dialog entries alive across close/reopen of the
 * sheet within a browser session. Storage contract (user-decided):
 * `sessionStorage` — the browser clears it on tab close automatically and
 * logout clears it explicitly (see the sign-out forms), so a draft never
 * outlives "the session" in either sense. Per-tab by design: a second tab
 * does not see the first tab's draft.
 *
 * Known limitation: uploaded icon FILES cannot persist (File objects are not
 * serializable) — only the stored custom-icon URL round-trips.
 *
 * Pure client module: guards `sessionStorage` access so SSR import is safe,
 * and never throws on quota/privacy-mode failures — a lost draft is an
 * acceptable degradation, never an error surface.
 */

export const LINK_DRAFT_PREFIX = "lb-link-draft:";

export interface LinkDraft {
  v: 1;
  type: string;
  highlighted: boolean;
  active: boolean;
  scheduled: boolean;
  iconMode: string;
  lucidePick: string;
  customIconUrl: string;
  cardStyle: string;
  advancedOpen: boolean;
  titleValue: string;
  urlValue: string;
  descValue: string;
  imageValue: string;
  showUTM: boolean;
  popupText: string;
  ctaLabel: string;
  sectionValue: string;
  slug: string;
  vcardMode: string;
  vcardOrg: string;
  vcardJob: string;
  vcardEmail: string;
  vcardPhone: string;
  vcardAddress: string;
}

/** Draft key: one per dialog target — create (per page) or edit (per link). */
export function linkDraftKey(pageId?: number, editingId?: number): string {
  return editingId
    ? `${LINK_DRAFT_PREFIX}edit:${editingId}`
    : `${LINK_DRAFT_PREFIX}new:${pageId ?? 0}`;
}

export function loadLinkDraft(
  pageId?: number,
  editingId?: number,
): Partial<LinkDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(linkDraftKey(pageId, editingId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { v?: unknown }).v === 1
    ) {
      return parsed as Partial<LinkDraft>;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLinkDraft(
  pageId: number | undefined,
  editingId: number | undefined,
  draft: LinkDraft,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(linkDraftKey(pageId, editingId), JSON.stringify(draft));
  } catch {
    // Quota / privacy mode: drop the draft silently.
  }
}

export function clearLinkDraft(pageId?: number, editingId?: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(linkDraftKey(pageId, editingId));
  } catch {
    // Ignore — same degradation as save.
  }
}

/** Sign-out hook: remove every draft this tab is holding. */
export function clearAllLinkDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(LINK_DRAFT_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** True when a draft carries any real content (drives save-vs-clear). */
export function linkDraftHasContent(d: {
  titleValue?: string;
  urlValue?: string;
  descValue?: string;
  imageValue?: string;
  popupText?: string;
  ctaLabel?: string;
  slug?: string;
  vcardMode?: string;
  vcardOrg?: string;
  vcardJob?: string;
  vcardEmail?: string;
  vcardPhone?: string;
  vcardAddress?: string;
}): boolean {
  return !!(
    d.titleValue?.trim() ||
    d.urlValue?.trim() ||
    d.descValue?.trim() ||
    d.imageValue?.trim() ||
    d.popupText?.trim() ||
    d.ctaLabel?.trim() ||
    d.slug?.trim() ||
    // Custom vCard: the mode choice itself is content (a "custom" pick with
    // blank fields still produces a different downloaded card).
    d.vcardMode === "custom" ||
    d.vcardOrg?.trim() ||
    d.vcardJob?.trim() ||
    d.vcardEmail?.trim() ||
    d.vcardPhone?.trim() ||
    d.vcardAddress?.trim()
  );
}

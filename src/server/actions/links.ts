"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import { buildMapsUrl, isMapsShortLink } from "@/lib/link-url";
import { linkSchema } from "@/lib/validation/link";
import { LOCALE_COOKIE } from "@/i18n/config";
import { fetchAndCacheFavicon, extractDomain } from "@/lib/favicon";
import { saveIconUpload, isLucideName, type IconMode } from "@/lib/link-icons";
import { fetchOgData } from "@/lib/og-fetcher";
import {
  createLink as createLinkQuery,
  updateLink as updateLinkQuery,
  deleteLink as deleteLinkQuery,
  getAllLinks,
  reorderLinks as reorderLinksQuery,
  isSlugTaken,
} from "@/server/queries";
import {
  normalizeSlug,
  slugError,
  SLUG_ERRORS,
} from "@/lib/link-slug";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  notFoundError,
  ErrorCode,
  logError,
} from "@/lib/errors";

async function requireAuth(): Promise<boolean> {
  const session = await getSession();
  return !!session;
}

/**
 * Resolve the icon fields for a link save (#91).
 *
 * auto   → favicon fetch (existing behavior, unchanged)
 * lucide → validate the picked name, store it in links.icon
 * custom → persist the uploaded file, store its URL
 *
 * Returns null on validation failure so callers can return a typed error
 * without duplicating messages.
 */
async function resolveIconFields(
  formData: FormData,
  d: { iconMode: IconMode; icon?: string | null; type: string; url: string; autoIcon: boolean },
): Promise<
  | {
      ok: true;
      icon: string | null;
      iconUrl: string | null;
      customIconUrl: string | null;
      iconMode: IconMode;
    }
  | { ok: false; error: string }
> {
  // #87 dividers have no icon — force auto (which is a no-op for them since
  // the favicon fetch below is type-gated to "url" links anyway).
  if (d.type === "divider") {
    return { ok: true, icon: null, iconUrl: null, customIconUrl: null, iconMode: "auto" };
  }
  if (d.iconMode === "lucide") {
    const name = (d.icon ?? "").trim();
    if (!isLucideName(name)) return { ok: false, error: "Unknown icon selected" };
    return { ok: true, icon: name, iconUrl: null, customIconUrl: null, iconMode: "lucide" };
  }

  if (d.iconMode === "custom") {
    const file = formData.get("iconFile");
    if (file instanceof File && file.size > 0) {
      const saved = await saveIconUpload(file);
      if (!saved.ok) {
        return {
          ok: false,
          error:
            saved.error === "too-large"
              ? "Icon exceeds 512 KB"
              : saved.error === "bad-svg"
                ? "Icon SVG could not be sanitized"
                : "Unsupported icon format",
        };
      }
      return { ok: true, icon: null, iconUrl: null, customIconUrl: saved.url, iconMode: "custom" };
    }
    // No new file: keep any existing custom icon (edit dialog sends the
    // current URL back via iconCustomUrl).
    const existing = String(formData.get("iconCustomUrl") || "");
    if (existing.startsWith("/api/uploads/") && !existing.includes("..")) {
      return { ok: true, icon: null, iconUrl: null, customIconUrl: existing, iconMode: "custom" };
    }
    return { ok: false, error: "Upload an icon image or pick another mode" };
  }

  // auto (default): existing favicon behavior, unchanged.
  let iconUrl: string | null = null;
  if (d.autoIcon && d.type === "url" && extractDomain(d.url)) {
    iconUrl = await fetchAndCacheFavicon(d.url);
  }
  return { ok: true, icon: null, iconUrl, customIconUrl: null, iconMode: "auto" };
}

/**
 * #93 popup cards: normalize per-type fields before insert/update.
 * - location: raw place input → canonical Google Maps URL (pasted maps
 *   links pass through unchanged).
 * - text: URL is only the CTA target — empty means "no CTA button".
 * - ctaLabel: blank on location cards bakes the admin-locale default
 *   ("Ouvrir dans Google Maps"…) at save time, so the public page stays
 *   pure data with no locale lookup at render.
 * Returns the values to spread into the row write.
 */

/**
 * Follow a Google Maps short link (maps.app.goo.gl & friends) to its final
 * Maps URL at save time, so the stored URL — and with it the embedded map,
 * which short links can't serve — always points at a real maps page.
 * Bounded: 4s timeout, redirects followed, HTML never read. Failures keep
 * the short link (the /go/:id redirect still works; only the embed degrades).
 */
async function expandMapsShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; LinkBreeze/1.3)" },
      signal: AbortSignal.timeout(4000),
    });
    // Body is never used; release the connection immediately.
    try {
      await res.body?.cancel();
    } catch {
      /* already released */
    }
    return res.url || url;
  } catch {
    return url;
  }
}

async function resolvePopupFields(
  d: { type: string; url: string; ctaLabel?: string | null },
): Promise<{ url: string; ctaLabel: string | null }> {
  if (d.type === "location") {
    // Bake the admin-locale default label at save time so the public page
    // renders pure data (no locale lookup at request time).
    let locale = "en";
    try {
      const jar = await cookies();
      locale = jar.get(LOCALE_COOKIE)?.value ?? "en";
    } catch {
      // cookie access can throw in some contexts — English fallback is fine
    }
    const raw = isMapsShortLink(d.url) ? await expandMapsShortLink(d.url) : d.url;
    return {
      url: buildMapsUrl(raw),
      ctaLabel: d.ctaLabel?.trim() || DEFAULT_MAPS_CTA_LABELS[locale] || DEFAULT_MAPS_CTA_LABELS.en,
    };
  }
  if (d.type === "text") {
    return { url: d.url, ctaLabel: d.ctaLabel?.trim() || null };
  }
  // #87 divider elements carry no URL or CTA — normalize to inert values.
  if (d.type === "divider") {
    return { url: "", ctaLabel: null };
  }
  // Classic link types never carry popup fields.
  return { url: d.url, ctaLabel: null };
}

/** Fallback CTA label for location cards (#93), keyed by admin locale. */
const DEFAULT_MAPS_CTA_LABELS: Record<string, string> = {
  en: "Open in Google Maps",
  fr: "Ouvrir dans Google Maps",
  es: "Abrir en Google Maps",
};

/**
 * #96 — normalize + validate a submitted slug and check availability.
 * Empty input resolves to null (no slug — the column is optional).
 */
async function resolveRedirectSlug(
  raw: string | undefined,
  excludeLinkId?: number,
): Promise<{ ok: true; slug: string | null } | { ok: false; error: string }> {
  const normalized = normalizeSlug(raw ?? "");
  if (!normalized) return { ok: true, slug: null };
  const reason = slugError(normalized);
  if (reason) return { ok: false, error: SLUG_ERRORS[reason] };
  if (await isSlugTaken(normalized, excludeLinkId)) {
    return { ok: false, error: "This slug is already in use" };
  }
  return { ok: true, slug: normalized };
}

export async function createLink(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const parsed = linkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    pageId: formData.get("pageId") || undefined,
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    type: formData.get("type") || "url",
    isHighlighted: formData.get("isHighlighted"),
    isActive: formData.get("isActive"),
    scheduleStart: formData.get("scheduleStart") || undefined,
    scheduleEnd: formData.get("scheduleEnd") || undefined,
    autoIcon: formData.get("autoIcon") || undefined,
    cardStyle: formData.get("cardStyle") || undefined,
    iconMode: formData.get("iconMode") || undefined,
    icon: formData.get("icon") || undefined,
    popupText: formData.get("popupText") || undefined,
    ctaLabel: formData.get("ctaLabel") || undefined,
    redirectSlug: formData.has("redirectSlug") ? String(formData.get("redirectSlug")) : undefined,
    sectionId: formData.get("sectionId") !== null ? formData.get("sectionId") : undefined,
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;

  // #96 custom /go/ slug: validate + availability before any write.
  const slug = await resolveRedirectSlug(d.redirectSlug);
  if (!slug.ok) return validationError(slug.error);

  try {
    // Resolve the icon fields (favicon fetch / lucide pick / upload).
    const icons = await resolveIconFields(formData, d);
    if (!icons.ok) return validationError(icons.error);

    // For rich cards, auto-fetch OG data to pre-fill description and image
    // if the operator hasn't provided them manually.
    let description = d.description || null;
    let imageUrl = d.imageUrl || null;
    if (d.cardStyle === "rich" && d.type === "url" && extractDomain(d.url)) {
      const og = await fetchOgData(d.url);
      if (!description && og.description) description = og.description;
      if (!imageUrl && og.imageUrl) imageUrl = og.imageUrl;
    }

    // #93 popup cards: per-type URL + CTA label normalization.
    const popup = await resolvePopupFields(d);

    await createLinkQuery({
      title: d.title,
      url: popup.url,
      pageId: d.pageId,
      description,
      imageUrl,
      type: d.type,
      isHighlighted: d.isHighlighted,
      isActive: d.isActive,
      autoIcon: d.autoIcon,
      icon: icons.icon,
      iconUrl: icons.iconUrl,
      customIconUrl: icons.customIconUrl,
      iconMode: icons.iconMode,
      cardStyle: d.cardStyle,
      sectionId: d.sectionId ?? null,
      scheduleStart: d.scheduleStart || null,
      scheduleEnd: d.scheduleEnd || null,
      // #93 popup fields (null for classic link types).
      popupText: d.type === "text" || d.type === "location" ? (d.popupText || null) : null,
      ctaLabel: popup.ctaLabel,
      redirectSlug: slug.slug,
    });

    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("createLink", err, { title: d.title, type: d.type });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function updateLink(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const parsed = linkSchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    url: formData.get("url"),
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    type: formData.get("type") || "url",
    isHighlighted: formData.get("isHighlighted"),
    isActive: formData.get("isActive"),
    scheduleStart: formData.get("scheduleStart") || undefined,
    scheduleEnd: formData.get("scheduleEnd") || undefined,
    autoIcon: formData.get("autoIcon") || undefined,
    cardStyle: formData.get("cardStyle") || undefined,
    iconMode: formData.get("iconMode") || undefined,
    icon: formData.get("icon") || undefined,
    popupText: formData.get("popupText") || undefined,
    ctaLabel: formData.get("ctaLabel") || undefined,
    // #96 TRI-STATE: field present = write the slug (empty string clears it —
    // a deleted slug is a legitimate save); absent from the form = unchanged.
    redirectSlug: formData.has("redirectSlug") ? String(formData.get("redirectSlug")) : undefined,
    sectionId: formData.get("sectionId") !== null ? formData.get("sectionId") : undefined,
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  if (!parsed.data.id) {
    return validationError("Missing link id");
  }

  const d = parsed.data;

  // #96 custom /go/ slug: validate + availability (excluding this link's own
  // row) when the field was submitted.
  let redirectSlug: string | null | undefined;
  if (formData.has("redirectSlug")) {
    const slug = await resolveRedirectSlug(d.redirectSlug, Number(d.id));
    if (!slug.ok) return validationError(slug.error);
    redirectSlug = slug.slug;
  }

  try {
    // Resolve the icon fields (favicon fetch / lucide pick / upload).
    const icons = await resolveIconFields(formData, d);
    if (!icons.ok) return validationError(icons.error);

    // For rich cards, auto-fetch OG data to pre-fill description and image
    // if the operator hasn't provided them manually.
    let description = d.description || null;
    let imageUrl = d.imageUrl || null;
    if (d.cardStyle === "rich" && d.type === "url" && extractDomain(d.url)) {
      const og = await fetchOgData(d.url);
      if (!description && og.description) description = og.description;
      if (!imageUrl && og.imageUrl) imageUrl = og.imageUrl;
    }

    // #93 popup cards: per-type URL + CTA label normalization.
    const popup = await resolvePopupFields(d);

    await updateLinkQuery(Number(d.id), {
      title: d.title,
      url: popup.url,
      description,
      imageUrl,
      type: d.type,
      isHighlighted: d.isHighlighted,
      isActive: d.isActive,
      autoIcon: d.autoIcon,
      icon: icons.icon,
      iconUrl: icons.iconUrl,
      customIconUrl: icons.customIconUrl,
      iconMode: icons.iconMode,
      cardStyle: d.cardStyle,
      sectionId: d.sectionId ?? null,
      scheduleStart: d.scheduleStart || null,
      scheduleEnd: d.scheduleEnd || null,
      // #93 popup fields (null for classic link types).
      popupText: d.type === "text" || d.type === "location" ? (d.popupText || null) : null,
      ctaLabel: popup.ctaLabel,
      // #96: only included when the form carried the field (tri-state).
      ...(redirectSlug !== undefined ? { redirectSlug } : {}),
    });

    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("updateLink", err, { id: d.id, title: d.title });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function deleteLink(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const idStr = formData.get("id");
  if (!idStr) return validationError("Missing link id");
  const id = Number(idStr);
  if (Number.isNaN(id)) return validationError("Invalid link id");

  try {
    await deleteLinkQuery(id);
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("deleteLink", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function toggleLink(id: number): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const all = await getAllLinks();
  const link = all.find((l) => l.id === id);
  if (!link) return notFoundError("Link not found");

  try {
    await updateLinkQuery(id, { isActive: !link.isActive });
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("toggleLink", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function reorderLinks(orderedIds: number[]): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  if (!Array.isArray(orderedIds) || orderedIds.some((n) => typeof n !== "number")) {
    return validationError("Invalid order payload");
  }

  try {
    await reorderLinksQuery(orderedIds);
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("reorderLinks", err, { count: orderedIds.length });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/**
 * #87: one-click divider element. Appends a type="divider" row (no URL, no
 * icon — just a thematic break the operator can then drag into place). The
 * title is a short label, not rendered visually on the public page.
 */
export async function createDivider(pageId?: number): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  try {
    await createLinkQuery({
      title: "—",
      url: "",
      pageId,
      type: "divider",
      isActive: true,
      iconMode: "auto",
      autoIcon: false,
      cardStyle: "compact",
    });
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("createDivider", err, { pageId });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/**
 * #96 — live slug availability check for the link dialog (debounced
 * client-side). Read-only: no demoGuard (nothing is mutated), but auth is
 * required so the endpoint can't be used to enumerate slugs anonymously.
 */
export async function checkSlugAvailability(
  raw: string,
  excludeLinkId?: number,
): Promise<{ success: boolean; error?: string; available?: boolean }> {
  if (!(await requireAuth())) return unauthorizedError();

  const normalized = normalizeSlug(raw);
  if (!normalized) return { success: true, available: false };
  const reason = slugError(normalized);
  if (reason) {
    return { success: true, available: false, error: SLUG_ERRORS[reason] };
  }
  const taken = await isSlugTaken(normalized, excludeLinkId);
  return taken
    ? { success: true, available: false, error: "This slug is already in use" }
    : { success: true, available: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import { isAllowedLinkUrl, buildMapsUrl, isMapsShortLink } from "@/lib/link-url";
import { LOCALE_COOKIE } from "@/i18n/config";
import { truthy } from "@/lib/utils";
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
  getLink,
  updateSetting,
} from "@/server/queries";
import {
  abConfigSchema,
  parseAbConfig,
  serializeAbConfig,
  type AbConfig,
  type AbStatus,
} from "@/lib/ab-test";
import {
  normalizeSlug,
  slugError,
  SLUG_ERRORS,
} from "@/lib/link-slug";
import { safeMediaUrl } from "@/lib/theme-schema";
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

const linkSchema = z
  .object({
    id: z.string().optional(),
    pageId: z.coerce.number().optional(),
    title: z.string().min(1, "Title is required").max(120),
    // Empty allowed for text popups with no CTA (refine below enforces the rest).
    url: z.string().max(2048),
    description: z.string().max(300).optional().nullable(),
    // safeMediaUrl: scheme allowlist (http(s)/site-relative) — the thumbnail
    // URL is rendered in <img src> on the public page (write-boundary defense,
    // same choke point as pages/theme media URLs).
    imageUrl: safeMediaUrl.optional().nullable(),
    type: z.enum(["url", "email", "phone", "whatsapp", "sms", "vcard", "file", "embed", "text", "location", "divider"]).default("url"),
    // #93 popup cards: long body + optional CTA label (target = url column).
    popupText: z.string().max(5000).optional().nullable(),
    ctaLabel: z.string().max(80).optional().nullable(),
    isHighlighted: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(false),
    isActive: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(true),
    scheduleStart: z.string().optional().nullable(),
    scheduleEnd: z.string().optional().nullable(),
    autoIcon: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(true),
    // Icon system (#91): auto = favicon fetch, lucide = picked icon name,
    // custom = uploaded image (file arrives as "iconFile" in FormData).
    iconMode: z.enum(["auto", "lucide", "custom"]).default("auto"),
    icon: z.string().max(64).optional().nullable(),
    cardStyle: z.enum(["compact", "rich"]).default("compact"),
    // Form data sends an empty string when "No section" is selected; coerce
    // that to null before numeric parsing, otherwise Number("") === 0 and the
    // insert fails on the section_id foreign key (issue #86).
    sectionId: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : v),
      z.coerce.number().nullable().optional()
    ),
    // #96 custom /go/ slug — raw input here; normalization + validation +
    // availability run in resolveRedirectSlug after parse (the update path
    // needs the link id to exclude itself from the uniqueness check).
    redirectSlug: z.string().max(200).optional(),
  })
  // #93 popup cards: every non-text type needs a URL (text may leave it
  // empty when there is no CTA button). Runs before the scheme check so an
  // empty classic URL reports "URL is required", not a scheme error.
  // #87 dividers carry no URL at all — the title doubles as an accessible
  // name only when the operator provides one.
  .refine((link) => link.type === "text" || link.type === "divider" || !!link.url.trim(), {
    path: ["url"],
    message: "URL is required",
  })
  .refine((link) => isAllowedLinkUrl(link.type, link.type === "location" ? buildMapsUrl(link.url) : link.url), {
    path: ["url"],
    message: "URL scheme is not allowed for this link type",
  })
  .refine((link) => link.type !== "divider" || isAllowedLinkUrl("divider", link.url), {
    path: ["url"],
    message: "URL scheme is not allowed for this link type",
  })
  .refine((link) => link.type !== "text" || !!(link.popupText ?? "").trim(), {
    path: ["popupText"],
    message: "Popup text is required",
  })
  // A CTA label without a target URL would render a dead button.
  .refine((link) => !link.ctaLabel?.trim() || link.type !== "text" || !!link.url.trim(), {
    path: ["url"],
    message: "CTA URL is required when a CTA label is set",
  });

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

// ─── #81 A/B testing ─────────────────────────────────────────────────────────

const abWeightsSchema = z.object({
  weightA: z.coerce.number().int().min(1).max(99),
});

/**
 * #81 — enable or update the A/B test on a URL-type link.
 *
 * Variant A is the link's own url (untouched); this action stores variant
 * B's destination, labels and integer weight (B = 100 - A). Re-saving an
 * existing test keeps its lifecycle status and winner — only pause/resume
 * and promote change those. Editing an ARCHIVED test reopens it as paused
 * (never silently restarts a finished test's split).
 */
export async function setAbTest(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return validationError("Invalid link id");

  const link = await getLink(id);
  if (!link) return notFoundError("Link not found");
  if (link.type !== "url") {
    return validationError("A/B tests are only available for URL links");
  }

  const rawWeightA = formData.get("weightA");
  const w = abWeightsSchema.safeParse({ weightA: rawWeightA ?? 50 });
  if (!w.success) {
    return validationError("Weight A must be a whole number between 1 and 99");
  }
  const weightA = w.data.weightA;
  const weightB = 100 - weightA;

  const urlB = String(formData.get("urlB") ?? "").trim();
  if (!urlB) return validationError("Variant B needs a destination URL");
  // SAME validator as the primary add-link path (repo security rule).
  if (!isAllowedLinkUrl("url", urlB)) {
    return validationError("Variant B must be an http(s) URL");
  }

  const labelA = String(formData.get("labelA") ?? "").trim() || null;
  const labelB = String(formData.get("labelB") ?? "").trim() || null;

  const existing = parseAbConfig(link.abConfig ?? null);
  const status: AbStatus = existing
    ? existing.status === "archived"
      ? "paused"
      : existing.status
    : "running";

  const config: AbConfig = {
    v: 1,
    status,
    labelA,
    labelB,
    urlB,
    weightA,
    weightB,
    winner: existing?.winner ?? null,
  };
  const validated = abConfigSchema.safeParse(config);
  if (!validated.success) {
    return validationError("Invalid A/B configuration");
  }

  try {
    await updateLinkQuery(id, { abConfig: serializeAbConfig(validated.data) });
    revalidatePath("/links");
    revalidatePath(`/links/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("setAbTest", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/** #81 — pause (revert to A, keep data) or resume a running test. */
export async function setAbTestStatus(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return validationError("Invalid link id");
  const status = String(formData.get("status") ?? "");
  if (status !== "running" && status !== "paused") {
    return validationError("Invalid status");
  }

  const link = await getLink(id);
  if (!link) return notFoundError("Link not found");
  const existing = parseAbConfig(link.abConfig ?? null);
  if (!existing) return validationError("This link has no A/B test");
  if (existing.status === "archived") {
    return validationError("An archived test cannot be restarted — set a new test instead");
  }

  try {
    await updateLinkQuery(id, {
      abConfig: serializeAbConfig({ ...existing, status }),
    });
    revalidatePath("/links");
    revalidatePath(`/links/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("setAbTestStatus", err, { id, status });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/**
 * #81 — promote a variant to the permanent destination and archive the
 * test. Promoting A pins the current url; promoting B copies urlB into
 * links.url (the short URL/QR keep working — they point at /go/:id).
 * Labels, weights, urlB and all variant-labeled click rows stay as history.
 */
export async function promoteAbVariant(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return validationError("Invalid link id");
  const winner = String(formData.get("winner") ?? "");
  if (winner !== "A" && winner !== "B") {
    return validationError("Winner must be A or B");
  }

  const link = await getLink(id);
  if (!link) return notFoundError("Link not found");
  const existing = parseAbConfig(link.abConfig ?? null);
  if (!existing) return validationError("This link has no A/B test");

  try {
    if (winner === "B") {
      // Re-check the allowlist at promote time too — the config may predate
      // a validator tightening or come from a restored backup.
      if (!isAllowedLinkUrl("url", existing.urlB)) {
        return validationError("Variant B is no longer an allowed destination");
      }
      await updateLinkQuery(id, {
        url: existing.urlB,
        abConfig: serializeAbConfig({ ...existing, status: "archived", winner }),
      });
    } else {
      await updateLinkQuery(id, {
        abConfig: serializeAbConfig({ ...existing, status: "archived", winner }),
      });
    }
    revalidatePath("/links");
    revalidatePath(`/links/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("promoteAbVariant", err, { id, winner });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/** #81 — remove the test entirely (config -> NULL). Click history keeps its
 *  variant labels; they just no longer render as an active/archived test. */
export async function removeAbTest(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return validationError("Invalid link id");

  const link = await getLink(id);
  if (!link) return notFoundError("Link not found");
  if (!parseAbConfig(link.abConfig ?? null)) {
    return validationError("This link has no A/B test");
  }

  try {
    await updateLinkQuery(id, { abConfig: null });
    revalidatePath("/links");
    revalidatePath(`/links/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("removeAbTest", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/**
 * #81 E.1 — global auto-promotion toggle (settings KV `abAutoPromote`).
 *
 * DEFAULT OFF: an operator who set up a manual test never gets it promoted
 * out from under them without opting in. When on, the throttled scanner in
 * src/server/ab-auto-promote.ts promotes any running test whose variant
 * clicks clear the minimum sample with a significant margin.
 */
export async function setAbAutoPromote(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const enabled = formData.get("abAutoPromote") === "on";
  try {
    await updateSetting("abAutoPromote", enabled ? "on" : "off");
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    logError("setAbAutoPromote", err, { enabled });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

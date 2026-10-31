"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  ErrorCode,
  logError,
} from "@/lib/errors";
import { canEditPage } from "@/lib/ownership";
import { getCapabilitiesForUser, countPagesByOwner } from "@/server/queries";
import {
  createPage as createPageQuery,
  updatePage as updatePageQuery,
  deletePage as deletePageQuery,
  getDefaultPage,
  getAllPages,
  getPageById,
} from "@/server/queries";

/**
 * Load a page and assert the current session may EDIT it (#124). The actor's
 * capabilities come from the role ROW (getCapabilitiesForUser); admins and
 * manage_all roles pass for any page, owners only for their own. Returns the
 * page on success, or an error ActionResult (not-found / forbidden) the
 * caller returns as-is.
 */
async function assertPageAccess(
  pageId: number,
): Promise<{ page: Awaited<ReturnType<typeof getPageById>>; error: null } | { page: null; error: ActionResult }> {
  const session = await getSession();
  if (!session) return { page: null, error: unauthorizedError() };
  const page = await getPageById(pageId);
  // Return not-found (not forbidden) for a missing page so we don't leak which
  // ids exist; canEditPage also rejects null.
  if (!page) return { page: null, error: notFoundError("Page not found") };
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!canEditPage(caps, session, page)) {
    return { page: null, error: forbiddenError("You do not have access to this page") };
  }
  return { page, error: null };
}


const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(80, "Slug must be 80 characters or less")
  .regex(
    /^@?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
    "Slug can only contain letters, numbers, and hyphens (plus an optional leading @)",
  );

/**
 * Media URL validation for <img>/<video src> values (avatar, banner,
 * background). Only https://, http://, and site-relative "/…" paths are
 * accepted — "javascript:" / "data:" URIs are rejected at this single
 * boundary before they can reach a src attribute anywhere (CodeQL
 * js/xss-through-dom, alerts #20/#21).
 */
const safeMediaUrl = z
  .string()
  .max(2048)
  .refine(
    (v) => /^\/[^/]/.test(v) || /^https:\/\//i.test(v) || /^http:\/\//i.test(v),
    "URL must be https://, http://, or a site-relative path",
  );

const createPageSchema = z.object({
  slug: slugSchema,
  title: z.string().max(80).optional().default(""),
  bio: z.string().max(300).optional().default(""),
});

export async function createPageAction(formData: FormData): Promise<ActionResult<{ pageId: number }>> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return unauthorizedError();
  const { caps } = await getCapabilitiesForUser(session.userId);

  const parsed = createPageSchema.safeParse({
    slug: (formData.get("slug") as string)?.trim().toLowerCase(),
    title: formData.get("title") || "",
    bio: formData.get("bio") || "",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Check slug uniqueness.
  const existing = await getAllPages();
  if (existing.some((p) => p.slug.toLowerCase() === parsed.data.slug.toLowerCase())) {
    return conflictError("A page with this slug already exists");
  }

  // #124: an owner's new page is owned by them; an admin creating a page leaves
  // it unowned (legacy/admin-managed) unless they pass an explicit owner later.
  const ownerUserId = session.role !== "admin" ? session.userId : null;

  // 2B: a role's pagesLimit caps how many pages a member may OWN. Unlimited
  // (NULL) or full-admin capabilities skip the count; import paths are
  // instance-admin-gated so this is the only member-reachable creator.
  if (ownerUserId != null && caps.pagesLimit != null) {
    const owned = await countPagesByOwner(ownerUserId);
    if (owned >= caps.pagesLimit) {
      return forbiddenError(
        `Your plan allows ${caps.pagesLimit} page${caps.pagesLimit === 1 ? "" : "s"}. Ask your administrator for more.`,
      );
    }
  }

  const page = await createPageQuery({
    slug: parsed.data.slug,
    title: parsed.data.title,
    bio: parsed.data.bio,
    userId: ownerUserId,
  });

  revalidatePath("/links");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return { success: true, pageId: page.id };
}

const updatePageSchema = z.object({
  pageId: z.coerce.number(),
  slug: slugSchema.optional(),
  title: z.string().max(80).optional(),
  bio: z.string().max(300).optional(),
  badgeText: z.string().max(40).optional().nullable(),
  avatarUrl: safeMediaUrl.optional().nullable(),
  bannerUrl: safeMediaUrl.optional().nullable(),
  socialLinks: z.string().optional(),
  themeId: z.coerce.number().optional().nullable(),
  isPublished: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  // Page-specific settings
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(300).optional(),
  footerText: z.string().max(200).optional(),
  analyticsScript: z.string().max(2000).optional(),
  customCss: z.string().max(10000).optional(),
  emailCapture: z.boolean().optional(),
  shareEnabled: z.boolean().optional(),
  faviconUrl: safeMediaUrl.max(500).optional().nullable(),
  privacyPolicy: z.string().max(20000).optional(),
  qrSettings: z.string().max(500).optional(),
  // OG image (per page): mode + uploaded custom image. ogImageUrl goes
  // through safeMediaUrl (same http(s)/site-relative allowlist as the other
  // media columns — the CodeQL XSS-through-dom boundary); "" → null.
  ogImageMode: z.enum(["auto", "custom"]).optional(),
  ogImageUrl: safeMediaUrl.max(500).optional().nullable(),
  // Per-upload image adjustments (Spec: Image-Positioning). Numbers arrive
  // as FormData strings; empty string = clear (reset to default rendering).
  avatarFit: z.enum(["cover", "contain"]).optional(),
  avatarPosX: z.coerce.number().min(0).max(1).optional(),
  avatarPosY: z.coerce.number().min(0).max(1).optional(),
  avatarZoom: z.coerce.number().min(1).max(3).optional(),
  bannerFit: z.enum(["cover", "contain"]).optional(),
  bannerPosX: z.coerce.number().min(0).max(1).optional(),
  bannerPosY: z.coerce.number().min(0).max(1).optional(),
  bannerZoom: z.coerce.number().min(1).max(3).optional(),
  backgroundFitOverride: z.enum(["cover", "contain"]).optional(),
  backgroundPosX: z.coerce.number().min(0).max(1).optional(),
  backgroundPosY: z.coerce.number().min(0).max(1).optional(),
  backgroundZoom: z.coerce.number().min(1).max(3).optional(),
  // OG image adjustments (custom upload crop metadata; NULL = default).
  ogImageFit: z.enum(["cover", "contain"]).optional().nullable(),
  ogImagePosX: z.coerce.number().min(0).max(1).optional().nullable(),
  ogImagePosY: z.coerce.number().min(0).max(1).optional().nullable(),
  ogImageZoom: z.coerce.number().min(1).max(3).optional().nullable(),
});

export async function updatePageAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const data: Record<string, unknown> = {
    pageId: formData.get("pageId"),
    slug: formData.get("slug") || undefined,
    // Text fields — tri-state: present in the form = write the value EVEN
    // when empty ("" is a legitimate save: the user deleted the text);
    // absent from the form = leave unchanged. The old `get() || undefined`
    // turned every cleared field into "no change", so deletions came back
    // after refresh. Nullable columns (badge/urls/qr) canonicalize "" → null.
    title: formData.has("title") ? String(formData.get("title") ?? "") : undefined,
    bio: formData.has("bio") ? String(formData.get("bio") ?? "") : undefined,
    badgeText: formData.has("badgeText")
      ? String(formData.get("badgeText") ?? "") || null
      : undefined,
    avatarUrl: formData.has("avatarUrl")
      ? String(formData.get("avatarUrl") ?? "") || null
      : undefined,
    bannerUrl: formData.has("bannerUrl")
      ? String(formData.get("bannerUrl") ?? "") || null
      : undefined,
    socialLinks: formData.has("socialLinks") ? (formData.get("socialLinks") || "[]") : undefined,
    themeId: formData.get("themeId") || undefined,
    // Booleans — same tri-state as below: present = explicit on/off.
    isPublished: formData.has("isPublished")
      ? formData.get("isPublished") === "true"
      : undefined,
    isDefault: formData.has("isDefault") ? formData.get("isDefault") === "true" : undefined,
    // Page-specific settings — present = write (including "").
    seoTitle: formData.has("seoTitle") ? String(formData.get("seoTitle") ?? "") : undefined,
    seoDescription: formData.has("seoDescription")
      ? String(formData.get("seoDescription") ?? "")
      : undefined,
    footerText: formData.has("footerText")
      ? String(formData.get("footerText") ?? "")
      : undefined,
    analyticsScript: formData.has("analyticsScript")
      ? String(formData.get("analyticsScript") ?? "")
      : undefined,
    customCss: formData.has("customCss") ? String(formData.get("customCss") ?? "") : undefined,
    faviconUrl: formData.has("faviconUrl")
      ? String(formData.get("faviconUrl") ?? "") || null
      : undefined,
    privacyPolicy: formData.has("privacyPolicy")
      ? String(formData.get("privacyPolicy") ?? "")
      : undefined,
    qrSettings: formData.has("qrSettings")
      ? String(formData.get("qrSettings") ?? "") || null
      : undefined,
    // OG image tri-state: present = write (empty string → NULL = no custom
    // image); absent = leave unchanged. Mode falls back to auto.
    ogImageMode: formData.has("ogImageMode")
      ? String(formData.get("ogImageMode") ?? "") === "custom"
        ? "custom"
        : "auto"
      : undefined,
    ogImageUrl: formData.has("ogImageUrl")
      ? String(formData.get("ogImageUrl") ?? "") || null
      : undefined,
    // Checkbox tri-state, same contract as emailCapture: present = explicit
    // on/off from a form that contains it; absent = leave unchanged.
    shareEnabled: formData.has("shareEnabled")
      ? formData.get("shareEnabled") === "on"
      : undefined,
  };

  // Per-upload image adjustments (Spec: Image-Positioning). Present with a
  // value = set; present but empty = clear (NULL → default rendering);
  // absent = leave unchanged. Collected before the undefined-sweep below.
  const ADJ_NUMERIC: Array<[string, number, number]> = [
    ["avatarPosX", 0, 1],
    ["avatarPosY", 0, 1],
    ["avatarZoom", 1, 3],
    ["bannerPosX", 0, 1],
    ["bannerPosY", 0, 1],
    ["bannerZoom", 1, 3],
    ["backgroundPosX", 0, 1],
    ["backgroundPosY", 0, 1],
    ["backgroundZoom", 1, 3],
    ["ogImagePosX", 0, 1],
    ["ogImagePosY", 0, 1],
    ["ogImageZoom", 1, 3],
  ];
  for (const [key, min, max] of ADJ_NUMERIC) {
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") {
      data[key] = null; // explicit reset
    } else {
      const n = Number(raw);
      if (!Number.isNaN(n)) data[key] = Math.min(max, Math.max(min, n));
    }
  }
  for (const key of ["avatarFit", "bannerFit", "backgroundFitOverride", "ogImageFit"]) {
    if (!formData.has(key)) continue;
    const raw = String(formData.get(key) ?? "").trim();
    data[key] = raw === "" ? null : raw; // "" = reset to default
  }

  // Handle checkbox: present = on, absent = leave unchanged (the field lives
  // in the Integration tab — forms that don't contain it must not toggle it).
  const emailCapture = formData.get("emailCapture");
  if (emailCapture !== null) {
    data.emailCapture = emailCapture === "on";
  }

  // Remove undefined keys — undefined is the "absent from form, leave
  // unchanged" marker. Empty strings stay: they are legitimate saves
  // (the user cleared the field) and the zod layer validates them.
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }

  const parsed = updatePageSchema.safeParse(data);
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { pageId, ...updateData } = parsed.data;

  // #124: page ownership gate — an owner may only edit their own page.
  const access = await assertPageAccess(pageId);
  if (access.error) return access.error;

  // Check slug uniqueness if slug is being changed.
  if (updateData.slug) {
    const all = await getAllPages();
    if (all.some((p) => p.id !== pageId && p.slug.toLowerCase() === updateData.slug!.toLowerCase())) {
      return conflictError("A page with this slug already exists");
    }
  }

  await updatePageQuery(pageId, updateData);

  // Save global consent text setting alongside page settings.
  const consentText = formData.get("consentText");
  if (consentText !== null) {
    const { updateSetting } = await import("@/server/queries");
    await updateSetting("consentText", (consentText as string) || "");
  }

  revalidatePath("/links");
  revalidatePath("/profile");
  revalidatePath("/theme");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/");
  if (updateData.slug) {
    revalidatePath(`/${updateData.slug}/privacy`, "layout");
  }
  // OG metadata changes must reach the public page's generateMetadata.
  const finalSlug = updateData.slug || (await getPageById(pageId))?.slug;
  if (finalSlug) {
    revalidatePath(`/${finalSlug}`, "layout");
  }
  return { success: true };
}

export async function setPageThemeAction(pageId: number, themeId: number): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  // #124: page ownership gate.
  const access = await assertPageAccess(pageId);
  if (access.error) return access.error;

  await updatePageQuery(pageId, { themeId });

  revalidatePath("/theme");
  revalidatePath(`/`);
  return { success: true };
}

export async function deletePageAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const idStr = formData.get("pageId");
  if (!idStr) return validationError("Missing page id");
  const pageId = Number(idStr);
  if (Number.isNaN(pageId)) return validationError("Invalid page id");

  const mode = formData.get("mode");
  if (mode !== "keep" && mode !== "wipe") {
    return validationError("Invalid delete mode");
  }

  // #124: page ownership gate — an owner may only delete their own page.
  const access = await assertPageAccess(pageId);
  if (access.error) return access.error;

  // The default page is the fallback target for links on deleted pages,
  // so it can never be deleted itself.
  const def = await getDefaultPage();
  if (def.id === pageId) {
    return validationError("The default page cannot be deleted");
  }

  try {
    await deletePageQuery(pageId, mode === "wipe");
  } catch (err) {
    logError("deletePageAction", err, { pageId, mode });
    return {
      success: false,
      error: "Something went wrong while deleting the page. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }

  revalidatePath("/links");
  revalidatePath("/dashboard");
  revalidatePath("/theme");
  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  createSection as createSectionQuery,
  updateSection as updateSectionQuery,
  deleteSection as deleteSectionQuery,
  reorderPageContent as reorderPageContentQuery,
  getPageById,
  getCapabilitiesForUser,
  getSectionPageId,
  getLink,
} from "@/server/queries";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  ErrorCode,
  logError,
} from "@/lib/errors";
import { canEditPage } from "@/lib/ownership";

async function requireAuth(): Promise<boolean> {
  const session = await getSession();
  return !!session;
}

/**
 * #124 page-edit gate for section mutations. Resolves the owning page from a
 * pageId (or from a section/link id when the action targets one row) and
 * asserts the session may EDIT that page via its role-row capabilities.
 */
async function assertSectionPageAccess(
  session: { userId: number },
  opts: { pageId?: number; sectionId?: number; linkId?: number },
): Promise<ActionResult | null> {
  let pageId: number | null | undefined = opts.pageId;
  if (pageId == null && opts.sectionId != null) {
    pageId = await getSectionPageId(opts.sectionId);
    if (pageId == null) return notFoundError("Section not found");
  }
  if (pageId == null && opts.linkId != null) {
    const link = await getLink(opts.linkId);
    if (!link) return notFoundError("Link not found");
    pageId = link.pageId;
  }
  if (pageId == null) return validationError("Missing page id");
  const page = await getPageById(pageId);
  if (!page) return notFoundError("Page not found");
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!canEditPage(caps, session, page)) {
    return forbiddenError("You do not have access to this page");
  }
  return null;
}

const sectionSchema = z.object({
  id: z.coerce.number().optional(),
  pageId: z.coerce.number(),
  title: z.string().min(1, "Title is required").max(80),
  // Dashed lucide icon name ("shopping-bag"), or empty → null. Values that
  // aren't valid icon names (e.g. legacy emoji) are rejected on save.
  icon: z
    .string()
    .trim()
    .max(48)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid icon name")
    .optional()
    .nullable(),
});

export async function saveSection(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const parsed = sectionSchema.safeParse({
    id: formData.get("id") || undefined,
    pageId: formData.get("pageId"),
    title: formData.get("title"),
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;

  // Verify the page exists so a section can't be attached to a foreign page —
  // and that the session may EDIT it (#124 capability gate).
  const page = await getPageById(d.pageId);
  if (!page) return notFoundError("Page not found");
  const session = await getSession();
  if (!session) return unauthorizedError();
  const denied = await assertSectionPageAccess(session, { pageId: d.pageId });
  if (denied) return denied;

  try {
    if (d.id) {
      await updateSectionQuery(d.id, { title: d.title, icon: d.icon ?? null });
    } else {
      await createSectionQuery({ pageId: d.pageId, title: d.title, icon: d.icon ?? null });
    }
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("saveSection", err, { pageId: d.pageId, title: d.title });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

export async function deleteSection(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const idStr = formData.get("id");
  if (!idStr) return validationError("Missing section id");
  const id = Number(idStr);
  if (Number.isNaN(id)) return validationError("Invalid section id");

  const session = await getSession();
  if (!session) return unauthorizedError();
  const denied = await assertSectionPageAccess(session, { sectionId: id });
  if (denied) return denied;

  try {
    await deleteSectionQuery(id);
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("deleteSection", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

const reorderSchema = z.object({
  linkOrder: z.array(
    z.object({
      id: z.number(),
      sectionId: z.number().nullable(),
    }),
  ),
  sectionOrder: z.array(z.number()),
});

export async function reorderContent(payload: {
  linkOrder: Array<{ id: number; sectionId: number | null }>;
  sectionOrder: number[];
}): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await requireAuth())) return unauthorizedError();

  const parsed = reorderSchema.safeParse(payload);
  if (!parsed.success) {
    return validationError("Invalid order payload");
  }

  // #124: gate on the page the reordered links belong to (first link derives it).
  const session = await getSession();
  if (!session) return unauthorizedError();
  const first = parsed.data.linkOrder[0];
  if (first) {
    const denied = await assertSectionPageAccess(session, { linkId: first.id });
    if (denied) return denied;
  }

  try {
    await reorderPageContentQuery(parsed.data.linkOrder, parsed.data.sectionOrder);
    revalidatePath("/links");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    logError("reorderContent", err, { links: payload.linkOrder.length });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

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
} from "@/server/queries";
import { sectionSchema } from "@/lib/validation/section";
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

  // Verify the page exists so a section can't be attached to a foreign page.
  const page = await getPageById(d.pageId);
  if (!page) return notFoundError("Page not found");

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

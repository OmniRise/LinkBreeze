import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { apiGate, apiOk, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { getSectionById, updateSection, deleteSection } from "@/server/queries";
import { sectionPatchSchema } from "@/lib/validation/section";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strict positive-integer segment — the only door through :id. */
function parseId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * PUT /api/v1/sections/:id — data-exact partial update: present fields are
 * validated by the same rules as the admin form, absent fields are untouched,
 * an empty body is a no-op. DELETE unlinks the section; its links fall back
 * to uncategorized (sectionId → null) and are never lost.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) {
    return apiError(ErrorCode.VALIDATION, "Invalid section id.", 400, {
      headers: gate.rateHeaders,
    });
  }

  const existing = await getSectionById(id);
  if (!existing) {
    return apiError(ErrorCode.NOT_FOUND, "Section not found.", 404, {
      headers: gate.rateHeaders,
    });
  }

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, {
      headers: gate.rateHeaders,
    });
  }

  // URL owns id/pageId: neither may be reassigned through this route.
  const record = { ...(body as Record<string, unknown>) };
  delete record.id;
  delete record.pageId;
  delete record.createdAt;

  const parsed = sectionPatchSchema.safeParse(record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(ErrorCode.VALIDATION, issue?.message ?? "Invalid input.", 400, {
      details: parsed.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
      headers: gate.rateHeaders,
    });
  }

  try {
    const patch = {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon ?? null } : {}),
      ...(parsed.data.orderIndex !== undefined
        ? { orderIndex: parsed.data.orderIndex }
        : {}),
    };
    // E.64: an empty patch ({} or only stripped keys) is a legal no-op —
    // return the section unchanged instead of drizzle's "No values to set".
    if (Object.keys(patch).length === 0) {
      return apiOk(await getSectionById(id), { headers: gate.rateHeaders });
    }
    await updateSection(id, patch);
    revalidatePath("/links");
    revalidatePath("/");
    const updated = await getSectionById(id);
    return apiOk(updated, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/sections PUT", err, { id });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) {
    return apiError(ErrorCode.VALIDATION, "Invalid section id.", 400, {
      headers: gate.rateHeaders,
    });
  }

  const existing = await getSectionById(id);
  if (!existing) {
    return apiError(ErrorCode.NOT_FOUND, "Section not found.", 404, {
      headers: gate.rateHeaders,
    });
  }

  try {
    await deleteSection(id);
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk({ id, deleted: true }, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/sections DELETE", err, { id });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

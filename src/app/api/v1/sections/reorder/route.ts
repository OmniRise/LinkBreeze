/**
 * /api/v1/sections/reorder (#4 E.12) — PUT with `{ "ids": [3, 1, 2] }`.
 *
 * Static segment: Next gives it precedence over /sections/[id]. Validation
 * mirrors /api/v1/links/reorder EXACTLY (positive ints, unique, 1..1000,
 * shape-only — no existence checks, matching the links endpoint); the write
 * itself reuses reorderSections, the same query the admin drag-drop drives.
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiGate, apiOk, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { reorderSections } from "@/server/queries";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "ids must contain at least one section id")
    .max(1000, "too many ids")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "ids must not contain duplicates",
    }),
});

export async function PUT(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, { headers: gate.rateHeaders });
  }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return apiError(
      ErrorCode.VALIDATION,
      issues[0]?.message ?? "Invalid input",
      400,
      {
        details: issues.map((i: z.ZodIssue) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
        headers: gate.rateHeaders,
      },
    );
  }

  try {
    await reorderSections(parsed.data.ids);
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk({ reordered: parsed.data.ids.length }, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/sections reorder PUT", err, { count: parsed.data.ids.length });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

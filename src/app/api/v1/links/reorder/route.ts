/**
 * /api/v1/links/reorder (#4) — PUT with `{ "ids": [3, 1, 2] }`.
 *
 * Static segment: Next gives it precedence over /links/[id], and real link
 * ids are numeric, so "reorder" can never collide with a link address.
 * Ids must be positive integers, unique, and the array is bounded — the
 * write itself reuses the same reorderLinks query the admin drag-drop uses.
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiGate, apiOk, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { reorderLinks } from "@/server/queries";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "ids must contain at least one link id")
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
    await reorderLinks(parsed.data.ids);
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk({ reordered: parsed.data.ids.length }, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/links reorder PUT", err, { count: parsed.data.ids.length });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

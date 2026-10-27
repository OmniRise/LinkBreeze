import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiGate, apiOk, apiOkConditional, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import {
  getAllSections,
  getSectionsByPage,
  createSection,
  getPageById,
} from "@/server/queries";
import { sectionSchema } from "@/lib/validation/section";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Zod issues → the envelope's `details` array. */
function zodDetails(
  issues: z.ZodIssue[],
): Array<{ path: string; message: string }> {
  return issues.map((i) => ({
    path: i.path.join(".") || "(root)",
    message: i.message,
  }));
}

/**
 * GET /api/v1/sections — every section in display order, optionally filtered
 * with `?pageId=N`. POST creates one (201); same validation as the admin
 * saveSection action, and the page must exist (404 otherwise).
 */
export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  const sp = new URL(request.url).searchParams;
  if (sp.has("pageId")) {
    const raw = sp.get("pageId") ?? "";
    if (!/^\d{1,7}$/.test(raw)) {
      return apiError(
        ErrorCode.VALIDATION,
        "pageId must be a positive integer",
        400,
        {
          details: [{ path: "pageId", message: "must be a positive integer" }],
          headers: gate.rateHeaders,
        },
      );
    }
    try {
      const sections = await getSectionsByPage(Number(raw));
      return apiOkConditional({ data: sections }, request, {
        headers: gate.rateHeaders,
      });
    } catch (err) {
      logError("api/v1/sections GET", err);
      return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
    }
  }

  try {
    const sections = await getAllSections();
    return apiOkConditional({ data: sections }, request, {
      headers: gate.rateHeaders,
    });
  } catch (err) {
    logError("api/v1/sections GET", err);
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

export async function POST(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, {
      headers: gate.rateHeaders,
    });
  }

  // The URL (route table) owns ids — strip anything id-shaped before the
  // shared schema sees it (same mass-assignment rule as POST /links).
  const record = { ...(body as Record<string, unknown>) };
  delete record.id;
  delete record.orderIndex; // assigned by createSection (next in page order)
  delete record.createdAt;
  delete record.updatedAt;

  const parsed = sectionSchema.safeParse(record);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION,
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      { details: zodDetails(parsed.error.issues), headers: gate.rateHeaders },
    );
  }

  // A section may only attach to a page that exists (mirrors saveSection).
  const page = await getPageById(parsed.data.pageId);
  if (!page) {
    return apiError(ErrorCode.NOT_FOUND, "Page not found.", 404, {
      headers: gate.rateHeaders,
    });
  }

  try {
    const created = await createSection({
      pageId: parsed.data.pageId,
      title: parsed.data.title,
      icon: parsed.data.icon ?? null,
    });
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk(created, { status: 201, headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/sections POST", err, { pageId: parsed.data.pageId });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

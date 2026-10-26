import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { apiGate, apiOk, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { createLinkFromRaw } from "@/server/api-links";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard cap: one request imports at most this many items (decision #14). */
export const IMPORT_MAX_ITEMS = 100;

type ImportResult =
  | { index: number; status: "created"; id: number }
  | {
      index: number;
      status: "error";
      error: {
        code: "validation" | "internal";
        message: string;
        details?: Array<{ path: string; message: string }>;
      };
    };

/**
 * POST /api/v1/links/import (#4 E.10) — bulk create with PARTIAL failure
 * reporting: every item runs the exact single-create pipeline
 * (createLinkFromRaw), one bad entry never aborts the batch. Envelope-level
 * validation (items not an array / empty / >100) is a 400; per-item problems
 * come back as results[i].error inside a 200.
 */
export async function POST(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, {
      headers: gate.rateHeaders,
    });
  }

  const items = (body as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return apiError(ErrorCode.VALIDATION, "items must be an array of link objects.", 400, {
      details: [{ path: "items", message: "must be an array" }],
      headers: gate.rateHeaders,
    });
  }
  if (items.length === 0 || items.length > IMPORT_MAX_ITEMS) {
    return apiError(
      ErrorCode.VALIDATION,
      `items must contain between 1 and ${IMPORT_MAX_ITEMS} entries.`,
      400,
      {
        details: [{ path: "items", message: `length must be 1..${IMPORT_MAX_ITEMS}` }],
        headers: gate.rateHeaders,
      },
    );
  }

  const results: ImportResult[] = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const outcome = await createLinkFromRaw(items[i]);
      if (outcome.ok) {
        results.push({ index: i, status: "created", id: outcome.row.id });
      } else {
        results.push({
          index: i,
          status: "error",
          error: {
            code: "validation",
            message: outcome.message,
            ...(outcome.details ? { details: outcome.details } : {}),
          },
        });
      }
    } catch (err) {
      // DB-level failure: contained to THIS item, batch keeps going.
      logError("api/v1/links/import item", err, { index: i });
      results.push({
        index: i,
        status: "error",
        error: { code: "internal", message: "Something went wrong." },
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  if (created > 0) {
    revalidatePath("/links");
    revalidatePath("/");
  }

  return apiOk(
    { results, created, failed: results.length - created },
    { headers: gate.rateHeaders },
  );
}

/**
 * /api/v1/links (#4) — GET list, POST create.
 *
 * Every request runs the shared v1 gate (bearer key + per-key/per-IP rate
 * limits; mutations additionally get the body cap and demo guard). Responses
 * use the { data } / { error: { code, message } } envelope from
 * src/server/api-auth.ts. Validation is the EXACT schema the admin actions
 * use (src/lib/validation/link.ts) — one boundary for every link write.
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { apiGate, apiOk, apiOkConditional, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { getAllLinks, listLinksKeyset } from "@/server/queries";
import {
  createLinkFromRaw,
  parseListParams,
  encodeListCursor,
} from "@/server/api-links";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E.3 sparse fieldsets: keep id + the requested columns, drop the rest. */
function projectRow(
  row: Record<string, unknown>,
  fields?: string[],
): Record<string, unknown> {
  if (!fields) return row;
  const out: Record<string, unknown> = { id: row.id };
  for (const f of fields) {
    if (f !== "id") out[f] = row[f] ?? null;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  // E.3: ?limit / ?cursor → keyset page with { data, meta }; ?fields → sparse
  // rows. No params → the original full-list { data } (unchanged contract).
  const parsedParams = parseListParams(new URL(request.url).searchParams);
  if (!parsedParams.ok) {
    return apiError(ErrorCode.VALIDATION, parsedParams.message, 400, {
      ...(parsedParams.path
        ? { details: [{ path: parsedParams.path, message: parsedParams.message }] }
        : {}),
      headers: gate.rateHeaders,
    });
  }
  const { paginated, limit, after, fields } = parsedParams.value;

  try {
    if (!paginated) {
      const all = await getAllLinks();
      return apiOkConditional(
        {
          data: all.map((r) => projectRow(r as unknown as Record<string, unknown>, fields)),
        },
        request,
        { headers: gate.rateHeaders },
      );
    }

    // Fetch one extra row to learn whether a next page exists without a
    // second COUNT query.
    const rows = await listLinksKeyset({ limit: limit + 1, after });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return apiOkConditional(
      {
        data: page.map((r) => projectRow(r as unknown as Record<string, unknown>, fields)),
        meta: {
          count: page.length,
          nextCursor:
            hasMore && last ? encodeListCursor(last.orderIndex, last.id) : null,
        },
      },
      request,
      { headers: gate.rateHeaders },
    );
  } catch (err) {
    logError("api/v1/links GET", err);
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

export async function POST(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, { headers: gate.rateHeaders });
  }

  // The full single-create pipeline lives in createLinkFromRaw (shared with
  // the E.10 bulk import) — ONE code path, one validation boundary.
  try {
    const outcome = await createLinkFromRaw(body);
    if (!outcome.ok) {
      return apiError(ErrorCode.VALIDATION, outcome.message, 400, {
        ...(outcome.details ? { details: outcome.details } : {}),
        headers: gate.rateHeaders,
      });
    }
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk(outcome.row, { status: 201, headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/links POST", err);
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

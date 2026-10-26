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
import { z } from "zod";
import { apiGate, apiOk, apiOkConditional, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import {
  getAllLinks,
  listLinksKeyset,
  createLink,
  getDefaultPage,
} from "@/server/queries";
import { linkSchema } from "@/lib/validation/link";
import {
  resolveApiRedirectSlug,
  resolveApiIconFields,
  normalizeApiPopupFields,
  parseListParams,
  encodeListCursor,
} from "@/server/api-links";
import { extractDomain } from "@/lib/favicon";
import { fetchOgData } from "@/lib/og-fetcher";
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
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

export async function POST(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400);
  }

  // Single validation boundary: the SAME schema the admin action parses.
  // The resource id is the URL's, never the body's — strip it before parse.
  // Unknown keys (userId, createdAt, clicksCount, ...) are stripped by zod
  // and never forwarded — the insert is an explicit field pick below.
  const bodyRecord = { ...(body as Record<string, unknown>) };
  delete bodyRecord.id;
  const parsed = linkSchema.safeParse(bodyRecord);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION,
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      { details: zodDetails(parsed.error.issues), headers: gate.rateHeaders },
    );
  }
  const d = parsed.data;

  // #96 custom /go/ slug: validate + availability before any write.
  const slug = await resolveApiRedirectSlug(d.redirectSlug);
  if (!slug.ok) {
    return apiError(ErrorCode.VALIDATION, slug.message, 400, {
      ...(slug.path ? { details: [{ path: slug.path, message: slug.message }] } : {}),
      headers: gate.rateHeaders,
    });
  }

  try {
    // Icon fields (favicon fetch / lucide pick; custom upload is API-rejected).
    const icons = await resolveApiIconFields({
      iconMode: d.iconMode,
      icon: d.icon,
      type: d.type,
      url: d.url,
      autoIcon: d.autoIcon,
    });
    if (!icons.ok) {
      return apiError(ErrorCode.VALIDATION, icons.message, 400, {
        ...(icons.path ? { details: [{ path: icons.path, message: icons.message }] } : {}),
        headers: gate.rateHeaders,
      });
    }

    // Rich cards: same OG pre-fill as the admin action (best-effort).
    let description = d.description || null;
    let imageUrl = d.imageUrl || null;
    if (d.cardStyle === "rich" && d.type === "url" && extractDomain(d.url)) {
      const og = await fetchOgData(d.url);
      if (!description && og.description) description = og.description;
      if (!imageUrl && og.imageUrl) imageUrl = og.imageUrl;
    }

    // Per-type URL + CTA normalization (#93/#87).
    const popup = normalizeApiPopupFields({
      type: d.type,
      url: d.url,
      ctaLabel: d.ctaLabel,
    });

    // Default page resolution mirrors createLink's own fallback — resolving
    // it here keeps the insert payload explicit (404 if the instance has no
    // page at all, which only happens on a broken setup).
    let pageId = d.pageId;
    if (pageId === undefined) {
      pageId = (await getDefaultPage())?.id;
    }

    const created = await createLink({
      title: d.title,
      url: popup.url,
      ...(pageId !== undefined ? { pageId } : {}),
      description,
      imageUrl,
      type: d.type,
      isHighlighted: d.isHighlighted,
      isActive: d.isActive,
      autoIcon: d.autoIcon,
      icon: icons.value.icon,
      iconUrl: icons.value.iconUrl,
      iconMode: icons.value.iconMode,
      cardStyle: d.cardStyle,
      sectionId: d.sectionId ?? null,
      scheduleStart: d.scheduleStart || null,
      scheduleEnd: d.scheduleEnd || null,
      popupText:
        d.type === "text" || d.type === "location" ? d.popupText || null : null,
      ctaLabel: popup.ctaLabel,
      redirectSlug: slug.value,
    });

    revalidatePath("/links");
    revalidatePath("/");
    return apiOk(created, { status: 201, headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/links POST", err, { title: d.title, type: d.type });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

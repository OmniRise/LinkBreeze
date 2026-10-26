/**
 * /api/v1/links/:id (#4) — PUT partial update, DELETE.
 *
 * PUT semantics mirror the admin form's TRI-STATE rule: a key PRESENT in the
 * JSON body is written (null/empty clears where the column is nullable), a
 * key ABSENT is left unchanged. The merged candidate is validated through the
 * SAME linkSchema as every other write, and the patch sent to the query layer
 * is an explicit field pick — body keys like id/userId/createdAt/clicksCount
 * are stripped by zod and can never reach the DB (mass-assignment defense).
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  apiGate,
  apiOk,
  apiOkConditional,
  apiError,
  parseJsonBody,
  ErrorCode,
} from "@/server/api-auth";
import { getLink, updateLink, deleteLink } from "@/server/queries";
import { linkSchema } from "@/lib/validation/link";
import { resolveApiRedirectSlug, resolveApiIconFields } from "@/server/api-links";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Parse the route id: numeric only (no traversal surface — integers). */
function parseId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * #4 E.11 — GET one link by id: same gate, 404 envelope, conditional
 * (ETag/If-None-Match → 304) per decision #13.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return apiError(ErrorCode.VALIDATION, "Invalid link id.", 400, {
      headers: gate.rateHeaders,
    });
  }

  try {
    const link = await getLink(id);
    if (!link) {
      return apiError(ErrorCode.NOT_FOUND, "Link not found.", 404, {
        headers: gate.rateHeaders,
      });
    }
    return apiOkConditional({ data: link }, request, {
      headers: gate.rateHeaders,
    });
  } catch (err) {
    logError("api/v1/links GET", err, { id });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

/** The schema-known fields of an existing row, as a merge candidate. */
function candidateFromRow(row: NonNullable<Awaited<ReturnType<typeof getLink>>>) {
  return {
    id: String(row.id),
    pageId: row.pageId,
    title: row.title,
    url: row.url,
    description: row.description,
    imageUrl: row.imageUrl,
    type: row.type,
    popupText: row.popupText,
    ctaLabel: row.ctaLabel,
    isHighlighted: row.isHighlighted,
    isActive: row.isActive,
    scheduleStart: row.scheduleStart,
    scheduleEnd: row.scheduleEnd,
    autoIcon: row.autoIcon,
    iconMode: row.iconMode,
    icon: row.icon,
    cardStyle: row.cardStyle,
    sectionId: row.sectionId,
    redirectSlug: row.redirectSlug ?? undefined,
  };
}

export async function PUT(request: NextRequest, { params }: Params) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return apiError(ErrorCode.VALIDATION, "Invalid link id.", 400, {
      headers: gate.rateHeaders,
    });
  }

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400);
  }

  const existing = await getLink(id);
  if (!existing) {
    return apiError(ErrorCode.NOT_FOUND, "Link not found.", 404, {
      headers: gate.rateHeaders,
    });
  }

  // Merge: only schema-known keys from the body participate (mass-assignment
  // strip; the resource id is the URL's, never the body's), then the MERGED
  // candidate runs through the full schema so per-type refinements hold
  // across partial edits too.
  const candidate = candidateFromRow(existing);
  const bodyRecord = { ...(body as Record<string, unknown>) };
  delete bodyRecord.id;
  const merged: Record<string, unknown> = { ...candidate };
  for (const key of Object.keys(candidate)) {
    if (Object.prototype.hasOwnProperty.call(bodyRecord, key)) {
      merged[key] = bodyRecord[key];
    }
  }

  const parsed = linkSchema.safeParse(merged);
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
  const d = parsed.data;

  // #96 slug: only touched when the body carries the key (null clears).
  let redirectSlug: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(bodyRecord, "redirectSlug")) {
    const slug = await resolveApiRedirectSlug(d.redirectSlug, id);
    if (!slug.ok) {
      return apiError(ErrorCode.VALIDATION, slug.message, 400, {
        headers: gate.rateHeaders,
      });
    }
    redirectSlug = slug.value;
  }

  // Icon re-resolution only when the body changed icon fields (DATA-EXACT
  // updates: no implicit enrichment). custom → API-rejected.
  let iconPatch: { icon: string | null; iconUrl: string | null; iconMode: "auto" | "lucide" | "custom" } | null =
    null;
  if (
    Object.prototype.hasOwnProperty.call(bodyRecord, "iconMode") ||
    Object.prototype.hasOwnProperty.call(bodyRecord, "icon")
  ) {
    const icons = await resolveApiIconFields({
      iconMode: d.iconMode,
      icon: d.icon,
      type: d.type,
      url: d.url,
      autoIcon: d.autoIcon,
    });
    if (!icons.ok) {
      return apiError(ErrorCode.VALIDATION, icons.message, 400, {
        headers: gate.rateHeaders,
      });
    }
    iconPatch = icons.value;
  }

  try {
    const patch: Record<string, unknown> = {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(bodyRecord, key);

    if (has("title")) patch.title = d.title;
    if (has("url")) patch.url = d.url;
    if (has("type")) patch.type = d.type;
    if (has("description")) patch.description = d.description || null;
    if (has("imageUrl")) patch.imageUrl = d.imageUrl || null;
    if (has("popupText")) {
      patch.popupText =
        d.type === "text" || d.type === "location" ? d.popupText || null : null;
    }
    if (has("ctaLabel")) patch.ctaLabel = d.ctaLabel || null;
    if (has("isHighlighted")) patch.isHighlighted = d.isHighlighted;
    if (has("isActive")) patch.isActive = d.isActive;
    if (has("scheduleStart")) patch.scheduleStart = d.scheduleStart || null;
    if (has("scheduleEnd")) patch.scheduleEnd = d.scheduleEnd || null;
    if (has("autoIcon")) patch.autoIcon = d.autoIcon;
    if (has("sectionId")) patch.sectionId = d.sectionId ?? null;
    if (has("cardStyle")) patch.cardStyle = d.cardStyle;
    if (iconPatch) {
      patch.icon = iconPatch.icon;
      patch.iconUrl = iconPatch.iconUrl;
      patch.iconMode = iconPatch.iconMode;
    }
    if (redirectSlug !== undefined) patch.redirectSlug = redirectSlug;

    await updateLink(id, patch);
    revalidatePath("/links");
    revalidatePath("/");

    const updated = await getLink(id);
    return apiOk(updated ?? { id }, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/links PUT", err, { id });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) {
    return apiError(ErrorCode.VALIDATION, "Invalid link id.", 400, {
      headers: gate.rateHeaders,
    });
  }

  const existing = await getLink(id);
  if (!existing) {
    return apiError(ErrorCode.NOT_FOUND, "Link not found.", 404, {
      headers: gate.rateHeaders,
    });
  }

  try {
    await deleteLink(id);
    revalidatePath("/links");
    revalidatePath("/");
    return apiOk({ deleted: true }, { headers: gate.rateHeaders });
  } catch (err) {
    logError("api/v1/links DELETE", err, { id });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500);
  }
}

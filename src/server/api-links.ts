/**
 * Link write-path helpers for the /api/v1/links routes (#4).
 *
 * Shared by POST (create) and PUT (update). Everything here mirrors the
 * admin action's behavior (src/server/actions/links.ts) through the SAME
 * extracted linkSchema — the single validation boundary — so an API write
 * can never diverge from a UI write on scheme allowlisting or per-type rules.
 *
 * Deliberate divergences (documented in DESIGN-4.md / OpenAPI):
 *  - `iconMode: "custom"` is rejected: file upload stays a UI concern.
 *  - PUT is DATA-EXACT: no implicit favicon/OG enrichment on update — what
 *    you send is what is stored (create does enrich, matching the action).
 *  - location cards get the English default CTA label (API output is
 *    English-only by public-surface precedent); maps short links are NOT
 *    expanded (the UI expands them at save; API callers send final URLs).
 */
import { buildMapsUrl } from "@/lib/link-url";
import {
  normalizeSlug,
  slugError,
  SLUG_ERRORS,
} from "@/lib/link-slug";
import { isLucideName } from "@/lib/link-icons";
import { fetchAndCacheFavicon, extractDomain } from "@/lib/favicon";
import { fetchOgData } from "@/lib/og-fetcher";
import { isSlugTaken, createLink, getDefaultPage } from "@/server/queries";
import { linkSchema } from "@/lib/validation/link";

/** English default CTA for location cards (matches the action's en entry). */
export const DEFAULT_MAPS_CTA_LABEL = "Open in Google Maps";

export type ApiWriteError = { ok: false; status: number; message: string; path?: string };
export type ApiWriteOk<T> = { ok: true; value: T };

function validation(message: string, path?: string): ApiWriteError {
  return { ok: false, status: 400, message, ...(path ? { path } : {}) };
}

/**
 * #96 — normalize + validate a submitted /go/ slug and check availability
 * (identical rules to the action's resolveRedirectSlug).
 */
export async function resolveApiRedirectSlug(
  raw: string | undefined,
  excludeLinkId?: number,
): Promise<ApiWriteOk<string | null> | ApiWriteError> {
  const normalized = normalizeSlug(raw ?? "");
  if (!normalized) return { ok: true, value: null };
  const reason = slugError(normalized);
  if (reason) return validation(SLUG_ERRORS[reason], "redirectSlug");
  if (await isSlugTaken(normalized, excludeLinkId)) {
    return validation("This slug is already in use", "redirectSlug");
  }
  return { ok: true, value: normalized };
}

/**
 * Resolve icon fields for an API write (mirrors resolveIconFields minus the
 * custom-upload branch, which the API rejects explicitly).
 */
export async function resolveApiIconFields(d: {
  iconMode: "auto" | "lucide" | "custom";
  icon?: string | null;
  type: string;
  url: string;
  autoIcon: boolean;
}): Promise<
  ApiWriteOk<{ icon: string | null; iconUrl: string | null; iconMode: "auto" | "lucide" | "custom" }> | ApiWriteError
> {
  // #87 dividers carry no icon — force auto (no-op for them either way).
  if (d.type === "divider") {
    return { ok: true, value: { icon: null, iconUrl: null, iconMode: "auto" } };
  }
  if (d.iconMode === "lucide") {
    const name = (d.icon ?? "").trim();
    if (!isLucideName(name)) return validation("Unknown icon selected", "icon");
    return { ok: true, value: { icon: name, iconUrl: null, iconMode: "lucide" } };
  }
  if (d.iconMode === "custom") {
    return validation(
      "Custom icon upload is not supported via the API - use the admin UI",
      "iconMode",
    );
  }
  // auto: same favicon behavior as the action (best-effort, failures tolerated).
  let iconUrl: string | null = null;
  if (d.autoIcon && d.type === "url" && extractDomain(d.url)) {
    iconUrl = await fetchAndCacheFavicon(d.url);
  }
  return { ok: true, value: { icon: null, iconUrl, iconMode: "auto" } };
}

/**
 * Per-type URL + CTA normalization (#93/#87) — the API-side counterpart of
 * the action's resolvePopupFields (no cookie lookup, no short-link expansion).
 */
export function normalizeApiPopupFields(d: {
  type: string;
  url: string;
  ctaLabel?: string | null;
}): { url: string; ctaLabel: string | null } {
  if (d.type === "location") {
    return {
      url: buildMapsUrl(d.url),
      ctaLabel: d.ctaLabel?.trim() || DEFAULT_MAPS_CTA_LABEL,
    };
  }
  if (d.type === "text") {
    return { url: d.url, ctaLabel: d.ctaLabel?.trim() || null };
  }
  if (d.type === "divider") {
    return { url: "", ctaLabel: null };
  }
  return { url: d.url, ctaLabel: null };
}

// ─── E.10 shared create path (single POST + bulk import run THE SAME code) ───

export type CreateLinkFailure = {
  ok: false;
  message: string;
  details?: Array<{ path: string; message: string }>;
};
export type CreateLinkOutcome =
  | { ok: true; row: Awaited<ReturnType<typeof createLink>> }
  | CreateLinkFailure;

function fail(message: string, path?: string): CreateLinkFailure {
  return { ok: false, message, ...(path ? { details: [{ path, message }] } : {}) };
}

/**
 * Create ONE link from raw request JSON — the full single-create pipeline
 * (shared linkSchema → /go/ slug availability → icon resolution → OG
 * pre-fill for rich cards → per-type URL/CTA normalization → default-page
 * fallback → createLink). Used by POST /api/v1/links AND the E.10 bulk
 * import loop, so a bulk item can never diverge from a single create.
 * Throws only on DB-level failures (callers catch per item / per request).
 */
export async function createLinkFromRaw(raw: unknown): Promise<CreateLinkOutcome> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "Entry must be a JSON object." };
  }

  // Single validation boundary: the SAME schema the admin action parses.
  // The resource id is the URL's, never the body's — strip it before parse.
  // Unknown keys (userId, createdAt, clicksCount, ...) are stripped by zod
  // and never forwarded — the insert is an explicit field pick below.
  const bodyRecord = { ...(raw as Record<string, unknown>) };
  delete bodyRecord.id;
  const parsed = linkSchema.safeParse(bodyRecord);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    }));
    return {
      ok: false,
      message: details[0]?.message ?? "Invalid input",
      details,
    };
  }
  const d = parsed.data;

  // #96 custom /go/ slug: validate + availability before any write.
  const slug = await resolveApiRedirectSlug(d.redirectSlug);
  if (!slug.ok) return fail(slug.message, slug.path);

  // Icon fields (favicon fetch / lucide pick; custom upload is API-rejected).
  const icons = await resolveApiIconFields({
    iconMode: d.iconMode,
    icon: d.icon,
    type: d.type,
    url: d.url,
    autoIcon: d.autoIcon,
  });
  if (!icons.ok) return fail(icons.message, icons.path);

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

  const row = await createLink({
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

  return { ok: true, row };
}

// ─── E.3 list pagination + sparse fieldsets (GET /api/v1/links) ──────────────

export const MAX_LIST_LIMIT = 100;
export const DEFAULT_LIST_LIMIT = 100;

/** Columns a client may request via `fields=` (links table has no secrets;
 *  the allowlist keeps the contract explicit and versionable). `id` is always
 *  returned so rows stay addressable. */
export const LINK_FIELDS = [
  "id",
  "pageId",
  "sectionId",
  "orderIndex",
  "type",
  "title",
  "description",
  "url",
  "icon",
  "iconUrl",
  "customIconUrl",
  "iconMode",
  "autoIcon",
  "imageUrl",
  "isHighlighted",
  "isActive",
  "scheduleStart",
  "scheduleEnd",
  "clicksCount",
  "cardStyle",
  "popupText",
  "ctaLabel",
  "redirectSlug",
  "createdAt",
] as const;

export interface ListParams {
  /** Pagination requested (limit/cursor present) — controls {data, meta} vs legacy {data}. */
  paginated: boolean;
  limit: number;
  after?: { orderIndex: number; id: number };
  fields?: string[];
}

/** Opaque keyset cursor over (orderIndex, id) — base64url JSON. */
export function encodeListCursor(orderIndex: number, id: number): string {
  return Buffer.from(JSON.stringify({ o: orderIndex, i: id })).toString(
    "base64url",
  );
}

/**
 * Parse GET /links query params: `limit` (1..MAX), `cursor` (opaque),
 * `fields` (CSV allowlist). Returns a typed error for any malformed input —
 * the route converts it to the standard 400 envelope.
 */
export function parseListParams(sp: URLSearchParams): {
  ok: true;
  value: ListParams;
} | ApiWriteError {
  const paginated = sp.has("limit") || sp.has("cursor");

  let limit = DEFAULT_LIST_LIMIT;
  if (sp.has("limit")) {
    const raw = sp.get("limit") ?? "";
    if (!/^\d{1,4}$/.test(raw)) {
      return validation("limit must be an integer between 1 and 100", "limit");
    }
    limit = Number(raw);
    if (limit < 1 || limit > MAX_LIST_LIMIT) {
      return validation("limit must be an integer between 1 and 100", "limit");
    }
  }

  let after: { orderIndex: number; id: number } | undefined;
  if (sp.has("cursor")) {
    const raw = sp.get("cursor") ?? "";
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(raw, "base64url").toString("utf8"),
      );
      const o = (parsed as { o?: unknown }).o;
      const i = (parsed as { i?: unknown }).i;
      const oOk = typeof o === "number" && Number.isInteger(o) && o >= 0;
      const iOk = typeof i === "number" && Number.isInteger(i) && i >= 1;
      if (!oOk || !iOk) throw new Error("shape");
      after = { orderIndex: o as number, id: i as number };
    } catch {
      return validation("cursor is not a valid pagination cursor", "cursor");
    }
  }

  let fields: string[] | undefined;
  if (sp.has("fields")) {
    const raw = (sp.get("fields") ?? "").trim();
    if (!raw) return validation("fields must name at least one field", "fields");
    fields = [...new Set(raw.split(",").map((f) => f.trim()))];
    const unknown = fields.filter(
      (f) => !(LINK_FIELDS as readonly string[]).includes(f),
    );
    if (unknown.length > 0) {
      return {
        ok: false,
        status: 400,
        message: `Unknown field(s): ${unknown.join(", ")}`,
        path: "fields",
      };
    }
  }

  return {
    ok: true,
    value: { paginated, limit, after, fields },
  };
}

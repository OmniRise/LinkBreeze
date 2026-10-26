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
import { isSlugTaken } from "@/server/queries";

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

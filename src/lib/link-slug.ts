/**
 * Custom /go/ redirect slugs (#96) — pure helpers, no `@/db` import, so
 * tests and client components can import this module directly.
 *
 * A link's redirect URL is `/go/<numeric id>`. An optional slug makes it
 * stable and shareable: `/go/my-consulting`. Slugs are lowercase [a-z0-9-],
 * unique, max 64 chars. Pure numbers are reserved for the id form so a ref
 * never has two meanings, and app route names are blocked so a slug can
 * never shadow a real route.
 */

export const MAX_SLUG_LENGTH = 64;

/** Route names a slug must never shadow. `sitemap.xml` / `robots.txt` included. */
export const RESERVED_SLUGS = [
  "login",
  "setup",
  "invite",
  "dashboard",
  "links",
  "settings",
  "profile",
  "theme",
  "domains",
  "pages",
  "accounts",
  "audit",
  "api",
  "sitemap.xml",
  "robots.txt",
] as const;

/** Why a slug input was rejected — mapped to wire strings in SLUG_ERRORS. */
export type SlugErrorReason =
  | "invalid"
  | "reserved"
  | "numeric"
  | "length";

export const SLUG_ERRORS: Record<SlugErrorReason, string> = {
  invalid: "Slug may only contain lowercase letters, numbers and hyphens",
  reserved: "This slug is reserved by the app",
  numeric: "Numeric slugs are reserved for link IDs",
  length: `Slug must be at most ${MAX_SLUG_LENGTH} characters`,
};

/**
 * Normalize raw user input to a slug shape: lowercase, spaces/underscores
 * become hyphens, anything else invalid is dropped, hyphens collapse, and
 * leading/trailing hyphens are trimmed.
 *
 * `keepTrailingSeparator` preserves a single trailing separator while the
 * user is TYPING ("my-" mid-keystroke): the dialog's onChange feeds the
 * whole DOM value through this on every keystroke, and trimming a pending
 * separator makes React skip the re-render (same string as before), so the
 * next character silently swallows it ("my-c" instead of "my-c-" → "my-c").
 */
export function normalizeSlug(
  raw: string,
  { keepTrailingSeparator = false }: { keepTrailingSeparator?: boolean } = {},
): string {
  const pending =
    keepTrailingSeparator && /[\s_-]$/.test(raw) ? "-" : "";
  const body = raw
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
  const trimmed = keepTrailingSeparator
    ? body.replace(/-$/, "")
    : body.replace(/-+$/, "");
  return trimmed + pending;
}

/**
 * Validate a NORMALIZED slug. Empty input is valid (means "no slug" — the
 * column is optional). Returns the error reason, or null when acceptable.
 */
export function slugError(slug: string): SlugErrorReason | null {
  if (!slug) return null;
  if (/^\d+$/.test(slug)) return "numeric";
  if (RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number])) return "reserved";
  if (!/^[a-z0-9-]+$/.test(slug)) return "invalid";
  if (slug.length > MAX_SLUG_LENGTH) return "length";
  return null;
}

/** True when the ref should resolve through the numeric-id form. */
export function isNumericRef(ref: string): boolean {
  return /^\d+$/.test(ref);
}

/**
 * Decode a slug path param: Next delivers dynamic params URL-encoded, so a
 * page saved as `@name` arrives here as `%40name`. Malformed sequences
 * (`%zz`) fall back to the raw value instead of throwing.
 */
export function decodeSlugParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

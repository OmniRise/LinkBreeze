/**
 * Content-Disposition filename for a static export (#80) — pure, so tests
 * can import it without loading the route module (and its @/db import).
 *
 * Reduced to [A-Za-z0-9-_.@] with a length cap: quoted-string escaping is
 * not enough for every consumer, and opt-in @-slugs ("@churchname") stay
 * intact because @ is kept.
 */
export function exportFilename(slug: string): string {
  const safe = slug
    .replace(/[^A-Za-z0-9-_.@]/g, "")
    .replace(/^\.+/, "") // no dot-only names (".." would survive the filter)
    .slice(0, 64);
  return `${safe || "page"}.html`;
}

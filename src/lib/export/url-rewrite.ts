/**
 * Asset URL absolutization for static exports (#80).
 *
 * The exported HTML file renders from disk or from a foreign host, so
 * site-relative asset URLs (`/api/uploads/...`) must be rewritten against
 * the export origin or every image breaks. External http(s) URLs and empty
 * values pass through untouched.
 */

export function absolutizeAsset(
  url: string | null | undefined,
  baseUrl: string,
): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

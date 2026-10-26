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
  assetBase?: string,
): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  // Already self-contained schemes (admin can set a data: avatar/image):
  // never prefix with origin, never treat as an uploads path (E.36) —
  // otherwise embed mode would emit `uploads/data:image/…` garbage.
  if (/^(data|blob):/i.test(url)) return url;
  // Self-contained zip variant (E.2): site-relative uploads become
  // `assetBase/<filename>` so the unzipped folder works offline. Upload
  // URLs are flat (/api/uploads/<file>), so the last path segment wins.
  if (assetBase !== undefined) {
    const file = url.split("/").filter(Boolean).pop() ?? "";
    return file ? `${assetBase.replace(/\/+$/, "")}/${file}` : "";
  }
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Names of upload files referenced by an export's asset URLs (E.2) —
 * the zip layer reads these from the uploads volume. Only flat
 * `assetBase/<filename>` URLs are collected (the output of
 * absolutizeAsset with assetBase set); external URLs never match.
 */
export function collectUploadNames(
  html: string,
  assetBase = "uploads",
): string[] {
  // Boundary: the assetBase must start a URL (start of string, or after a
  // quote/paren/whitespace/=) — a substring inside an EXTERNAL url
  // (https://cdn.example/uploads/x.png) must not be collected.
  const re = new RegExp(
    `(?:^|["'(=\\s])${assetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([A-Za-z0-9._-]+)`,
    "g",
  );
  const names = new Set<string>();
  for (const match of html.matchAll(re)) {
    const name = match[1];
    if (name && name !== "." && name !== "..") names.add(name);
  }
  return [...names];
}

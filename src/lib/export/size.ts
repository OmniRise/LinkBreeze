/**
 * Output size cap for static exports (#80).
 *
 * A single-file HTML export carries no embedded assets (media stays on the
 * origin as absolute URLs), so realistic output is tens to hundreds of KB.
 * The 2 MiB cap matches the themes-import precedent and guards against a
 * pathological customCss/analyticsScript blowing up the response.
 */

export const EXPORT_MAX_BYTES = 2 * 1024 * 1024;

export type ExportSizeResult =
  | { ok: true; bytes: number }
  | { ok: false; bytes: number; max: number };

/** Byte length (UTF-8) of the export, checked against the cap. */
export function assertExportSize(html: string): ExportSizeResult {
  const bytes = new TextEncoder().encode(html).length;
  return bytes <= EXPORT_MAX_BYTES
    ? { ok: true, bytes }
    : { ok: false, bytes, max: EXPORT_MAX_BYTES };
}

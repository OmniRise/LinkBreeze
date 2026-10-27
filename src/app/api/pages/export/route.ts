import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { getSession } from "@/lib/auth";
import {
  getPageById,
  getAllPages,
  getActiveLinks,
  getSectionsByPage,
  getActiveTheme,
  getThemeById,
  getCustomFontById,
} from "@/server/queries";
import { pickRequestHost } from "@/lib/host-routing";
import { buildStaticExport } from "@/lib/export/build-static-export";
import { assertExportSize, EXPORT_MAX_BYTES, EXPORT_EMBED_MAX_BYTES } from "@/lib/export/size";
import { exportFilename } from "@/lib/export/filename";
import { createZip, dedupeNames, type ZipEntry } from "@/lib/export/zip";
import { collectUploadNames, absolutizeAsset } from "@/lib/export/url-rewrite";
import { safeUploadPath } from "@/lib/uploads";
import { parseCustomFontId, buildFontFaceCss } from "@/lib/custom-fonts";
import type { ThemeInput } from "@/lib/theme-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Static HTML export (#80): downloads one page as a single self-contained
 * .html file, or every page as one zip (?all=1). Admin-only (session
 * cookie), read-only — so no demoGuard, the demo can show the feature.
 * Auth + size conventions mirror /api/analytics/export.
 */

function getOrigin(request: NextRequest): string {
  // If BASE_URL is set, always use it — prevents host-header injection
  // (X-Forwarded-Host spoofing → absolute asset URLs pointing elsewhere).
  // A root-only value ("/") strips to the empty string, which would make
  // every absolute URL relative — treat it as unset instead. (Observed as
  // the ambient value inside vitest workers; same defensive shape needed
  // for a misconfigured deployment.)
  const configured = process.env.BASE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const proto = request.headers.get("x-forwarded-proto") || "http";
  // Same host-deciding rule as the QR/vCard routes: only trust
  // X-Forwarded-Host behind LINKBREEZE_TRUST_X_FORWARDED_HOST.
  const host =
    pickRequestHost(
      request.headers.get("x-forwarded-host"),
      request.headers.get("host"),
      process.env.LINKBREEZE_TRUST_X_FORWARDED_HOST === "true",
    ) || "localhost";
  return `${proto}://${host}`;
}

/** Resolve "custom:<id>" font refs exactly like the public page. */
async function resolveFontOptions(
  theme: ThemeInput,
  origin: string,
  assetBase?: string,
): Promise<{
  fontFaceCss?: string;
  customFonts?: Map<number, { family: string }>;
}> {
  const customFontIds = [
    parseCustomFontId(theme.fontFamily),
    parseCustomFontId(theme.cardFontFamily),
  ].filter((parsed): parsed is number => parsed !== null);
  if (customFontIds.length === 0) return {};
  const rows = await Promise.all(
    [...new Set(customFontIds)].map((fontId) => getCustomFontById(fontId)),
  );
  const found = rows.filter((row): row is NonNullable<typeof row> => row !== null);
  if (found.length === 0) return {};
  return {
    // Font URLs get the same treatment as every other asset (#80): the
    // public page serves them same-origin (relative works there), but an
    // export renders off-origin — absolute unless embed mode rewrote it
    // to uploads/<file> for the bundled zip.
    fontFaceCss: found
      .map((row) =>
        buildFontFaceCss({
          family: row.family,
          url: absolutizeAsset(row.url, origin, assetBase),
          format: row.format,
        }),
      )
      .join("\n"),
    customFonts: new Map(found.map((row) => [row.id, { family: row.family }])),
  };
}

/** Build one page's export HTML (shared by the single and batch paths). */
async function buildPageHtml(
  page: NonNullable<Awaited<ReturnType<typeof getPageById>>>,
  fallbackTheme: ThemeInput | null,
  origin: string,
  assetBase?: string,
): Promise<string> {
  const pageTheme = page.themeId ? await getThemeById(page.themeId) : null;
  const theme: ThemeInput = pageTheme ?? fallbackTheme ?? {};
  const [links, sections, fontOptions] = await Promise.all([
    getActiveLinks(page.id),
    getSectionsByPage(page.id),
    resolveFontOptions(theme, origin, assetBase),
  ]);
  return buildStaticExport({
    page,
    links,
    sections,
    theme,
    baseUrl: origin,
    assetBase,
    ...fontOptions,
  });
}

/**
 * Upload files referenced by the exported HTML (E.2) — read from the
 * volume via safeUploadPath; missing files are skipped (same as the live
 * page's broken-image behavior for deleted uploads).
 */
function collectUploadEntries(htmls: string[]): ZipEntry[] {
  const names = new Set(htmls.flatMap((html) => collectUploadNames(html)));
  const entries: ZipEntry[] = [];
  for (const name of names) {
    const abs = safeUploadPath(name);
    if (!abs) continue;
    try {
      entries.push({ name: `uploads/${name}`, content: readFileSync(abs) });
    } catch {
      // Missing/unreadable upload — skip, mirroring the live page.
    }
  }
  return entries;
}

function zipResponse(zip: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      // User-content-shaped response (admin-authored titles travel inside
      // the HTML): match the uploads route's nosniff posture, not the
      // plain-CSV precedent.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function sizeError(bytes: number, maxBytes: number): NextResponse {
  return NextResponse.json(
    {
      error: `Export exceeds the ${Math.round(maxBytes / (1024 * 1024))} MiB limit`,
      bytes,
    },
    { status: 413 },
  );
}

export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const origin = getOrigin(request);
  const embed = sp.get("embed") === "1";
  // E.2: self-contained zip — assets rewritten to uploads/ and shipped.
  const assetBase = embed ? "uploads" : undefined;

  // ── Batch export: every page as one zip (?all=1, E.1) ────────────────────
  if (sp.get("all") === "1") {
    const [pages, fallbackTheme] = await Promise.all([
      getAllPages(),
      getActiveTheme(),
    ]);
    if (pages.length === 0) {
      return NextResponse.json({ error: "No pages to export" }, { status: 404 });
    }
    const htmls: string[] = [];
    for (const page of pages) {
      htmls.push(await buildPageHtml(page, fallbackTheme, origin, assetBase));
    }

    const names = dedupeNames(pages.map((page) => exportFilename(page.slug)));
    const htmlEntries: ZipEntry[] = htmls.map((html, i) => ({
      name: names[i],
      content: html,
    }));
    const uploadEntries = embed ? collectUploadEntries(htmls) : [];
    // Batch zips scale with N pages: the 2 MiB single-file cap is the
    // WRONG bound here (a plain 50-page batch legitimately lands ~2.5 MiB,
    // E.79 proved it 413s) — every zip response uses the existing 25 MiB
    // zip bound regardless of embed (decision logged in BURN-BACKLOG).
    const maxBytes = EXPORT_EMBED_MAX_BYTES;
    const totalBytes = [...htmlEntries, ...uploadEntries].reduce(
      (sum, entry) =>
        sum +
        (Buffer.isBuffer(entry.content)
          ? entry.content.length
          : new TextEncoder().encode(entry.content).length),
      0,
    );
    if (totalBytes > maxBytes) return sizeError(totalBytes, maxBytes);

    return zipResponse(
      createZip([...htmlEntries, ...uploadEntries]),
      "linkbreeze-pages.zip",
    );
  }

  // ── Single-page export ───────────────────────────────────────────────────
  const idParam = sp.get("id");
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid page id" }, { status: 400 });
  }

  const page = await getPageById(id);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Same theme resolution as the public page: page theme → active fallback.
  const fallbackTheme = await getActiveTheme();
  const html = await buildPageHtml(page, fallbackTheme, origin, assetBase);

  // E.2 self-contained variant: html + referenced uploads in one zip.
  if (embed) {
    const htmlEntry: ZipEntry = { name: exportFilename(page.slug), content: html };
    const uploadEntries = collectUploadEntries([html]);
    const totalBytes =
      new TextEncoder().encode(html).length +
      uploadEntries.reduce(
        (sum, entry) =>
          sum +
          (Buffer.isBuffer(entry.content)
            ? entry.content.length
            : new TextEncoder().encode(entry.content).length),
        0,
      );
    if (totalBytes > EXPORT_EMBED_MAX_BYTES) {
      return sizeError(totalBytes, EXPORT_EMBED_MAX_BYTES);
    }
    return zipResponse(
      createZip([htmlEntry, ...uploadEntries]),
      `${exportFilename(page.slug).replace(/\.html$/, "")}-export.zip`,
    );
  }

  const size = assertExportSize(html);
  if (!size.ok) return sizeError(size.bytes, EXPORT_MAX_BYTES);

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(page.slug)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

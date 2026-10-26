import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getPageById,
  getActiveLinks,
  getSectionsByPage,
  getActiveTheme,
  getThemeById,
  getCustomFontById,
} from "@/server/queries";
import { pickRequestHost } from "@/lib/host-routing";
import { buildStaticExport } from "@/lib/export/build-static-export";
import { assertExportSize } from "@/lib/export/size";
import { exportFilename } from "@/lib/export/filename";
import { parseCustomFontId, buildFontFaceCss } from "@/lib/custom-fonts";
import type { ThemeInput } from "@/lib/theme-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Static HTML export (#80): downloads one page as a single self-contained
 * .html file. Admin-only (session cookie), read-only — so no demoGuard,
 * the demo can show the feature. Auth + size conventions mirror
 * /api/analytics/export.
 */

function getOrigin(request: NextRequest): string {
  // If BASE_URL is set, always use it — prevents host-header injection
  // (X-Forwarded-Host spoofing → absolute asset URLs pointing elsewhere).
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
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

export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idParam = new URL(request.url).searchParams.get("id");
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid page id" }, { status: 400 });
  }

  const page = await getPageById(id);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Same theme resolution as the public page: page theme → active fallback.
  const [pageTheme, fallbackTheme, links, sections] = await Promise.all([
    page.themeId ? getThemeById(page.themeId) : Promise.resolve(null),
    getActiveTheme(),
    getActiveLinks(page.id),
    getSectionsByPage(page.id),
  ]);
  const theme: ThemeInput = pageTheme ?? fallbackTheme ?? {};

  // Uploaded fonts (#82): resolve "custom:<id>" refs exactly like the
  // public page (missing rows → resolver falls back to the default font).
  const customFontIds = [
    parseCustomFontId(theme.fontFamily),
    parseCustomFontId(theme.cardFontFamily),
  ].filter((parsed): parsed is number => parsed !== null);
  let fontFaceCss: string | undefined;
  let customFontLookup: Map<number, { family: string }> | undefined;
  if (customFontIds.length > 0) {
    const rows = await Promise.all(
      [...new Set(customFontIds)].map((fontId) => getCustomFontById(fontId)),
    );
    const found = rows.filter((row): row is NonNullable<typeof row> => row !== null);
    if (found.length > 0) {
      fontFaceCss = found.map((row) => buildFontFaceCss(row)).join("\n");
      customFontLookup = new Map(found.map((row) => [row.id, { family: row.family }]));
    }
  }

  const origin = getOrigin(request);
  const html = buildStaticExport({
    page,
    links,
    sections,
    theme,
    baseUrl: origin,
    fontFaceCss,
    customFonts: customFontLookup,
  });

  const size = assertExportSize(html);
  if (!size.ok) {
    return NextResponse.json(
      {
        error: `Export exceeds the ${Math.round(size.max / (1024 * 1024))} MiB limit`,
        bytes: size.bytes,
      },
      { status: 413 },
    );
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(page.slug)}"`,
      "Cache-Control": "no-store",
    },
  });
}

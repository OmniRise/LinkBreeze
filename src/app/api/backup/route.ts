import { NextResponse } from "next/server";
import { requireInstanceAdminOrThrow } from "@/server/access";
import { exportBackupPayload } from "@/server/actions/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download the full config backup as JSON. Instance-admin-only: the payload
 * carries every page's config plus the raw settings KV (API-key hash/prefix,
 * OIDC config), which no Member may read. Session-only was not enough —
 * members passed the old getSession() check.
 */
export async function GET() {
  try {
    await requireInstanceAdminOrThrow();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Forbidden" ? 403 : 401 },
    );
  }
  const payload = await exportBackupPayload();
  const today = payload.exportedAt.slice(0, 10);
  return NextResponse.json(payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="linkbreeze-backup-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { demoBlock } from "@/lib/demo";
import { requireInstanceAdminOrThrow } from "@/server/access";
import { clearSubscribers } from "@/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wipe the subscriber list. Instance-admin-only (same reason as the export
 * route) AND demo-blocked: a read-only demo must never lose its data.
 */
export async function DELETE() {
  const blocked = demoBlock();
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 403 });
  }

  try {
    await requireInstanceAdminOrThrow();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Forbidden" ? 403 : 401 },
    );
  }

  await clearSubscribers();
  return NextResponse.json({ success: true });
}

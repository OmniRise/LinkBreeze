import { NextResponse } from "next/server";
import { requireInstanceAdminOrThrow } from "@/server/access";
import { csvCell } from "@/lib/csv";
import { getAllSubscribers } from "@/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSV_HEADER = ["email", "subscribed_at", "consent_at", "consent_text"];

/**
 * CSV export of all subscriber emails. Instance-admin-only: subscribers are
 * an instance-wide table with no page owner, so a session-only check let any
 * Member export every email address collected across the instance.
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

  const rows = await getAllSubscribers();
  const lines = rows.map((r) =>
    [r.email, r.createdAt, r.consentAt ?? "", r.consentText ?? ""]
      .map(csvCell)
      .join(","),
  );

  const csv = [CSV_HEADER.join(","), ...lines].join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linkbreeze-subscribers-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

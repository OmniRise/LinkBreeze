import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { analyticsPageviews, analyticsClicks, links } from "@/db/schema";
import { eq, gt } from "drizzle-orm";
import { parseRange, sinceExpr } from "@/lib/analytics-range";
import { csvCell } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV export of raw analytics rows for the chosen range/metric. Auth-required. */
export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const range = parseRange(sp.get("range"));
  const metric = sp.get("metric") === "clicks" ? "clicks" : "views";
  const since = sinceExpr(range);

  let header: string[];
  let lines: string[];

  if (metric === "views") {
    const rows = await db
      .select({
        createdAt: analyticsPageviews.createdAt,
        visitorHash: analyticsPageviews.visitorHash,
        referrer: analyticsPageviews.referrer,
        country: analyticsPageviews.country,
        deviceType: analyticsPageviews.deviceType,
      })
      .from(analyticsPageviews)
      .where(gt(analyticsPageviews.createdAt, since));
    header = ["timestamp", "visitor_hash", "referrer", "country", "device"];
    lines = rows.map((r) =>
      [r.createdAt, r.visitorHash, r.referrer, r.country, r.deviceType]
        .map(csvCell)
        .join(","),
    );
  } else {
    const rows = await db
      .select({
        createdAt: analyticsClicks.createdAt,
        visitorHash: analyticsClicks.visitorHash,
        referrer: analyticsClicks.referrer,
        title: links.title,
        url: links.url,
        // #81: which A/B variant the click landed on ("" = no test active).
        variant: analyticsClicks.variant,
      })
      .from(analyticsClicks)
      .leftJoin(links, eq(links.id, analyticsClicks.linkId))
      .where(gt(analyticsClicks.createdAt, since));
    header = ["timestamp", "visitor_hash", "referrer", "link_title", "link_url", "variant"];
    lines = rows.map((r) =>
      [r.createdAt, r.visitorHash, r.referrer, r.title, r.url, r.variant ?? ""]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = [header.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linkbreeze-${metric}-${range}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * /api/v1/analytics (#4) — GET views/clicks/top links, read-only.
 *
 * Reuses the EXISTING dashboard aggregation (getDashboardStats) — no new
 * query paths. Payload follows the ai-access-roadmap contract for machine
 * consumers: the retention window and export timestamp ride along so a
 * client can never mistake a windowed figure for all-time.
 */
import { NextRequest } from "next/server";
import { apiGate, apiOkConditional, apiError, ErrorCode } from "@/server/api-auth";
import { getDashboardStats, getAnalyticsRetentionDays } from "@/server/queries";
import { parseRange } from "@/lib/analytics-range";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  const range = parseRange(new URL(request.url).searchParams.get("range"));

  try {
    const [stats, retentionDays] = await Promise.all([
      getDashboardStats(range),
      getAnalyticsRetentionDays(),
    ]);

    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const metrics = {
      range,
      retentionDays,
      totalViews: stats.totalViews,
      uniqueVisitors: stats.uniqueVisitors,
      totalClicks: stats.totalClicks,
      ctr: stats.ctr,
      topLinks: stats.topLinks,
      viewsPerDay: stats.viewsPerDay,
    };
    return apiOkConditional(
      {
        data: {
          ...metrics,
          since,
          exportedAt: new Date().toISOString(),
        },
      },
      request,
      {
        headers: gate.rateHeaders,
        // E.15: the validator covers the METRICS only — since/exportedAt are
        // per-response clock fields, so identical numbers still 304 and a
        // full fetch refreshes the timestamps.
        etagPayload: { data: metrics },
      },
    );
  } catch (err) {
    logError("api/v1/analytics GET", err, { range });
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

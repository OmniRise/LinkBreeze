import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getVisitorHash, stripReferrer } from "@/lib/visitor";
import { rateLimit } from "@/lib/rate-limit";
import { isBot } from "@/lib/bot-detect";
import { getSession } from "@/lib/auth";
import { recordClick } from "@/server/queries";
import { maybeRunScheduledBackup } from "@/server/backup-scheduler";
import { clientIp } from "@/lib/rate-limit-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { type?: string; linkId?: number; referrer?: string };

  try {
    body = await request.json();
  } catch {
    // Fall back to form-encoded body
    try {
      const formData = await request.formData();
      body = {
        type: (formData.get("type") as string) || undefined,
        linkId: formData.get("linkId")
          ? Number(formData.get("linkId"))
          : undefined,
        referrer: (formData.get("referrer") as string) || undefined,
      };
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  }

  const type = body.type;
  // View tracking moved server-side to [slug]/page.tsx (Issue #40).
  // This endpoint is now click tracking + popup-open tracking (#93), both
  // written to analytics_clicks distinguished by event_type.
  if (type !== "click" && type !== "open") {
    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  }

  try {
    const h = await headers();
    const ip = clientIp(h);

    // Per-IP throttle: a genuine visitor won't approach 60 events/min.
    const rl = rateLimit(`track:${ip}`, 60, 60_000);
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const userAgent = (h.get("user-agent") || "").toString();

    // Skip analytics outside production — dev/preview traffic is the owner.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true });
    }

    // Issue #41: Skip analytics for known bots/crawlers.
    if (isBot(userAgent)) {
      return NextResponse.json({ ok: true });
    }

    // Issue #40: Skip analytics for the owner (authenticated admin).
    // Cookie-first check: avoids a DB query on every anonymous request.
    const hasSessionCookie = !!h.get("cookie")?.includes("lb_session");
    const session = hasSessionCookie ? await getSession() : null;
    if (session) {
      return NextResponse.json({ ok: true });
    }

    const visitorHash = getVisitorHash(ip, userAgent);
    const referrer = stripReferrer(
      body.referrer || (h.get("referer") || h.get("referrer") || "").toString(),
    );

    // Click + popup-open events (#93), distinguished by event_type.
    if (typeof body.linkId !== "number" || Number.isNaN(body.linkId)) {
      return NextResponse.json({ ok: false, error: "Missing linkId" }, { status: 400 });
    }
    await recordClick(body.linkId, visitorHash, referrer, type === "open" ? "open" : "click");
    // #83: opportunistic scheduled-backup trigger (throttled inside the
    // scheduler; fire-and-forget so the beacon response stays instant).
    maybeRunScheduledBackup();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[track] error", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

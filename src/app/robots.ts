import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getSetting } from "@/server/queries";

/**
 * Dynamic robots.txt metadata route.
 *
 * Next.js calls the default export to generate /robots.txt. We resolve
 * the origin per-instance so the Sitemap directive is always a valid
 * absolute URL (Google requires this). A static public/robots.txt can't
 * work for a self-hosted product where every instance has a different
 * domain.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headerList = await headers();
  const origin = process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/$/, "")
    : `${headerList.get("x-forwarded-proto") || "https"}://${headerList.get("x-forwarded-host") || headerList.get("host") || "localhost"}`;

  // Search-engine visibility (#94): when the operator hides the page, it
  // must STAY crawlable so crawlers actually see the noindex directive —
  // a robots.txt Disallow on the public page would prevent Google from
  // ever reading it, and the bare URL could still surface as a blocked
  // entry. So the public page is never disallowed here; de-listing runs
  // through the page's own noindex meta + X-Robots-Tag and the empty
  // sitemap. Admin routes stay disallowed as always.
  const hidden = (await getSetting("searchEngineHidden")) === "true";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/setup", "/dashboard", "/links", "/profile", "/theme", "/settings", "/pages", "/domains", "/accounts", "/audit", "/api/"],
    },
    sitemap: hidden ? undefined : `${origin}/sitemap.xml`,
    host: origin,
  };
}

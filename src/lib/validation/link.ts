/**
 * Link form schema (#4 extraction) — THE single validation boundary for link
 * writes. Originally defined inside src/server/actions/links.ts; extracted so
 * the public REST API validates through exactly the same rules (isAllowedLinkUrl
 * scheme allowlist, per-type refinements) as the admin UI actions. Pure module:
 * no db imports, safe for client bundles and fixture tests.
 */
import { z } from "zod";
import { truthy } from "@/lib/utils";
import { isAllowedLinkUrl, buildMapsUrl } from "@/lib/link-url";
import { safeMediaUrl } from "@/lib/theme-schema";

export const linkSchema = z
  .object({
    id: z.string().optional(),
    pageId: z.coerce.number().optional(),
    title: z.string().min(1, "Title is required").max(120),
    // Empty allowed for text popups with no CTA (refine below enforces the rest).
    url: z.string().max(2048),
    description: z.string().max(300).optional().nullable(),
    // safeMediaUrl: scheme allowlist (http(s)/site-relative) — the thumbnail
    // URL is rendered in <img src> on the public page (write-boundary defense,
    // same choke point as pages/theme media URLs).
    imageUrl: safeMediaUrl.optional().nullable(),
    type: z.enum(["url", "email", "phone", "whatsapp", "sms", "vcard", "file", "embed", "text", "location", "divider"]).default("url"),
    // #93 popup cards: long body + optional CTA label (target = url column).
    popupText: z.string().max(5000).optional().nullable(),
    ctaLabel: z.string().max(80).optional().nullable(),
    isHighlighted: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(false),
    isActive: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(true),
    scheduleStart: z.string().optional().nullable(),
    scheduleEnd: z.string().optional().nullable(),
    autoIcon: z
      .union([z.string(), z.boolean()])
      .transform(truthy)
      .default(true),
    // Icon system (#91): auto = favicon fetch, lucide = picked icon name,
    // custom = uploaded image (file arrives as "iconFile" in FormData).
    iconMode: z.enum(["auto", "lucide", "custom"]).default("auto"),
    icon: z.string().max(64).optional().nullable(),
    cardStyle: z.enum(["compact", "rich"]).default("compact"),
    // Form data sends an empty string when "No section" is selected; coerce
    // that to null before numeric parsing, otherwise Number("") === 0 and the
    // insert fails on the section_id foreign key (issue #86).
    sectionId: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : v),
      z.coerce.number().nullable().optional()
    ),
    // #96 custom /go/ slug — raw input here; normalization + validation +
    // availability run in resolveRedirectSlug after parse (the update path
    // needs the link id to exclude itself from the uniqueness check).
    redirectSlug: z.string().max(200).optional(),
  })
  // #93 popup cards: every non-text type needs a URL (text may leave it
  // empty when there is no CTA button). Runs before the scheme check so an
  // empty classic URL reports "URL is required", not a scheme error.
  // #87 dividers carry no URL at all — the title doubles as an accessible
  // name only when the operator provides one.
  .refine((link) => link.type === "text" || link.type === "divider" || !!link.url.trim(), {
    path: ["url"],
    message: "URL is required",
  })
  .refine((link) => isAllowedLinkUrl(link.type, link.type === "location" ? buildMapsUrl(link.url) : link.url), {
    path: ["url"],
    message: "URL scheme is not allowed for this link type",
  })
  .refine((link) => link.type !== "divider" || isAllowedLinkUrl("divider", link.url), {
    path: ["url"],
    message: "URL scheme is not allowed for this link type",
  })
  .refine((link) => link.type !== "text" || !!(link.popupText ?? "").trim(), {
    path: ["popupText"],
    message: "Popup text is required",
  })
  // A CTA label without a target URL would render a dead button.
  .refine((link) => !link.ctaLabel?.trim() || link.type !== "text" || !!link.url.trim(), {
    path: ["url"],
    message: "CTA URL is required when a CTA label is set",
  });

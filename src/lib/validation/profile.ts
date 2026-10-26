/**
 * Profile validation pieces (#4 extraction) — shared by the admin action
 * (src/server/actions/profile.ts, which parses socialLinks as a JSON STRING
 * from FormData) and the /api/v1/profile route (which takes a real ARRAY).
 * Both build their zod schemas on these primitives, so platform allowlisting
 * and field constraints can never drift between the two write paths.
 * Pure module: no db imports.
 */
import { z } from "zod";
import { safeMediaUrl } from "@/lib/theme-schema";
import { SUPPORTED_PLATFORMS } from "@/lib/social-icons";

export const platformEnum = z.enum(SUPPORTED_PLATFORMS as [string, ...string[]]);

export const socialEntrySchema = z.object({
  platform: platformEnum,
  url: z.string().min(1).max(2048),
});

/** The profile field constraints (both write paths share these). */
export const profileCoreShape = {
  displayName: z.string().min(1, "Display name is required").max(80),
  bio: z.string().max(300).optional().default(""),
  badgeText: z.string().max(40).optional().nullable(),
  // safeMediaUrl: scheme allowlist (http(s)/site-relative) — the avatar is
  // rendered in <img src> on the public page and the admin pickers; keeps
  // "javascript:"/"data:" URIs out at the write boundary (CodeQL
  // js/xss-through-dom remediation at the validation boundary).
  avatarUrl: safeMediaUrl.optional().nullable(),
};

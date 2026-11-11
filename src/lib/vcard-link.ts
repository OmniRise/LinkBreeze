import { z } from "zod";
import type { LinkRow, PageRow } from "@/server/queries";
import { buildVCard, pageToVCardInput, type VCardInput } from "@/lib/wallet/vcard";

/**
 * Per-link custom vCard config (native "Save Contact" links).
 *
 * A vCard link can serve the page's own contact card (the default —
 * vcard_config is NULL) or a custom card defined on the link itself.
 * Custom cards are FULL REPLACE (user-decided): the downloaded card
 * contains only what the operator typed on the link, plus the page's
 * avatar (PHOTO) and social profiles — a blank field stays blank, it
 * does not fall back to Settings → Contact card or page auto-fill.
 *
 * Stored as JSON in the links table (same pattern as #81's ab_config):
 * versioned, parsed defensively — malformed/tampered JSON degrades to
 * NULL (default card), never a crash on serve.
 */

export const vcardLinkConfigSchema = z.object({
  v: z.literal(1),
  organization: z.string().max(120).nullable(),
  jobTitle: z.string().max(120).nullable(),
  email: z.string().max(200).nullable(),
  phone: z.string().max(60).nullable(),
  address: z.string().max(300).nullable(),
});

export type VCardLinkConfig = z.infer<typeof vcardLinkConfigSchema>;

/**
 * Parse a stored vcard_config string. Malformed/tampered JSON → NULL
 * (the link serves the page's default card). Mirrors parseAbConfig.
 */
export function parseVCardLinkConfig(raw: string | null): VCardLinkConfig | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = vcardLinkConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Build the canonical stored JSON from raw (untrusted) field values. */
export function encodeVCardLinkConfig(fields: {
  organization?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): string {
  const config: VCardLinkConfig = {
    v: 1,
    organization: fields.organization?.trim() || null,
    jobTitle: fields.jobTitle?.trim() || null,
    email: fields.email?.trim() || null,
    phone: fields.phone?.trim() || null,
    address: fields.address?.trim() || null,
  };
  return JSON.stringify(config);
}

/**
 * Build a custom vCard directly from the link's config (full replace).
 *
 * FN/N come from the link title (the card is "the WhatsApp orders card",
 * not the page identity). Only typed fields are emitted — no NOTE (bio)
 * and no NICKNAME (slug), unlike the page card. PHOTO and X-SOCIALPROFILE
 * still come from the page per the storage contract; URL stays the page
 * address so the card keeps pointing at its home.
 */
export function buildCustomVCard(
  link: Pick<LinkRow, "title">,
  config: VCardLinkConfig,
  page: Pick<PageRow, "slug" | "avatarUrl" | "socialLinks">,
  origin: string,
): string {
  // Reuse the page mapper ONLY for avatar absolute-URL resolution +
  // social-JSON parsing — strip everything it auto-fills from the result.
  const pageScoped = pageToVCardInput(page as PageRow, origin);
  const input: VCardInput = {
    title: link.title,
    slug: page.slug,
    origin,
    organization: config.organization,
    jobTitle: config.jobTitle,
    email: config.email,
    phone: config.phone,
    address: config.address,
    photoUrl: pageScoped.photoUrl,
    socials: pageScoped.socials,
    // Full replace: no bio → no NOTE; no slug → no NICKNAME.
    bio: null,
    nickname: null,
  };
  return buildVCard(input);
}

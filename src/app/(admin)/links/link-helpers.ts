/**
 * Shared constants and helpers for link forms and URL normalization.
 *
 * Kept module-level (not re-created per render) so dialogs reuse a single
 * instance. `prefixLinkUrl` is also reused by the migration wizard.
 */

export type LinkTypeKey =
  | "ltUrl" | "ltEmail" | "ltPhone" | "ltWhatsapp" | "ltSms"
  | "ltVcard" | "ltFile" | "ltEmbed" | "ltText" | "ltLocation"
  | "ltCustom" | "ltDivider";

export const LINK_TYPES = [
  { value: "url", label: "ltUrl" },
  { value: "email", label: "ltEmail" },
  { value: "phone", label: "ltPhone" },
  { value: "whatsapp", label: "ltWhatsapp" },
  { value: "sms", label: "ltSms" },
  { value: "vcard", label: "ltVcard" },
  { value: "file", label: "ltFile" },
  { value: "embed", label: "ltEmbed" },
  { value: "text", label: "ltText" },
  { value: "location", label: "ltLocation" },
  { value: "custom", label: "ltCustom" },
  { value: "divider", label: "ltDivider" },
] as const;

const LINK_LABELS: Record<string, LinkLabelKey> = {
  email: "ltEmailLabel",
  phone: "ltPhoneLabel",
  whatsapp: "ltWhatsappLabel",
  sms: "ltPhoneLabel",
  custom: "ltCustomLabel",
};

const LINK_PLACEHOLDERS: Record<string, LinkPhKey> = {
  email: "phEmail",
  phone: "phPhone",
  whatsapp: "phPhone",
  sms: "phPhone",
  custom: "phCustom",
};

export type LinkLabelKey = "ltEmailLabel" | "ltPhoneLabel" | "ltWhatsappLabel" | "ltUrl" | "ltCustomLabel";
export type LinkPhKey = "phEmail" | "phPhone" | "phUrl" | "phCustom";

export function getUrlLabel(type: string): LinkLabelKey {
  return LINK_LABELS[type] ?? "ltUrl";
}

export function getUrlPlaceholder(type: string): LinkPhKey {
  return LINK_PLACEHOLDERS[type] ?? "phUrl";
}

/**
 * Prepend the correct scheme/prefix for non-URL link types.
 *
 * Mirrors the original if/else chain in LinkDialog.handleSubmit:
 * - email   -> mailto:
 * - phone   -> tel:
 * - whatsapp-> https://wa.me/<digits>
 * - sms     -> sms:
 * - other   -> returned unchanged
 *
 * Reused by the migration wizard to normalize legacy URLs.
 */
export function prefixLinkUrl(type: string, rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  if (type === "email" && !rawUrl.startsWith("mailto:")) {
    return `mailto:${rawUrl}`;
  }
  if (type === "phone" && !rawUrl.startsWith("tel:")) {
    return `tel:${rawUrl}`;
  }
  if (type === "whatsapp" && !rawUrl.startsWith("https://wa.me/")) {
    return `https://wa.me/${rawUrl.replace(/[^0-9]/g, "")}`;
  }
  if (type === "sms" && !rawUrl.startsWith("sms:")) {
    return `sms:${rawUrl}`;
  }
  return rawUrl;
}

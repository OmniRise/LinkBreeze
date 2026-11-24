import type { PageRow } from "@/server/queries";

/**
 * vCard 4.0 generation for a public page.
 *
 * Pure module — no DB import, no filesystem access. The route handler
 * resolves the PageRow and passes it in, so tests can call this with
 * literal fixtures.
 *
 * vCard 4.0 spec: RFC 6350. Lines are CRLF-terminated per spec; long
 * lines are folded at 75 octets. Most contact apps tolerate LF, but
 * spec-correct CRLF costs nothing and avoids Outlook quirks.
 */

/** Escape per RFC 6350 §3.4: backslash, comma, semicolon, newline. */
function escapeVcardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line longer than 75 octets per RFC 6350 §3.2
 * (continuation lines start with a single space). Operates on UTF-8
 * code units carefully: split on characters, never cut a multi-byte
 * char — JS strings are UTF-16 so we fold conservatively on characters
 * (worst case a line is under 75*4 octets before folding, fine for
 * every parser we care about).
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export interface VCardInput {
  /** Page title — maps to FN (formatted name). Required by spec. */
  title: string;
  /** Page slug — maps to NICKNAME and builds the URL. */
  slug: string;
  /** Absolute origin, e.g. https://links.example.com (no trailing slash). */
  origin: string;
  /** Optional bio — maps to NOTE. */
  bio?: string | null;
  /** Optional org name — maps to ORG (omitted when unset). */
  organization?: string | null;
  /** Optional job title — maps to TITLE. */
  jobTitle?: string | null;
  /** Optional email — maps to EMAIL. */
  email?: string | null;
  /** Optional phone — maps to TEL. */
  phone?: string | null;
  /** Optional address (single free-text line) — maps to ADR. */
  address?: string | null;
  /** Optional avatar URL (absolute) — maps to PHOTO;VALUE=URI. */
  photoUrl?: string | null;
  /** Optional social profiles — map to X-SOCIALPROFILE entries. */
  socials?: Array<{ platform: string; url: string }> | null;
  /**
   * Optional NICKNAME value. Defaults to the slug (page card behavior);
   * explicit null suppresses the line entirely (custom full-replace cards
   * carry no page identity beyond avatar + socials).
   */
  nickname?: string | null;
}

export function buildVCard(input: VCardInput): string {
  const fn = input.title.trim() || input.slug;
  const url = `${input.origin}/${input.slug}`;

  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    // N is required by RFC 6350 cardinality; a single displayName can't be
    // split reliably into family/given, so a single-component name is the
    // honest encoding.
    `N:${escapeVcardValue(fn)}`,
    `FN:${escapeVcardValue(fn)}`,
    `URL:${url}`,
  ];

  // NICKNAME defaults to the slug; explicit null suppresses the line
  // (custom per-link cards keep no page identity beyond avatar + socials).
  const nickname = input.nickname !== undefined ? input.nickname : input.slug;
  if (nickname && nickname.trim()) {
    lines.push(`NICKNAME:${escapeVcardValue(nickname.trim())}`);
  }

  if (input.organization && input.organization.trim()) {
    lines.push(`ORG:${escapeVcardValue(input.organization.trim())}`);
  }
  if (input.jobTitle && input.jobTitle.trim()) {
    lines.push(`TITLE:${escapeVcardValue(input.jobTitle.trim())}`);
  }
  if (input.email && input.email.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVcardValue(input.email.trim())}`);
  }
  if (input.phone && input.phone.trim()) {
    lines.push(`TEL;TYPE=CELL:${escapeVcardValue(input.phone.trim())}`);
  }
  if (input.address && input.address.trim()) {
    // Single-field address → all ADR components empty except the ext part.
    lines.push(`ADR;TYPE=WORK:;;${escapeVcardValue(input.address.trim())}`);
  }
  if (input.photoUrl && input.photoUrl.trim()) {
    lines.push(`PHOTO;VALUE=URI:${escapeVcardValue(input.photoUrl.trim())}`);
  }
  for (const social of input.socials ?? []) {
    if (!social.url) continue;
    lines.push(
      `X-SOCIALPROFILE;TYPE=${escapeVcardValue(social.platform)}:${escapeVcardValue(social.url)}`,
    );
  }

  if (input.bio && input.bio.trim()) {
    lines.push(`NOTE:${escapeVcardValue(input.bio.trim())}`);
  }

  lines.push("END:VCARD");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Filename-safe vCard attachment name for a page. */
export function vcardFilename(slug: string): string {
  const safe = slug.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 60) || "contact";
  return `${safe}.vcf`;
}

/**
 * Build the builder input from a page row. Auto-fills everything the page
 * already knows (title, bio, avatar, social links) and layers the per-page
 * vCard overrides (Settings → Contact card) on top — a set override wins,
 * an unset one falls back to the auto value.
 */
export function pageToVCardInput(page: PageRow, origin: string): VCardInput {
  const socials: Array<{ platform: string; url: string }> = [];
  try {
    const parsed: unknown = JSON.parse(page.socialLinks || "[]");
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as { platform?: unknown }).platform === "string" &&
          typeof (entry as { url?: unknown }).url === "string"
        ) {
          socials.push({
            platform: (entry as { platform: string }).platform,
            url: (entry as { url: string }).url,
          });
        }
      }
    }
  } catch {
    // Malformed social_links JSON → no social entries, card still builds.
  }

  // Avatar may be site-relative (/api/uploads/...) — PHOTO URI wants absolute.
  const rawAvatar = page.avatarUrl?.trim();
  const photoUrl = rawAvatar
    ? rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://")
      ? rawAvatar
      : `${origin}${rawAvatar.startsWith("/") ? "" : "/"}${rawAvatar}`
    : null;

  return {
    title: page.title || "",
    slug: page.slug,
    origin,
    bio: page.bio,
    organization: page.vcardOrganization ?? null,
    jobTitle: page.vcardJobTitle ?? null,
    email: page.vcardEmail ?? null,
    phone: page.vcardPhone ?? null,
    address: page.vcardAddress ?? null,
    photoUrl,
    socials,
  };
}

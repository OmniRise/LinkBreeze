import { sanitizeThemeFields } from "@/lib/theme-schema";
import { z } from "zod";
import { db } from "@/db";
import {
  profile,
  links,
  linkSections,
  settings,
  themes,
  customFonts,
} from "@/db/schema";
import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  validationError,
  ErrorCode,
} from "@/lib/errors";
import { normalizeSlug, slugError } from "@/lib/link-slug";
import { isAllowedLinkUrl } from "@/lib/link-url";
import { parseAbConfig, serializeAbConfig } from "@/lib/ab-test";
import { parseCustomFontId } from "@/lib/custom-fonts";
import {
  type ProfileRow,
  type LinkRow,
  type ThemeRow,
} from "@/server/queries";

/**
 * Backup serialization + restore core (#83).
 *
 * The SINGLE restore path: manual upload restore (`restoreBackup` in
 * actions/data.ts) and scheduled-backup restore (actions/backups.ts) both
 * end in `applyBackupPayload`. Server-only module — imports `@/db`, never
 * reachable from a client component.
 */

export const SUPPORTED_BACKUP_VERSION = 1;

// Zod schemas validating the shape of each table's rows. Unknown fields are
// stripped so a backup from a newer version with extra columns can't corrupt
// the DB insert.
const profileRowSchema = z.object({
  id: z.number().optional(),
  avatarUrl: z.string().nullable().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  badgeText: z.string().nullable().optional(),
  socialLinks: z.string().optional(),
});

const linkRowSchema = z.object({
  id: z.number().optional(),
  orderIndex: z.number().optional(),
  type: z.string().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  url: z.string(),
  icon: z.string().nullable().optional(),
  isHighlighted: z.boolean().optional(),
  isActive: z.boolean().optional(),
  scheduleStart: z.string().nullable().optional(),
  scheduleEnd: z.string().nullable().optional(),
  clicksCount: z.number().optional(),
  sectionId: z.number().nullable().optional(),
  // #96: optional so pre-slug backups restore cleanly. Sanitized below —
  // invalid entries become null and duplicates collapse first-wins, because
  // the column's UNIQUE index would otherwise reject the whole restore.
  redirectSlug: z.string().nullable().optional(),
  // #81: optional so pre-A/B backups restore cleanly. Sanitized below —
  // malformed JSON, invalid weights, or a non-allowlisted variant B URL
  // drops the config to null (link keeps working, test data in archived
  // click rows is untouched; an archived test stays archived, never
  // resurrected into a live split).
  abConfig: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const settingRowSchema = z.object({
  key: z.string(),
  value: z.string(),
});

// v1.3: link sections. Optional so backups from before 1.3 (which have no
// sections) still restore cleanly — links fall back to uncategorized.
const sectionRowSchema = z.object({
  id: z.number().optional(),
  pageId: z.number(),
  title: z.string(),
  icon: z.string().nullable().optional(),
  orderIndex: z.number().optional(),
  createdAt: z.string().optional(),
});

const themeRowSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  // Background
  backgroundType: z.string().optional(),
  backgroundValue: z.string().optional(),
  backgroundAngle: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
  overlayColor: z.string().optional(),
  overlayOpacity: z.string().optional(),
  // Colors
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  cardBackground: z.string().optional(),
  cardBorderColor: z.string().optional(),
  textColor: z.string().optional(),
  mutedTextColor: z.string().optional(),
  mode: z.string().optional(),
  // Typography
  fontFamily: z.string().optional(),
  cardFontFamily: z.string().optional(),
  fontScale: z.string().optional(),
  fontWeight: z.string().optional(),
  letterSpacing: z.string().optional(),
  // Card
  linkStyle: z.string().optional(),
  animationType: z.string().optional(),
  radius: z.string().optional(),
  buttonSize: z.string().optional(),
  borderWidth: z.string().optional(),
  shadowStrength: z.string().optional(),
  hoverEffect: z.string().optional(),
  // Layout
  containerWidth: z.string().optional(),
  alignment: z.string().optional(),
  density: z.string().optional(),
  // Effects
  glow: z.string().optional(),
  glowColor: z.string().optional(),
  blur: z.string().optional(),
  noise: z.string().optional(),
  // Profile styling (1.3)
  avatarShape: z.string().optional(),
  avatarBorder: z.string().optional(),
  avatarFloat: z.string().optional(),
  avatarSize: z.string().optional(),
  dividerStyle: z.string().optional(),
  dividerColor: z.string().optional(),
  dividerThickness: z.string().optional(),
  dividerWidth: z.string().optional(),
  profileLayout: z.string().optional(),
  textAnimation: z.string().optional(),
  // Meta
  isActive: z.boolean().optional(),
  isPreset: z.boolean().optional(),
});

/** Uploaded theme font row (#82) — rows only in backups. */
const customFontRowSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1).max(60),
  family: z.string().min(1).max(100),
  filename: z.string().min(1).max(120),
  url: z.string().min(1).max(500),
  sizeBytes: z.number().optional(),
  format: z.string().optional(),
  createdAt: z.string().optional(),
});

export interface BackupPayload {
  version: number;
  exportedAt: string;
  profile: ProfileRow[];
  links: LinkRow[];
  sections?: Array<{ id?: number; pageId: number; title: string; icon: string | null; orderIndex: number; createdAt?: string }>;
  settings: Array<{ key: string; value: string }>;
  themes: ThemeRow[];
  /** Uploaded theme fonts (#82) — rows only; files live in the uploads
   *  volume, which survives a restore (same as avatars/backgrounds). */
  customFonts?: Array<{
    id?: number;
    name: string;
    family: string;
    filename: string;
    url: string;
    sizeBytes?: number;
    format?: string;
    createdAt?: string;
  }>;
}

/** Snapshot of all regenerable config (not analytics — that's CSV-exportable). */
export async function getBackupPayload(): Promise<BackupPayload> {
  const [p, l, sec, s, t, cf] = await Promise.all([
    db.select().from(profile),
    db.select().from(links),
    db.select().from(linkSections),
    db.select().from(settings),
    db.select().from(themes),
    db.select().from(customFonts),
  ]);
  return {
    version: SUPPORTED_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: p,
    links: l,
    sections: sec,
    settings: s,
    themes: t,
    customFonts: cf,
  };
}

/** Validate + transactionally apply a parsed backup payload. Rolls back on
 *  any error so a bad backup never wipes current data. This is the shared
 *  tail of BOTH restore entry points (manual upload + stored backup). */
export async function applyBackupPayload(
  input: unknown,
): Promise<ActionResult> {
  const parsed = input as BackupPayload;

  if (
    !parsed ||
    typeof parsed.version !== "number" ||
    !Array.isArray(parsed.profile) ||
    !Array.isArray(parsed.links) ||
    !Array.isArray(parsed.settings) ||
    !Array.isArray(parsed.themes)
  ) {
    return validationError("Not a valid LinkBreeze backup");
  }

  if (parsed.version !== SUPPORTED_BACKUP_VERSION) {
    return validationError(`Unsupported backup version. This instance expects version 1.`);
  }

  // Validate every row's shape before touching the DB. A malformed backup
  // file is rejected here instead of corrupting tables inside the transaction.
  const validatedProfile = z.array(profileRowSchema).safeParse(parsed.profile);
  const validatedLinks = z.array(linkRowSchema).safeParse(parsed.links);
  const validatedSettings = z.array(settingRowSchema).safeParse(parsed.settings);
  const validatedThemes = z.array(themeRowSchema).safeParse(parsed.themes);
  if (!validatedProfile.success || !validatedLinks.success || !validatedSettings.success || !validatedThemes.success) {
    return validationError("Backup contains malformed data — rows do not match the expected schema");
  }
  parsed.profile = validatedProfile.data as ProfileRow[];
  parsed.links = validatedLinks.data as LinkRow[];
  parsed.settings = validatedSettings.data as Array<{ key: string; value: string }>;
  parsed.themes = validatedThemes.data.map((theme) => {
    // Theme fields land in the public page's CSS — run the same import
    // sanitizer as the theme-file import path (drops invalid/CSS-unsafe
    // values; row fields are optional so the DB defaults apply).
    const { clean, dropped } = sanitizeThemeFields(theme);
    const safe = { ...theme } as Record<string, unknown>;
    for (const key of dropped) delete safe[key];
    return { ...safe, ...clean } as ThemeRow;
  });

  // Sections are optional (v1 backups have none). Validate when present.
  let sections: z.infer<typeof sectionRowSchema>[] = [];
  if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
    const validatedSections = z.array(sectionRowSchema).safeParse(parsed.sections);
    if (!validatedSections.success) {
      return validationError("Backup contains malformed sections");
    }
    sections = validatedSections.data;
    // Drop link section references to sections that don't exist in the backup
    // (e.g. hand-edited file) so the FK doesn't reject the restore.
    const sectionIds = new Set(sections.map((s) => s.id));
    parsed.links = parsed.links.map((l) =>
      l.sectionId != null && !sectionIds.has(l.sectionId)
        ? { ...l, sectionId: null }
        : l,
    );
  }

  // Re-validate link URLs against the scheme allowlist. A backup file could
  // carry javascript: or data: URLs that bypass the create/update validators
  // — these would be stored XSS on the public page. Drop offending rows.
  parsed.links = parsed.links.filter(
    (link) => link.type && link.url && isAllowedLinkUrl(link.type, link.url),
  );

  // #96 redirect slugs: never reject the restore over a bad/duplicate slug —
  // numeric /go/:id keeps working without one. Normalize; invalid → null;
  // duplicates collapse first-wins (the column is UNIQUE in SQLite).
  {
    const seenSlugs = new Set<string>();
    parsed.links = parsed.links.map((link) => {
      const normalized = normalizeSlug(link.redirectSlug ?? "");
      if (!normalized || slugError(normalized)) {
        return { ...link, redirectSlug: null };
      }
      if (seenSlugs.has(normalized)) {
        return { ...link, redirectSlug: null };
      }
      seenSlugs.add(normalized);
      return link;
    });
  }

  // #81 A/B configs: never reject a restore over a bad config — drop to
  // null instead. parseAbConfig validates JSON shape + weights (sum 100);
  // variant B's URL additionally goes through the SAME isAllowedLinkUrl
  // allowlist as the primary save path (repo security rule: every writer).
  // Archived tests restore as archived — a finished test can never come
  // back as a live split (serving only splits on status === "running").
  parsed.links = parsed.links.map((link) => {
    const raw = link.abConfig ?? null;
    // Only URL-type links may carry a test (#81 scope) — a converted link
    // loses its config on restore.
    if (link.type !== "url") return { ...link, abConfig: null };
    const config = parseAbConfig(raw);
    if (!config) return { ...link, abConfig: null };
    if (!isAllowedLinkUrl("url", config.urlB)) {
      return { ...link, abConfig: null };
    }
    return { ...link, abConfig: serializeAbConfig(config) };
  });

  // Custom fonts (#82): optional array (older backups have none). Rows only —
  // the files live in the uploads volume. A malformed array rejects the
  // restore like any other table.
  let fonts: z.infer<typeof customFontRowSchema>[] = [];
  if (Array.isArray(parsed.customFonts) && parsed.customFonts.length > 0) {
    const validatedFonts = z.array(customFontRowSchema).safeParse(parsed.customFonts);
    if (!validatedFonts.success) {
      return validationError("Backup contains malformed custom fonts");
    }
    fonts = validatedFonts.data;
  }

  // Themes referencing a custom font that isn't in the backup (or whose file
  // was never uploaded to this instance) would render a dangling "custom:<id>".
  // The resolver falls back safely, but reset the field so the theme UI shows
  // the truth: Inter.
  const fontIds = new Set(fonts.map((f) => f.id).filter((n): n is number => n != null));
  parsed.themes = parsed.themes.map((theme) =>
    theme.fontFamily && parseCustomFontId(theme.fontFamily) && !fontIds.has(parseCustomFontId(theme.fontFamily)!)
      ? { ...theme, fontFamily: "inter" }
      : theme,
  );

  try {
    db.transaction((tx) => {
      tx.delete(profile).run();
      tx.delete(links).run();
      tx.delete(linkSections).run();
      tx.delete(settings).run();
      tx.delete(themes).run();
      tx.delete(customFonts).run();
      if (parsed.profile.length) tx.insert(profile).values(parsed.profile).run();
      if (sections.length) tx.insert(linkSections).values(sections).run();
      if (parsed.links.length) tx.insert(links).values(parsed.links).run();
      if (parsed.settings.length) tx.insert(settings).values(parsed.settings).run();
      if (parsed.themes.length) tx.insert(themes).values(parsed.themes).run();
      if (fonts.length) tx.insert(customFonts).values(fonts).run();
    });
  } catch (err) {
    console.error("[applyBackupPayload]", err);
    return { success: false, error: "Restore failed — backup may be incompatible", errorCode: ErrorCode.INTERNAL };
  }

  // Everything changed; revalidate the whole tree.
  revalidatePath("/", "layout");
  return { success: true };
}

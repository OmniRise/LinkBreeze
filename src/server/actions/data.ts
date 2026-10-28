"use server";

import { acquireBackupLock, releaseBackupLock } from "@/lib/backup-lock";
import { sanitizeThemeFields } from "@/lib/theme-schema";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import path from "node:path";
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { db } from "@/db";
import {
  links,
  themes,
  customFonts,
  analyticsPageviews,
  analyticsClicks,
} from "@/db/schema";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  conflictError,
} from "@/lib/errors";
import { requireInstanceAdmin, requireInstanceAdminOrThrow } from "@/server/access";
import { UPLOADS_DIR, ensureUploadsDir, sniffFontFormat } from "@/lib/uploads";
import { parseCustomFontId, customFontFamily } from "@/lib/custom-fonts";
import {
  applyBackupPayload,
  getBackupPayload,
  type BackupPayload,
} from "@/server/backup-restore";
import {
  updateSetting,
} from "@/server/queries";


/** Shape of an exported theme (all cosmetic fields, no id/isActive/isPreset). */
const exportableThemeSchema = z.object({
  version: z.literal(1),
  app: z.literal("linkbreeze"),
  kind: z.literal("theme"),
  name: z.string().min(1).max(120),
  // Background
  backgroundType: z.string().max(60),
  backgroundValue: z.string().max(500),
  backgroundAngle: z.string().max(20).optional().default("160deg"),
  backgroundImageUrl: z.string().max(1000).optional().default(""),
  backgroundFit: z.enum(["cover", "contain", "tile"]).optional().default("cover"),
  backgroundPosition: z.string().max(20).optional().default("50% 50%"),
  overlayColor: z.string().max(60).optional().default("#000000"),
  overlayOpacity: z.string().max(10).optional().default("0"),
  // Colors
  primaryColor: z.string().max(60),
  secondaryColor: z.string().max(60).optional().default("#a78bfa"),
  cardBackground: z.string().max(200).optional().default("rgba(255,255,255,0.06)"),
  cardBorderColor: z.string().max(200).optional().default("rgba(167,139,250,0.16)"),
  textColor: z.string().max(60),
  mutedTextColor: z.string().max(200).optional().default("rgba(234,234,234,0.7)"),
  mode: z.string().max(10).optional().default("dark"),
  // Typography
  fontFamily: z.string().max(300),
  // Separate card font — optional with default "" so pre-card-font exports
  // import cleanly (cards just inherit the site font).
  cardFontFamily: z.string().max(300).optional().default(""),
  fontScale: z.string().max(10).optional().default("md"),
  fontWeight: z.string().max(10).optional().default("600"),
  letterSpacing: z.string().max(20).optional().default("0"),
  // Card
  linkStyle: z.string().max(60),
  animationType: z.string().max(60),
  radius: z.string().max(20).optional().default("auto"),
  buttonSize: z.string().max(10).optional().default("md"),
  borderWidth: z.string().max(20).optional().default("1px"),
  shadowStrength: z.string().max(20).optional().default("medium"),
  hoverEffect: z.string().max(20).optional().default("lift"),
  // Layout
  containerWidth: z.string().max(20).optional().default("standard"),
  alignment: z.string().max(20).optional().default("center"),
  density: z.string().max(20).optional().default("normal"),
  // Effects
  glow: z.string().max(10).optional().default("false"),
  glowColor: z.string().max(60).optional().default("#a78bfa"),
  blur: z.string().max(20).optional().default("8px"),
  noise: z.string().max(10).optional().default("false"),
  // Profile styling (1.3) — optional with defaults so pre-1.3 exports import cleanly
  avatarShape: z.string().max(20).optional().default("circle"),
  avatarBorder: z.string().max(20).optional().default("solid"),
  avatarFloat: z.string().max(10).optional().default("false"),
  // Resizable avatar — optional with default "auto" so pre-slider exports
  // import cleanly (shape-aware default size).
  avatarSize: z.string().max(10).optional().default("auto"),
  // Divider element styling (#87) — optional with defaults so pre-divider
  // exports import cleanly (solid card-border line, full width).
  dividerStyle: z.string().max(20).optional().default("solid"),
  dividerColor: z.string().max(60).optional().default(""),
  dividerThickness: z.string().max(4).optional().default("1"),
  dividerWidth: z.string().max(4).optional().default("100"),
  profileLayout: z.string().max(20).optional().default("classic"),
  textAnimation: z.string().max(20).optional().default("none"),
  // Custom font payload (#82) — present when fontFamily is "custom:<id>".
  // woff2/woff bytes as base64 so the export is a single portable file; the
  // importer writes the file and re-registers the font as a NEW row, so ids
  // never collide with fonts already on the target instance.
  customFont: z
    .object({
      name: z.string().min(1).max(60),
      format: z.enum(["woff2", "woff"]),
      data: z.string().min(1),
    })
    .optional(),
  // Bytes for the card font when it references a DIFFERENT uploaded font
  // than fontFamily (same shape as customFont).
  cardCustomFont: z
    .object({
      name: z.string().min(1).max(60),
      format: z.enum(["woff2", "woff"]),
      data: z.string().min(1),
    })
    .optional(),
  exportedAt: z.string(),
});

type ExportableTheme = z.infer<typeof exportableThemeSchema>;
/** Snapshot of all regenerable config (not analytics — that's CSV-exportable).
 *  Serialization lives in server/backup-restore.ts — the scheduled-backup
 *  feature (#83) shares the exact same payload. */
export async function exportBackupPayload(): Promise<BackupPayload> {
  return getBackupPayload();
}
/** Transactional restore: replace profile/links/settings/themes from a backup
 *  file. Rolls back on any error so a bad file never wipes current data.
 *  Validation + the transaction live in server/backup-restore.ts — the
 *  scheduled-backup restore (#83) shares the exact same path. */
export async function restoreBackup(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  // Same invariant the scheduled paths enforce: never restore while a
  // backup (or another restore) is running — a snapshot taken mid-restore
  // would capture a half-replaced database.
  if (!acquireBackupLock()) {
    return validationError("Another backup or restore is in progress. Try again in a moment.");
  }
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return validationError("No backup file provided");
    }

    let parsed: BackupPayload;
    try {
      parsed = JSON.parse(await file.text()) as BackupPayload;
    } catch {
      return validationError("Invalid JSON file");
    }

    return await applyBackupPayload(parsed);
  } finally {
    releaseBackupLock();
  }
}

/** Wipe all analytics + reset per-link click counters. */
export async function clearAnalytics(): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  db.transaction((tx) => {
    tx.delete(analyticsPageviews).run();
    tx.delete(analyticsClicks).run();
    tx.update(links).set({ clicksCount: 0 }).run();
  });

  revalidatePath("/dashboard");
  revalidatePath("/links");
  return { success: true };
}

/** Set the analytics retention window in days (0 = keep forever). */
export async function setRetention(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const raw = (formData.get("retention") as string) || "";
  const days = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
  await updateSetting("analyticsRetentionDays", String(days));

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Export a single theme as a portable, JSON-serializable object (all cosmetic
 * fields, minus id and isActive). Auth + demo gated. Throws on auth failure so
 * the API route can map to a 401.
 */
export async function exportTheme(id: number): Promise<ExportableTheme> {
  if (demoGuard()) throw new Error("read-only");
  await requireInstanceAdminOrThrow();

  const rows = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  const theme = rows[0];
  if (!theme) throw new Error("Theme not found");

  // Embed uploaded fonts' bytes so the export file is self-contained.
  // Both the site font (#82) and the card font are embedded when they
  // reference uploaded fonts; a missing file degrades to a reference only.
  const embedFont = async (ref: string | null): Promise<ExportableTheme["customFont"]> => {
    const fid = parseCustomFontId(ref);
    if (!fid) return undefined;
    const fontRows = await db.select().from(customFonts).where(eq(customFonts.id, fid)).limit(1);
    const font = fontRows[0];
    if (font && (font.format === "woff2" || font.format === "woff")) {
      try {
        const filename = font.url.split("/").pop();
        if (filename) {
          const bytes = await readFile(path.join(UPLOADS_DIR, filename));
          return {
            name: font.name,
            format: font.format,
            data: bytes.toString("base64"),
          };
        }
      } catch {
        // File gone from disk — export without the payload.
      }
    }
    return undefined;
  };

  const customFont = await embedFont(theme.fontFamily);
  // Only embed the card font separately when it differs from the site font;
  // sharing one uploaded font embeds it once (customFont).
  const cardCustomFont =
    theme.cardFontFamily && theme.cardFontFamily !== theme.fontFamily
      ? await embedFont(theme.cardFontFamily)
      : undefined;

  return {
    version: 1,
    app: "linkbreeze",
    kind: "theme",
    name: theme.name,
    backgroundType: theme.backgroundType,
    backgroundValue: theme.backgroundValue,
    backgroundAngle: theme.backgroundAngle,
    backgroundImageUrl: theme.backgroundImageUrl,
    backgroundFit: (theme.backgroundFit as "cover" | "contain" | "tile") ?? "cover",
    backgroundPosition: theme.backgroundPosition,
    overlayColor: theme.overlayColor,
    overlayOpacity: theme.overlayOpacity,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    cardBackground: theme.cardBackground,
    cardBorderColor: theme.cardBorderColor,
    textColor: theme.textColor,
    mutedTextColor: theme.mutedTextColor,
    mode: theme.mode,
    fontFamily: theme.fontFamily,
    cardFontFamily: theme.cardFontFamily,
    fontScale: theme.fontScale,
    fontWeight: theme.fontWeight,
    letterSpacing: theme.letterSpacing,
    linkStyle: theme.linkStyle,
    animationType: theme.animationType,
    radius: theme.radius,
    buttonSize: theme.buttonSize,
    borderWidth: theme.borderWidth,
    shadowStrength: theme.shadowStrength,
    hoverEffect: theme.hoverEffect,
    containerWidth: theme.containerWidth,
    alignment: theme.alignment,
    density: theme.density,
    glow: theme.glow,
    glowColor: theme.glowColor,
    blur: theme.blur,
    noise: theme.noise,
    avatarShape: theme.avatarShape,
    avatarBorder: theme.avatarBorder,
    avatarFloat: theme.avatarFloat,
    avatarSize: theme.avatarSize,
    dividerStyle: theme.dividerStyle,
    dividerColor: theme.dividerColor,
    dividerThickness: theme.dividerThickness,
    dividerWidth: theme.dividerWidth,
    profileLayout: theme.profileLayout,
    textAnimation: theme.textAnimation,
    ...(customFont ? { customFont } : {}),
    ...(cardCustomFont ? { cardCustomFont } : {}),
    exportedAt: new Date().toISOString(),
  };
}

/** Import a previously-exported theme, creating a new (inactive) copy. */
export async function importTheme(json: string): Promise<ActionResult> {
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;
  const blocked = demoGuard();
  if (blocked) return blocked;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return validationError("Invalid JSON");
  }

  const result = exportableThemeSchema.safeParse(parsed);
  if (!result.success) {
    return validationError(result.error.issues[0]?.message ?? "Invalid theme file");
  }
  const t = result.data;
  // Theme fields are interpolated into the public page's CSS — apply the
  // same sanitizer as backup restore (drops invalid/CSS-unsafe values;
  // defaults cover what's dropped).
  {
    const { clean, dropped } = sanitizeThemeFields(t as unknown as Record<string, unknown>);
    for (const key of dropped) delete (t as unknown as Record<string, unknown>)[key];
    Object.assign(t as unknown as Record<string, unknown>, clean);
  }

  const { themeNameExists, insertCustomFont, updateCustomFontFamily } = await import("@/server/queries");
  if (await themeNameExists(t.name)) {
    return conflictError("A theme with this name already exists");
  }

  // Custom fonts (#82 + card font): embedded bytes are stored and
  // registered as NEW rows; the theme's refs are rewritten to the new
  // "custom:<id>"s. Exports without a payload keep their reference only
  // if the cache below already holds it (both fields pointed at the same
  // uploaded font on the source instance), else the site font falls back
  // to Inter and the card font to "" (inherit the site font).
  const restoredRefs = new Map<string, string>();
  const restoreFont = async (
    ref: string,
    payload: ExportableTheme["customFont"],
    fallback: string,
  ): Promise<string> => {
    if (!parseCustomFontId(ref)) return ref;
    const cached = restoredRefs.get(ref);
    if (cached) return cached;
    if (!payload) {
      // No embedded payload — the "custom:<id>" refers to an id from the
      // instance that exported the theme, which is meaningless here. Reset
      // rather than keep a dangling reference.
      return fallback;
    }
    const buffer = Buffer.from(payload.data, "base64");
    const sniffed = sniffFontFormat(buffer);
    if (!sniffed || sniffed !== payload.format) {
      throw new Error("Embedded font payload is not a valid " + payload.format + " file");
    }
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error("Embedded font is too large (max 2 MB)");
    }
    try {
      await ensureUploadsDir();
      const hexId = crypto.randomBytes(12).toString("hex");
      const filename = `${hexId}.${sniffed}`;
      await writeFile(path.join(UPLOADS_DIR, filename), buffer);
      const row = await insertCustomFont({
        name: payload.name,
        family: "",
        filename: `${payload.name}.${sniffed}`.slice(0, 120),
        url: `/api/uploads/${filename}`,
        sizeBytes: buffer.length,
        format: sniffed,
      });
      await updateCustomFontFamily(row.id, customFontFamily(row.id));
      const newRef = `custom:${row.id}`;
      restoredRefs.set(ref, newRef);
      return newRef;
    } catch {
      throw new Error("Could not restore the embedded font file");
    }
  };

  let fontFamily: string;
  let cardFontFamily: string;
  try {
    fontFamily = await restoreFont(t.fontFamily, t.customFont, "inter");
    cardFontFamily = await restoreFont(t.cardFontFamily, t.cardCustomFont, "");
  } catch (err) {
    return validationError(
      err instanceof Error ? err.message : "Invalid theme file",
    );
  }

  await db.insert(themes).values({
    name: t.name,
    backgroundType: t.backgroundType,
    backgroundValue: t.backgroundValue,
    backgroundAngle: t.backgroundAngle,
    backgroundImageUrl: t.backgroundImageUrl,
    backgroundFit: t.backgroundFit,
    backgroundPosition: t.backgroundPosition,
    overlayColor: t.overlayColor,
    overlayOpacity: t.overlayOpacity,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    cardBackground: t.cardBackground,
    cardBorderColor: t.cardBorderColor,
    textColor: t.textColor,
    mutedTextColor: t.mutedTextColor,
    mode: t.mode,
    fontFamily,
    cardFontFamily,
    fontScale: t.fontScale,
    fontWeight: t.fontWeight,
    letterSpacing: t.letterSpacing,
    linkStyle: t.linkStyle,
    animationType: t.animationType,
    radius: t.radius,
    buttonSize: t.buttonSize,
    borderWidth: t.borderWidth,
    shadowStrength: t.shadowStrength,
    hoverEffect: t.hoverEffect,
    containerWidth: t.containerWidth,
    alignment: t.alignment,
    density: t.density,
    glow: t.glow,
    glowColor: t.glowColor,
    blur: t.blur,
    noise: t.noise,
    avatarShape: t.avatarShape,
    avatarBorder: t.avatarBorder,
    avatarFloat: t.avatarFloat,
    avatarSize: t.avatarSize,
    dividerStyle: t.dividerStyle,
    dividerColor: t.dividerColor,
    dividerThickness: t.dividerThickness,
    dividerWidth: t.dividerWidth,
    profileLayout: t.profileLayout,
    textAnimation: t.textAnimation,
    isActive: false,
    isPreset: false,
  });

  revalidatePath("/theme");
  return { success: true };
}

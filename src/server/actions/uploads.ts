"use server";

import path from "node:path";
import crypto from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { requireInstanceAdmin } from "@/server/access";
import { demoGuard } from "@/lib/demo-guard";
import {
  validationError,
  unauthorizedError,
} from "@/lib/errors";
import { UPLOADS_DIR, ensureUploadsDir, sniffFontFormat } from "@/lib/uploads";
import {
  insertCustomFont,
  getCustomFontById,
  getThemesUsingCustomFont,
  deleteCustomFont,
} from "@/server/queries";
import { customFontFamily } from "@/lib/custom-fonts";

export type UploadResult =
  | { success: true; url: string }
  | { success: false; error: string; errorCode: string };

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);

// Favicon allows additional formats not in the avatar set.
const FAVICON_ALLOWED_EXT = new Set([
  ".png",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
]);
const FAVICON_MAX_BYTES = 1 * 1024 * 1024; // 1 MB — favicons are tiny

// Background media: images up to 2 MB (shared with avatar), video up to 5 MB.
const MEDIA_ALLOWED_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
]);
const VIDEO_ALLOWED_EXT = new Set([".mp4", ".webm"]);
const VIDEO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — background loops must stay light

// Custom theme fonts (#82). woff2 preferred; woff accepted for older files.
const FONT_ALLOWED_EXT = new Set([".woff2", ".woff"]);
const FONT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — matches the issue's cap

/** Accepts an image upload, stores it on disk, returns its public URL. */
export async function uploadAvatar(formData: FormData): Promise<UploadResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  if (!(await getSession())) return unauthorizedError();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return validationError("No file provided");
  }
  if (file.size === 0) return validationError("File is empty");
  if (file.size > MAX_BYTES) {
    return validationError("File too large (max 2 MB)");
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return validationError("Unsupported file type");
  }
  if (file.type && !file.type.startsWith("image/")) {
    return validationError("File must be an image");
  }

  await ensureUploadsDir();
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);

  revalidatePath("/profile");
  return { success: true, url: `/api/uploads/${filename}` };
}

/** Accepts a background media upload (image or short loop video), returns URL. */
export async function uploadBackgroundMedia(formData: FormData): Promise<UploadResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  if (!(await getSession())) return unauthorizedError();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return validationError("No file provided");
  }
  if (file.size === 0) return validationError("File is empty");

  const ext = path.extname(file.name).toLowerCase();
  const isVideo = VIDEO_ALLOWED_EXT.has(ext);
  const isImage = MEDIA_ALLOWED_EXT.has(ext);
  if (!isVideo && !isImage) {
    return validationError("Unsupported file type. Use an image or .mp4/.webm video");
  }

  const cap = isVideo ? VIDEO_MAX_BYTES : MAX_BYTES;
  if (file.size > cap) {
    return validationError(`File too large (max ${Math.round(cap / 1024 / 1024)} MB)`);
  }
  if (isImage && file.type && !file.type.startsWith("image/")) {
    return validationError("File must be an image");
  }
  if (isVideo && file.type && !file.type.startsWith("video/")) {
    return validationError("File must be a video");
  }

  await ensureUploadsDir();
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);

  revalidatePath("/theme");
  return { success: true, url: `/api/uploads/${filename}` };
}

/** Accepts a favicon upload (.ico/.png/.svg/.gif/.webp), stores it, returns URL. */
export async function uploadFavicon(formData: FormData): Promise<UploadResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  if (!(await getSession())) return unauthorizedError();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return validationError("No file provided");
  }
  if (file.size === 0) return validationError("File is empty");
  if (file.size > FAVICON_MAX_BYTES) {
    return validationError("File too large (max 1 MB)");
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!FAVICON_ALLOWED_EXT.has(ext)) {
    return validationError("Unsupported file type. Use .ico, .png, .svg, .gif, or .webp");
  }

  // SVG is text-based, so it won't start with "image/". Validate by extension.
  if (ext !== ".svg" && file.type && !file.type.startsWith("image/")) {
    return validationError("File must be an image");
  }

  await ensureUploadsDir();
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true, url: `/api/uploads/${filename}` };
}

/**
 * Accepts a custom OG image upload (1200x630 recommended). Same image
 * allowlist as avatar/background (no svg: raster formats only — the image
 * becomes an og:image target, which social scrapers render as raster).
 * 5 MB cap: OG images get re-fetched by scrapers, keep them light.
 */
const OG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadOgImage(formData: FormData): Promise<UploadResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  if (!(await getSession())) return unauthorizedError();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return validationError("No file provided");
  }
  if (file.size === 0) return validationError("File is empty");
  if (file.size > OG_IMAGE_MAX_BYTES) {
    return validationError("File too large (max 5 MB)");
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return validationError("Unsupported file type");
  }
  if (file.type && !file.type.startsWith("image/")) {
    return validationError("File must be an image");
  }

  await ensureUploadsDir();
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buffer);

  revalidatePath("/settings");
  return { success: true, url: `/api/uploads/${filename}` };
}

export type CustomFontUploadResult =
  | {
      success: true;
      font: {
        id: number;
        name: string;
        family: string;
        filename: string;
        url: string;
        sizeBytes: number;
        format: string;
      };
    }
  | { success: false; error: string; errorCode: string };

/**
 * Upload a custom theme font (#82): validate (magic bytes + size), store in
 * the uploads dir, insert a custom_fonts row, return its metadata. Themes
 * then reference it as fontFamily "custom:<id>".
 */
export async function uploadCustomFont(formData: FormData): Promise<CustomFontUploadResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  // Instance-wide: fonts are selectable by every theme/page. Admin-only.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;
  if (!(await getSession())) return unauthorizedError();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return validationError("No file provided");
  }
  if (file.size === 0) return validationError("File is empty");
  if (file.size > FONT_MAX_BYTES) {
    return validationError("File too large (max 2 MB)");
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!FONT_ALLOWED_EXT.has(ext)) {
    return validationError("Unsupported file type. Use .woff2 or .woff");
  }

  // Name: user-supplied, else derive from the filename.
  const rawName = String(formData.get("name") || "").trim();
  const fallbackName = path.basename(file.name, ext).replace(/[-_]+/g, " ").trim();
  const name = (rawName || fallbackName || "Custom font").slice(0, 60);

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffFontFormat(buffer);
  if (!sniffed) {
    return validationError("Not a valid font file (expected woff2 or woff)");
  }
  // Trust the bytes over the extension: a .woff2-named woff1 still works, a
  // renamed PNG never becomes a font.
  const format = sniffed;

  await ensureUploadsDir();
  const id = crypto.randomBytes(12).toString("hex");
  const filename = `${id}.${format}`;
  const dest = path.join(UPLOADS_DIR, filename);

  try {
    await writeFile(dest, buffer);
  } catch {
    return validationError("Could not store the font file. Check disk space and permissions.");
  }

  const row = await insertCustomFont({
    name,
    family: "", // placeholder; filled after insert so the id is known
    filename: path.basename(file.name).slice(0, 120),
    url: `/api/uploads/${filename}`,
    sizeBytes: buffer.length,
    format,
  });
  // Family is derived from the row id — update in place.
  const { updateCustomFontFamily } = await import("@/server/queries");
  const family = customFontFamily(row.id);
  await updateCustomFontFamily(row.id, family);

  revalidatePath("/theme");
  return {
    success: true,
    font: {
      id: row.id,
      name,
      family,
      filename: path.basename(file.name).slice(0, 120),
      url: `/api/uploads/${filename}`,
      sizeBytes: buffer.length,
      format,
    },
  };
}

export type CustomFontDeleteResult =
  | { success: true; affectedThemes: string[] }
  | { success: false; error: string; errorCode: string };

/**
 * Delete a custom font and reset every theme using it back to Inter.
 * The stored file is removed best-effort (a leftover file is harmless; a
 * broken theme reference is not).
 */
export async function deleteCustomFontAction(id: number): Promise<CustomFontDeleteResult> {
  const blocked = demoGuard();
  if (blocked) return { success: false, error: blocked.error, errorCode: blocked.errorCode };
  // Instance-wide: deletion force-resets every theme using the font.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;
  if (!(await getSession())) return unauthorizedError();
  if (!Number.isInteger(id) || id <= 0) return validationError("Invalid font id");

  const font = await getCustomFontById(id);
  if (!font) return validationError("Font not found");

  // Capture affected theme ids before the rows are reset, so their public
  // pages can be revalidated afterwards.
  const affectedRows = await getThemesUsingCustomFont(id);
  const { affectedThemes } = await deleteCustomFont(id);

  // Best-effort file cleanup — never fail the action over it.
  try {
    const filename = font.url.split("/").pop();
    if (filename) {
      await unlink(path.join(UPLOADS_DIR, filename));
    }
  } catch {
    // File already gone or inaccessible; the DB row was removed.
  }

  // Revalidate the theme admin page + the public pages of affected themes.
  revalidatePath("/theme");
  const { getPagesUsingTheme } = await import("@/server/queries");
  for (const t of affectedRows) {
    try {
      const using = await getPagesUsingTheme(t.id);
      for (const page of using) revalidatePath(`/${page.slug}`);
    } catch {
      // Revalidation is best-effort.
    }
  }
  return { success: true, affectedThemes };
}

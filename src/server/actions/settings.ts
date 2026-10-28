"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
} from "@/lib/errors";
import { requireInstanceAdmin } from "@/server/access";
import { updateSetting as updateSettingQuery } from "@/server/queries";


const settingsSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Slug may only contain letters, numbers, hyphens and underscores"),
  title: z.string().max(120).optional().default(""),
  description: z.string().max(300).optional().default(""),
  footerText: z.string().max(200).optional().default(""),
  analyticsScript: z.string().max(2000).optional().default(""),
  customCss: z.string().max(10000).optional().default(""),
  emailCapture: z.string().optional().default(""),
  faviconUrl: z.string().max(500).optional().default(""),
  activeThemeId: z.string().optional().nullable(),
  consentText: z.string().max(500).optional().default(""),
  searchEngineHidden: z.enum(["true", "false"]).optional().default("false"),
});

export async function updateSettings(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const parsed = settingsSchema.safeParse({
    slug: formData.get("slug"),
    title: formData.get("title") || "",
    description: formData.get("description") || "",
    footerText: formData.get("footerText") || "",
    analyticsScript: formData.get("analyticsScript") || "",
    customCss: formData.get("customCss") || "",
    emailCapture: formData.get("emailCapture") === "on" ? "true" : "false",
    faviconUrl: formData.get("faviconUrl") || "",
    activeThemeId: formData.get("activeThemeId") || undefined,
    consentText: formData.get("consentText") || "",
    searchEngineHidden: formData.get("searchEngineHidden") === "true" ? "true" : "false",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;
  // Presence-aware: only write the fields this form actually submitted.
  // Settings are split across tabs (General / Integration / Appearance) —
  // saving one tab must not blank the others.
  const has = (key: string) => formData.has(key);
  if (has("slug")) await updateSettingQuery("slug", d.slug);
  if (has("title")) await updateSettingQuery("title", d.title);
  if (has("description")) await updateSettingQuery("description", d.description);
  if (has("footerText")) await updateSettingQuery("footerText", d.footerText);
  if (has("analyticsScript")) await updateSettingQuery("analyticsScript", d.analyticsScript);
  if (has("customCss")) await updateSettingQuery("customCss", d.customCss);
  if (has("emailCapture")) await updateSettingQuery("emailCapture", d.emailCapture);
  if (has("faviconUrl")) await updateSettingQuery("faviconUrl", d.faviconUrl);
  if (has("consentText")) await updateSettingQuery("consentText", d.consentText);
  if (has("searchEngineHidden")) await updateSettingQuery("searchEngineHidden", d.searchEngineHidden);

  // Persist active theme if provided.
  if (d.activeThemeId) {
    const id = Number(d.activeThemeId);
    if (!Number.isNaN(id)) {
      const { setActiveTheme } = await import("@/server/queries");
      await setActiveTheme(id);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}

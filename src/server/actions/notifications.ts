"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import { type ActionResult, validationError, unauthorizedError } from "@/lib/errors";
import {
  testDedupeKey,
  type NotificationProvider,
} from "@/lib/notifications/events";
import { isValidWebhookUrl } from "@/lib/notifications/url";
import {
  createNotificationConfig,
  deleteNotificationConfigForPage,
  getNotificationConfigByPage,
  updateNotificationConfig,
} from "@/server/queries/notifications";
import { deliverToWebhook } from "@/server/notifications/emit";

/** "" (present but empty) = metric off (null). Tri-state FormData contract. */
function optionalThreshold(raw: FormDataEntryValue | null): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 1_000_000_000);
}

const saveSchema = z.object({
  pageId: z.coerce.number().int().positive(),
  url: z
    .string()
    .max(2048)
    .refine(isValidWebhookUrl, "Webhook URL must be a valid http(s) URL"),
  provider: z.enum(["discord", "slack", "telegram", "ntfy"]),
  enabled: z.enum(["true", "false"]),
});

/** Upsert the (single) webhook config for a page. Autosaved from the card. */
export async function saveNotificationConfigAction(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const parsed = saveSchema.safeParse({
    pageId: formData.get("pageId"),
    url: (formData.get("url") ?? "").toString().trim(),
    provider: formData.get("provider") ?? "discord",
    enabled: formData.get("enabled") === "true" ? "true" : "false",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;
  const input = {
    pageId: d.pageId,
    url: d.url,
    provider: d.provider as NotificationProvider,
    enabled: d.enabled === "true",
    clicksThreshold: optionalThreshold(formData.get("clicksThreshold")),
    viewsThreshold: optionalThreshold(formData.get("viewsThreshold")),
  };

  const existing = await getNotificationConfigByPage(d.pageId);
  if (existing) {
    await updateNotificationConfig(existing.id, input);
  } else {
    await createNotificationConfig(input);
  }
  revalidatePath("/settings");
  return { success: true };
}

/**
 * Fire a sample event through the REAL pipeline for the page's config.
 * The action itself succeeds; `detail` carries the delivery outcome
 * (null = delivered, otherwise the last failure reason, e.g. "HTTP 500").
 */
export async function sendTestNotificationAction(
  formData: FormData,
): Promise<ActionResult<{ detail: string | null }>> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const pageId = Number(formData.get("pageId"));
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return validationError("Invalid page");
  }
  const config = await getNotificationConfigByPage(pageId);
  if (!config) return validationError("Save the webhook configuration first");

  const outcome = await deliverToWebhook(
    {
      id: config.id,
      url: config.url,
      provider: config.provider as NotificationProvider,
      clicksThreshold: config.clicksThreshold,
      viewsThreshold: config.viewsThreshold,
    },
    {
      type: "test",
      pageId: config.pageId,
      pageTitle: "LinkBreeze",
      slug: null,
      metric: "clicks",
      level: 0,
      total: 0,
      dedupeKey: testDedupeKey(config.id),
    },
  );

  revalidatePath("/settings");
  const last = outcome.attempts[outcome.attempts.length - 1] ?? null;
  return { success: true, detail: outcome.ok ? null : (last?.error ?? "Delivery failed") };
}

/** Remove the page's webhook config (delivery log cascades). */
export async function deleteNotificationConfigAction(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const pageId = Number(formData.get("pageId"));
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return validationError("Invalid page");
  }
  await deleteNotificationConfigForPage(pageId);
  revalidatePath("/settings");
  return { success: true };
}

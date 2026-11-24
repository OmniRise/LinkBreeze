"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionError,
  type ActionResult,
  validationError,
  unauthorizedError,
  forbiddenError,
} from "@/lib/errors";
import { getCapabilitiesForUser } from "@/server/queries";
import {
  testDedupeKey,
  type NotificationProvider,
} from "@/lib/notifications/events";
import { isValidWebhookUrl } from "@/lib/notifications/url";
import {
  createNotificationConfig,
  deleteNotificationConfigForPage,
  getInstanceNotificationConfig,
  getNotificationConfigByPage,
  updateNotificationConfig,
  deleteNotificationConfig,
} from "@/server/queries/notifications";
import { deliverToWebhook } from "@/server/notifications/emit";
import {
  INSTANCE_EVENT_KINDS,
  serializeEventSubscription,
} from "@/lib/notifications/events";

/** Tri-state FormData contract: "" (present but empty) = metric off (null). */
function optionalThreshold(raw: FormDataEntryValue | null): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 1_000_000_000);
}

/**
 * #124 hardening: the whole notification surface is instance-admin-only. The
 * configured webhook URL is fetched server-side (SSRF posture in
 * DESIGN-13.md) and webhook URLs embed receiver tokens; under multi-user a
 * member could otherwise point the instance's server at an internal address
 * or exfiltrate page traffic. The settings UI already hides the Integration
 * tab from members; this closes direct action calls. Mirrors the
 * analyticsScript/customCss gate in updatePageAction (511c9b0).
 */
async function requireInstanceAdmin(
  session: { userId: number },
): Promise<ActionError | null> {
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!caps.manageInstance) {
    return forbiddenError("Only instance admins can manage webhook notifications");
  }
  return null;
}

const saveSchema = z.object({
  /** Absent = instance-wide config (subscribers/admin/updates/digest). */
  pageId: z.coerce.number().int().positive().optional(),
  url: z
    .string()
    .max(2048)
    .refine(isValidWebhookUrl, "Webhook URL must be a valid http(s) URL"),
  provider: z.enum(["discord", "slack", "telegram", "ntfy", "generic"]),
  enabled: z.enum(["true", "false"]),
  /** Checked event kinds ride as repeated `event` fields. */
});

/** Collect + validate the checked `event` checkboxes into a canonical CSV.
 * Page configs default to "milestones" (the checkbox contract predates
 * instance events); instance configs must select at least one kind. */
function eventsCsv(formData: FormData, isInstance: boolean): string | null {
  const kinds = formData
    .getAll("event")
    .map((v) => v.toString().trim())
    .filter(Boolean);
  if (kinds.length === 0) {
    return isInstance ? null : "milestones";
  }
  for (const k of kinds) {
    if (k !== "milestones" && !(INSTANCE_EVENT_KINDS as readonly string[]).includes(k)) {
      return null;
    }
  }
  return serializeEventSubscription(kinds);
}

/** Upsert the (single) webhook config for a page or the instance. Autosaved. */
export async function saveNotificationConfigAction(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return unauthorizedError();
  const gated = await requireInstanceAdmin(session);
  if (gated) return gated;

  const rawPageId = formData.get("pageId");
  const parsed = saveSchema.safeParse({
    pageId: rawPageId === null || rawPageId === "" ? undefined : rawPageId,
    url: (formData.get("url") ?? "").toString().trim(),
    provider: formData.get("provider") ?? "discord",
    enabled: formData.get("enabled") === "true" ? "true" : "false",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;
  const events = eventsCsv(formData, !d.pageId);
  if (events === null) {
    return validationError("Select at least one notification type");
  }

  const input = {
    pageId: d.pageId ?? null,
    url: d.url,
    provider: d.provider as NotificationProvider,
    events,
    enabled: d.enabled === "true",
    clicksThreshold: optionalThreshold(formData.get("clicksThreshold")),
    viewsThreshold: optionalThreshold(formData.get("viewsThreshold")),
  };

  const existing = d.pageId
    ? await getNotificationConfigByPage(d.pageId)
    : await getInstanceNotificationConfig();
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
  const session = await getSession();
  if (!session) return unauthorizedError();
  const gated = await requireInstanceAdmin(session);
  if (gated) return gated;

  const pageIdRaw = formData.get("pageId");
  const pageId =
    pageIdRaw === null || pageIdRaw === "" ? null : Number(pageIdRaw);
  if (pageId !== null && (!Number.isInteger(pageId) || pageId <= 0)) {
    return validationError("Invalid page");
  }
  const config = pageId
    ? await getNotificationConfigByPage(pageId)
    : await getInstanceNotificationConfig();
  if (!config) return validationError("Save the webhook configuration first");

  const outcome = await deliverToWebhook(
    {
      id: config.id,
      url: config.url,
      provider: config.provider as NotificationProvider,
      events: config.events,
      pageId: config.pageId,
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
  const session = await getSession();
  if (!session) return unauthorizedError();
  const gated = await requireInstanceAdmin(session);
  if (gated) return gated;

  const pageIdRaw = formData.get("pageId");
  if (pageIdRaw === null || pageIdRaw === "") {
    // Instance-wide config (pageId NULL). Delivery log cascades via FK.
    const existing = await getInstanceNotificationConfig();
    if (!existing) return validationError("No instance webhook to remove");
    await deleteNotificationConfig(existing.id);
    revalidatePath("/settings");
    return { success: true };
  }
  const pageId = Number(pageIdRaw);
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return validationError("Invalid page");
  }
  await deleteNotificationConfigForPage(pageId);
  revalidatePath("/settings");
  return { success: true };
}

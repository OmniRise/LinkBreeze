"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addSubscriber, getSetting } from "@/server/queries";
import {
  type ActionResult,
  validationError,
  rateLimitError,
} from "@/lib/errors";
import { clientIp } from "@/lib/rate-limit-ip";

const DEFAULT_CONSENT_TEXT =
  "I agree to receive emails and understand I can unsubscribe at any time.";

const subscribeSchema = z.object({
  email: z.email("Please enter a valid email").max(320),
  consent: z.string().refine((v) => v === "on" || v === "true", {
    message: "Please accept the consent checkbox to subscribe",
  }),
});

export async function subscribe(formData: FormData): Promise<ActionResult> {
  const parsed = subscribeSchema.safeParse({
    email: formData.get("email"),
    consent: (formData.get("consent") as string) || "",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid submission");
  }

  // Rate limit: 10 signups per minute per IP to prevent table-flooding.
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip = clientIp(h);
  const { rateLimit } = await import("@/lib/rate-limit");
  const rl = rateLimit(`subscribe:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return rateLimitError(60);
  }

  // Resolve the consent text from settings (falls back to default).
  const consentText =
    (await getSetting("consentText")) || DEFAULT_CONSENT_TEXT;

  try {
    await addSubscriber(parsed.data.email.toLowerCase().trim(), consentText);
  } catch {
    // Most likely a duplicate — still return success so we don't leak
    // whether an email is already subscribed.
  }

  revalidatePath("/");
  return { success: true };
}

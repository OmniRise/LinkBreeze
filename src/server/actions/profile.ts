"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  validationError,
  unauthorizedError,
} from "@/lib/errors";
import { updateProfile as updateProfileQuery, type SocialLink } from "@/server/queries";
import {
  profileCoreShape,
  socialEntrySchema,
} from "@/lib/validation/profile";


const profileSchema = z.object({
  ...profileCoreShape,
  socialLinks: z
    .string()
    .optional()
    .default("[]")
    .transform((val, ctx): SocialLink[] => {
      try {
        const parsed = JSON.parse(val || "[]");
        const result = z.array(socialEntrySchema).safeParse(parsed);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid social links data",
          });
          return z.NEVER;
        }
        return result.data;
      } catch {
        return [];
      }
    }),
});

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio") || "",
    badgeText: formData.get("badgeText") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined,
    socialLinks: formData.get("socialLinks") || "[]",
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const d = parsed.data;
  await updateProfileQuery({
    displayName: d.displayName,
    bio: d.bio,
    badgeText: d.badgeText || null,
    avatarUrl: d.avatarUrl || null,
    socialLinks: JSON.stringify(d.socialLinks),
  });

  revalidatePath("/profile");
  revalidatePath("/");
  return { success: true };
}

/**
 * /api/v1/profile (#4) — GET profile, PUT partial update.
 *
 * Same auth + rate-limit + envelope stack as /api/v1/links. Validation runs
 * on the shared profile primitives (src/lib/validation/profile.ts) — the
 * platform allowlist and field caps are the SAME rules the admin action uses.
 * PUT is tri-state like links: present key = write (null clears nullable
 * fields), absent key = unchanged; unknown keys (id, userId, ...) are
 * stripped by zod and the patch is an explicit field pick.
 */
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiGate, apiOk, apiOkConditional, apiError, parseJsonBody, ErrorCode } from "@/server/api-auth";
import { getProfile, updateProfile } from "@/server/queries";
import { profileCoreShape, socialEntrySchema } from "@/lib/validation/profile";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** API shape: socialLinks is a real array (not the action's JSON string). */
const profileApiSchema = z.object({
  ...profileCoreShape,
  socialLinks: z.array(socialEntrySchema).max(50).optional(),
});

type ProfileRowNonNull = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

function parseSocialLinks(raw: string | null): Array<{ platform: string; url: string }> {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeProfile(row: ProfileRowNonNull) {
  return {
    displayName: row.displayName,
    bio: row.bio,
    badgeText: row.badgeText,
    avatarUrl: row.avatarUrl,
    socialLinks: parseSocialLinks(row.socialLinks),
  };
}

export async function GET(request: NextRequest) {
  const gate = await apiGate(request);
  if (!gate.ok) return gate.response;

  try {
    const existing = await getProfile();
    if (!existing) {
      return apiError(ErrorCode.NOT_FOUND, "Profile not found.", 404, {
        headers: gate.rateHeaders,
      });
    }
    return apiOkConditional({ data: serializeProfile(existing) }, request, {
      headers: gate.rateHeaders,
    });
  } catch (err) {
    logError("api/v1/profile GET", err);
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await apiGate(request, { mutating: true });
  if (!gate.ok) return gate.response;

  const body = await parseJsonBody(request);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiError(ErrorCode.VALIDATION, "Request body must be a JSON object.", 400, { headers: gate.rateHeaders });
  }

  const existing = await getProfile();

  // Merge present body keys over the existing row (id never comes from the
  // body — it is not even part of the API shape), then validate the MERGED
  // result so partial edits can't produce an invalid profile.
  const bodyRecord = { ...(body as Record<string, unknown>) };
  delete bodyRecord.id;
  const candidate = existing
    ? {
        displayName: existing.displayName,
        bio: existing.bio,
        badgeText: existing.badgeText,
        avatarUrl: existing.avatarUrl,
        socialLinks: parseSocialLinks(existing.socialLinks),
      }
    : {};
  const merged: Record<string, unknown> = { ...candidate };
  for (const key of Object.keys(candidate)) {
    if (Object.prototype.hasOwnProperty.call(bodyRecord, key)) {
      merged[key] = bodyRecord[key];
    }
  }
  // New profile (none exists yet): validate the body itself — displayName is
  // required by the schema, so a partial PUT against a blank instance 400s
  // honestly instead of inserting an unnamed profile.
  const toValidate = existing ? merged : bodyRecord;

  const parsed = profileApiSchema.safeParse(toValidate);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return apiError(
      ErrorCode.VALIDATION,
      issues[0]?.message ?? "Invalid input",
      400,
      {
        details: issues.map((i: z.ZodIssue) => ({
          path: i.path.join(".") || "(root)",
          message: i.message,
        })),
        headers: gate.rateHeaders,
      },
    );
  }
  const d = parsed.data;

  try {
    const patch: Record<string, unknown> = {};
    // Writable = key present in the body; when a row already exists the key
    // must also be part of the known profile shape (mass-assignment strip).
    // With no row yet, the validated body fields ARE the insert payload.
    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(bodyRecord, key) &&
      (!existing || Object.prototype.hasOwnProperty.call(candidate, key));
    if (has("displayName")) patch.displayName = d.displayName;
    if (has("bio")) patch.bio = d.bio;
    if (has("badgeText")) patch.badgeText = d.badgeText || null;
    if (has("avatarUrl")) patch.avatarUrl = d.avatarUrl || null;
    if (has("socialLinks")) patch.socialLinks = JSON.stringify(d.socialLinks ?? []);

    if (Object.keys(patch).length === 0) {
      // Nothing writable was sent — report the current state, change nothing.
      const current = existing ?? (await getProfile());
      if (!current) {
        return apiError(ErrorCode.NOT_FOUND, "Profile not found.", 404, {
          headers: gate.rateHeaders,
        });
      }
      return apiOk(serializeProfile(current), { headers: gate.rateHeaders });
    }

    await updateProfile(patch);
    revalidatePath("/profile");
    revalidatePath("/");

    const updated = await getProfile();
    return apiOk(updated ? serializeProfile(updated) : patch, {
      headers: gate.rateHeaders,
    });
  } catch (err) {
    logError("api/v1/profile PUT", err);
    return apiError(ErrorCode.INTERNAL, "Something went wrong.", 500, { headers: gate.rateHeaders });
  }
}

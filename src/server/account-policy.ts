import { normalizeSlug, slugError } from "@/lib/link-slug";
import { getAllPages, getSetting } from "@/server/queries";

/**
 * Plain server module — NOT "use server". These helpers used to be exported
 * from actions/accounts.ts, which makes every export a public POST endpoint:
 * uniqueSlugForUsername("bob") answering "bob" vs "bob-2" let an anonymous
 * caller probe which usernames exist. Internal helpers belong in a plain
 * module so the action boundary stays explicit.
 */

/** First page slug for a new account: the username, made unique with -2/-3… */
export async function uniqueSlugForUsername(username: string): Promise<string> {
  const base = normalizeSlug(username) || "user";
  const taken = new Set((await getAllPages()).map((p) => p.slug.toLowerCase()));
  if (!taken.has(base.toLowerCase()) && !slugError(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (taken.has(candidate.toLowerCase())) continue;
    return candidate;
  }
}

/**
 * #124 2B.4 — instance page policy: 'per_user' (default) auto-creates each
 * new account's own public page; 'manual' leaves new pages to the admin.
 */
export async function accountPagePolicy(): Promise<"per_user" | "manual"> {
  const v = await getSetting("accountPagePolicy");
  return v === "manual" ? "manual" : "per_user";
}

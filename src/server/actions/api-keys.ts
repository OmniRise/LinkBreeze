"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  unauthorizedError,
  logError,
  ErrorCode,
} from "@/lib/errors";
import { createApiKey, revokeApiKey } from "@/server/api-keys";

/**
 * Generate (or rotate) the API key (#4). The plaintext is returned EXACTLY
 * once — only its sha256 hash is persisted, so nothing can ever show it
 * again. Rotating invalidates the previous key immediately.
 */
export async function generateApiKeyAction(): Promise<
  ActionResult<{ key: string; prefix: string; createdAt: string }>
> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  try {
    const created = await createApiKey();
    revalidatePath("/settings");
    return { success: true, ...created };
  } catch (err) {
    logError("generateApiKeyAction", err);
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

/** Revoke the API key — every KV row is deleted; all API calls 401 after. */
export async function revokeApiKeyAction(): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  if (!(await getSession())) return unauthorizedError();

  try {
    await revokeApiKey();
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    logError("revokeApiKeyAction", err);
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}

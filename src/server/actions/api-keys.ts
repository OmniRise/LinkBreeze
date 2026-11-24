"use server";

import { revalidatePath } from "next/cache";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  logError,
  ErrorCode,
} from "@/lib/errors";
import { createApiKey, revokeApiKey } from "@/server/api-keys";
import { requireInstanceAdmin } from "@/server/access";

/**
 * Generate (or rotate) the API key (#4). The plaintext is returned EXACTLY
 * once — only its sha256 hash is persisted, so nothing can ever show it
 * again. Rotating invalidates the previous key immediately unless a grace
 * window is requested (E.2): the old key then keeps working for 1 hour so
 * callers can migrate without downtime.
 */
export async function generateApiKeyAction(opts?: {
  keepPrevious?: boolean;
}): Promise<ActionResult<{ key: string; prefix: string; createdAt: string }>> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // GHSA-954q-vph2-prc8: the key is instance-wide — it reads/writes every
  // account's links and sections through /api/v1/* — so minting it is an
  // instance-level action. A Member's own Settings tab must not mint it.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  try {
    const created = await createApiKey({
      graceHours: opts?.keepPrevious ? 1 : 0,
    });
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
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

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

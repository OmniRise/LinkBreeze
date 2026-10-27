"use server";

import { getSession } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import { checkForUpdates, getUpdateStatus, setUpdateCheckEnabled } from "@/lib/update-check";

/**
 * Manual refresh — bypasses the 24h cache.
 */
export async function refreshUpdateCheck() {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  if (!(await getSession())) {
    throw new Error("Unauthorized");
  }
  return checkForUpdates(true);
}

/**
 * Toggle update checks on/off.
 */
export async function toggleUpdateCheck(enabled: boolean): Promise<void> {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  if (!(await getSession())) {
    throw new Error("Unauthorized");
  }
  await setUpdateCheckEnabled(enabled);
}

/**
 * Combined status for the settings update card (website + GitHub sources).
 */
export async function refreshUpdateStatus() {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  if (!(await getSession())) {
    throw new Error("Unauthorized");
  }
  return getUpdateStatus(true);
}

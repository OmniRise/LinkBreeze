"use server";

import { demoGuard } from "@/lib/demo-guard";
import { requireInstanceAdminOrThrow } from "@/server/access";
import { checkForUpdates, getUpdateStatus, setUpdateCheckEnabled } from "@/lib/update-check";

/**
 * Manual refresh — bypasses the 24h cache.
 */
export async function refreshUpdateCheck() {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  await requireInstanceAdminOrThrow();
  return checkForUpdates(true);
}

/**
 * Toggle update checks on/off.
 */
export async function toggleUpdateCheck(enabled: boolean): Promise<void> {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  await requireInstanceAdminOrThrow();
  await setUpdateCheckEnabled(enabled);
}

/**
 * Combined status for the settings update card (website + GitHub sources).
 */
export async function refreshUpdateStatus() {
  const blocked = demoGuard();
  if (blocked) throw new Error(blocked.error);
  await requireInstanceAdminOrThrow();
  return getUpdateStatus(true);
}

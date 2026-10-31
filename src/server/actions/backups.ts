"use server";

import { z } from "zod";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  conflictError,
  validationError,
  ErrorCode,
} from "@/lib/errors";
import { requireInstanceAdmin, requireInstanceAdminOrThrow } from "@/server/access";
import { updateSetting } from "@/server/queries";
import { applyBackupPayload } from "@/server/backup-restore";
import {
  dismissBackupFailureNotice,
  performBackupNow,
} from "@/server/backup-scheduler";
import { deleteBackupFile, readBackupFile } from "@/lib/backup-store";
import { acquireBackupLock, releaseBackupLock } from "@/lib/backup-lock";
import {
  BACKUP_FILENAME_RE,
  BACKUP_SETTING_KEYS,
  isBackupFrequency,
  parseTimeOfDay,
} from "@/lib/backup-schedule";

/**
 * Scheduled-backup settings + stored-backup actions (#83).
 *
 * Error strings are English literals — the stable wire contract mapped to
 * i18n keys in lib/action-error-i18n.ts (same as every other action).
 */

const frequencySchema = z
  .string()
  .refine(isBackupFrequency, "Choose a valid backup frequency");

const timeOfDaySchema = z
  .string()
  .refine((v) => parseTimeOfDay(v) !== null, "Enter a valid time of day");

const retentionSchema = z
  .number()
  .int("Backup retention must be a whole number")
  .min(1, "Backup retention must be between 1 and 52")
  .max(52, "Backup retention must be between 1 and 52");

/** Autosave target for the Backups card — every field, every save. */
export async function saveBackupSettings(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const enabled = formData.get("backupEnabled") === "on";
  const frequency = String(formData.get("backupFrequency") ?? "");
  const timeOfDay = String(formData.get("backupTimeOfDay") ?? "");
  const retention = Number(formData.get("backupRetention"));

  const parsedFrequency = frequencySchema.safeParse(frequency);
  if (!parsedFrequency.success) {
    return validationError(parsedFrequency.error.issues[0].message);
  }
  const parsedTime = timeOfDaySchema.safeParse(timeOfDay);
  if (!parsedTime.success) {
    return validationError(parsedTime.error.issues[0].message);
  }
  const parsedRetention = retentionSchema.safeParse(retention);
  if (!parsedRetention.success) {
    return validationError(parsedRetention.error.issues[0].message);
  }

  await updateSetting(BACKUP_SETTING_KEYS.enabled, enabled ? "true" : "false");
  await updateSetting(BACKUP_SETTING_KEYS.frequency, parsedFrequency.data);
  await updateSetting(BACKUP_SETTING_KEYS.timeOfDay, timeOfDay);
  await updateSetting(BACKUP_SETTING_KEYS.retention, String(retention));

  return { success: true };
}

/** "Run now" — forces a backup outside the schedule. */
export async function runBackupNow(): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const res = await performBackupNow();
  if (!res.ok) {
    if (res.code === "busy") {
      return conflictError("A backup or restore is already in progress");
    }
    if (res.code === "disk_full") {
      return validationError("Not enough free disk space to write a backup");
    }
    return {
      success: false,
      error: "Backup failed — see server logs",
      errorCode: ErrorCode.INTERNAL,
    };
  }
  return { success: true };
}

/** Restore a stored scheduled backup by filename. Shares the exact
 *  transactional path with the manual upload restore. */
export async function restoreScheduledBackup(
  filename: string,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  if (!BACKUP_FILENAME_RE.test(filename)) {
    return validationError("Invalid backup filename");
  }

  const json = await readBackupFile(filename);
  if (json === null) {
    return validationError("Backup file not found");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return validationError("Invalid JSON file");
  }

  // Same mutual exclusion as scheduled runs: never restore while a backup
  // runs, never let a scheduled backup start mid-restore.
  if (!acquireBackupLock()) {
    return conflictError("A backup or restore is already in progress");
  }
  try {
    return await applyBackupPayload(parsed);
  } finally {
    releaseBackupLock();
  }
}

/** Delete one stored backup. */
export async function deleteStoredBackup(
  formData: FormData,
): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const filename = String(formData.get("filename") ?? "");
  if (!BACKUP_FILENAME_RE.test(filename)) {
    return validationError("Invalid backup filename");
  }
  const deleted = await deleteBackupFile(filename);
  if (!deleted) {
    return validationError("Backup file not found");
  }
  return { success: true };
}

/** Dismiss the dashboard backup-failure notice. */
export async function dismissBackupNotice(): Promise<void> {
  // Hiding a "backups are failing" signal is a settings mutation — keep it
  // session-gated even though the caller is only flipping a flag.
  await requireInstanceAdminOrThrow();
  await dismissBackupFailureNotice();
}

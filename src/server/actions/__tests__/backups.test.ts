import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demoBlock: vi.fn(() => null as null | { success: false }),
  getSession: vi.fn(async () => ({ userId: 1 })),
  updateSetting: vi.fn(async () => {}),
  performBackupNow: vi.fn(),
  dismissBackupFailureNotice: vi.fn(async () => {}),
  readBackupFile: vi.fn(),
  deleteBackupFile: vi.fn(),
  applyBackupPayload: vi.fn(),
  acquireBackupLock: vi.fn(() => true),
  releaseBackupLock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/demo", () => ({
  demoBlock: mocks.demoBlock,
}));

vi.mock("@/server/queries", () => ({
  // #124 2B: capability gate (access.ts) resolves the session's role ROW.
  getCapabilitiesForUser: vi.fn(async (): Promise<{ roleText: string; caps: { pagesLimit: number | null; visibility: string; manageAccounts: boolean; manageInstance: boolean } }> => ({
    roleText: "admin",
    caps: { pagesLimit: null, visibility: "manage_all", manageAccounts: true, manageInstance: true },
  })),
  updateSetting: mocks.updateSetting,
}));

vi.mock("@/server/backup-scheduler", () => ({
  performBackupNow: mocks.performBackupNow,
  dismissBackupFailureNotice: mocks.dismissBackupFailureNotice,
}));

vi.mock("@/lib/backup-store", () => ({
  readBackupFile: mocks.readBackupFile,
  deleteBackupFile: mocks.deleteBackupFile,
}));

vi.mock("@/lib/backup-lock", () => ({
  acquireBackupLock: mocks.acquireBackupLock,
  releaseBackupLock: mocks.releaseBackupLock,
}));

vi.mock("@/server/backup-restore", () => ({
  applyBackupPayload: mocks.applyBackupPayload,
}));

import {
  deleteStoredBackup,
  restoreScheduledBackup,
  runBackupNow,
  saveBackupSettings,
} from "@/server/actions/backups";

describe("saveBackupSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists all four settings on a valid save", async () => {
    const fd = new FormData();
    fd.set("backupEnabled", "on");
    fd.set("backupFrequency", "weekly");
    fd.set("backupTimeOfDay", "04:30");
    fd.set("backupRetention", "12");

    const res = await saveBackupSettings(fd);

    expect(res).toEqual({ success: true });
    expect(mocks.updateSetting).toHaveBeenCalledTimes(4);
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(1, "backupEnabled", "true");
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(2, "backupFrequency", "weekly");
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(3, "backupTimeOfDay", "04:30");
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(4, "backupRetentionCount", "12");
  });

  it("reads an absent checkbox as disabled", async () => {
    const fd = new FormData();
    fd.set("backupFrequency", "daily");
    fd.set("backupTimeOfDay", "03:00");
    fd.set("backupRetention", "7");

    const res = await saveBackupSettings(fd);

    expect(res).toEqual({ success: true });
    expect(mocks.updateSetting).toHaveBeenNthCalledWith(1, "backupEnabled", "false");
  });

  it("rejects an invalid frequency without persisting anything", async () => {
    const fd = new FormData();
    fd.set("backupFrequency", "hourly");
    fd.set("backupTimeOfDay", "03:00");
    fd.set("backupRetention", "7");

    const res = await saveBackupSettings(fd);

    expect(res.success).toBe(false);
    expect(res).toMatchObject({ error: "Choose a valid backup frequency" });
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it("rejects a malformed time of day", async () => {
    const fd = new FormData();
    fd.set("backupFrequency", "daily");
    fd.set("backupTimeOfDay", "25:99");
    fd.set("backupRetention", "7");

    const res = await saveBackupSettings(fd);

    expect(res).toMatchObject({ success: false, error: "Enter a valid time of day" });
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it("rejects retention outside 1–52", async () => {
    const fd = new FormData();
    fd.set("backupFrequency", "daily");
    fd.set("backupTimeOfDay", "03:00");
    fd.set("backupRetention", "0");

    const res = await saveBackupSettings(fd);

    expect(res).toMatchObject({
      success: false,
      error: "Backup retention must be between 1 and 52",
    });
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it("blocks demo mode before auth", async () => {
    mocks.demoBlock.mockReturnValueOnce({
      success: false,
    } as never);
    const res = await saveBackupSettings(new FormData());
    expect(res.success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });
});

describe("runBackupNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when the forced backup ran", async () => {
    mocks.performBackupNow.mockResolvedValueOnce({ ok: true, code: "ok" });
    const res = await runBackupNow();
    expect(res).toEqual({ success: true });
  });

  it("maps a busy lock to a conflict error", async () => {
    mocks.performBackupNow.mockResolvedValueOnce({ ok: false, code: "busy" });
    const res = await runBackupNow();
    expect(res).toMatchObject({
      success: false,
      error: "A backup or restore is already in progress",
    });
  });

  it("maps a disk-full refusal to a validation error", async () => {
    mocks.performBackupNow.mockResolvedValueOnce({ ok: false, code: "disk_full" });
    const res = await runBackupNow();
    expect(res).toMatchObject({
      success: false,
      error: "Not enough free disk space to write a backup",
    });
  });
});

describe("restoreScheduledBackup", () => {
  const NAME = "linkbreeze-backup-20261018T030000.json";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects names outside the strict pattern", async () => {
    const res = await restoreScheduledBackup("../../etc/passwd");
    expect(res).toMatchObject({ success: false, error: "Invalid backup filename" });
    expect(mocks.readBackupFile).not.toHaveBeenCalled();
  });

  it("reports a missing backup file", async () => {
    mocks.readBackupFile.mockResolvedValueOnce(null);
    const res = await restoreScheduledBackup(NAME);
    expect(res).toMatchObject({ success: false, error: "Backup file not found" });
    expect(mocks.applyBackupPayload).not.toHaveBeenCalled();
  });

  it("applies a valid stored backup under the lock", async () => {
    mocks.readBackupFile.mockResolvedValueOnce(JSON.stringify({ version: 1 }));
    mocks.applyBackupPayload.mockResolvedValueOnce({ success: true });

    const res = await restoreScheduledBackup(NAME);

    expect(res).toEqual({ success: true });
    expect(mocks.acquireBackupLock).toHaveBeenCalled();
    expect(mocks.applyBackupPayload).toHaveBeenCalledWith({ version: 1 });
    expect(mocks.releaseBackupLock).toHaveBeenCalled();
  });

  it("releases the lock even when the apply fails", async () => {
    mocks.readBackupFile.mockResolvedValueOnce(JSON.stringify({ version: 1 }));
    mocks.applyBackupPayload.mockResolvedValueOnce({
      success: false,
      error: "Not a valid LinkBreeze backup",
      errorCode: "validation",
    });

    await restoreScheduledBackup(NAME);

    expect(mocks.releaseBackupLock).toHaveBeenCalled();
  });

  it("refuses to restore while a backup is running", async () => {
    mocks.readBackupFile.mockResolvedValueOnce("{}");
    mocks.acquireBackupLock.mockReturnValueOnce(false);

    const res = await restoreScheduledBackup(NAME);

    expect(res).toMatchObject({
      success: false,
      error: "A backup or restore is already in progress",
    });
    expect(mocks.applyBackupPayload).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON in a stored file", async () => {
    mocks.readBackupFile.mockResolvedValueOnce("{not json");
    const res = await restoreScheduledBackup(NAME);
    expect(res).toMatchObject({ success: false, error: "Invalid JSON file" });
  });
});

describe("deleteStoredBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a valid backup file", async () => {
    mocks.deleteBackupFile.mockResolvedValueOnce(true);
    const fd = new FormData();
    fd.set("filename", "linkbreeze-backup-20261018T030000.json");

    const res = await deleteStoredBackup(fd);

    expect(res).toEqual({ success: true });
    expect(mocks.deleteBackupFile).toHaveBeenCalledWith(
      "linkbreeze-backup-20261018T030000.json",
    );
  });

  it("rejects invalid names and missing files", async () => {
    const fd = new FormData();
    fd.set("filename", "nope.json");
    expect(await deleteStoredBackup(fd)).toMatchObject({ success: false });

    const fd2 = new FormData();
    fd2.set("filename", "linkbreeze-backup-20261018T030000.json");
    mocks.deleteBackupFile.mockResolvedValueOnce(false);
    expect(await deleteStoredBackup(fd2)).toMatchObject({
      success: false,
      error: "Backup file not found",
    });
  });
});

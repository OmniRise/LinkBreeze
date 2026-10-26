"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Database, Download, Upload, Trash2, Save } from "lucide-react";
import {
  restoreBackup,
  clearAnalytics,
  setRetention,
} from "@/server/actions/data";
import { toggleUpdateCheck } from "@/server/actions/update-check";
import { setAbAutoPromote } from "@/server/actions/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DataManager({
  retentionDays,
  updateCheckEnabled,
  abAutoPromoteEnabled,
}: {
  retentionDays: string;
  updateCheckEnabled: boolean;
  /** #81 E.1: global auto-promotion for significant A/B tests (default off). */
  abAutoPromoteEnabled: boolean;
}) {
  const t = useTranslations("settings.data");
  const tErr = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [restorePending, setRestorePending] = React.useState(false);
  const [restoreMsg, setRestoreMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [clearPending, setClearPending] = React.useState(false);
  const [clearMsg, setClearMsg] = React.useState<string | null>(null);
  const [clearOpen, setClearOpen] = React.useState(false);
  const [retention, setRetentionValue] = React.useState(retentionDays || "");
  const [retentionPending, startRetentionTransition] = React.useTransition();
  const [retentionSaved, setRetentionSaved] = React.useState(false);

  const handleRestoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;
    setRestorePending(true);
    setRestoreMsg(null);
    setPendingFile(null);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await restoreBackup(fd);
      setRestoreMsg(
        res.success
          ? { ok: true, text: t("backupRestored") }
          : { ok: false, text: localizeActionError(tErr, res.error) },
      );
      if (res.success) router.refresh();
    } catch {
      setRestoreMsg({ ok: false, text: t("restoreFailed") });
    } finally {
      setRestorePending(false);
    }
  };

  const handleClear = async () => {
    setClearOpen(false);
    setClearPending(true);
    setClearMsg(null);
    try {
      const res = await clearAnalytics();
      setClearMsg(res.success ? t("analyticsCleared") : localizeActionError(tErr, res.error));
      if (res.success) router.refresh();
    } catch {
      setClearMsg("Failed to clear analytics.");
    } finally {
      setClearPending(false);
    }
  };

  const handleRetention = (formData: FormData) => {
    formData.set("retention", retention || "0");
    startRetentionTransition(async () => {
      await setRetention(formData);
      setRetentionSaved(true);
      setTimeout(() => setRetentionSaved(false), 2000);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5" />{t("data")}</CardTitle>
        <CardDescription>{t("retentionHint2")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/api/backup"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Download className="size-4" />{t("exportBackup")}</Link>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
              <Upload className="size-4" />
              {restorePending ? t("restoring") : t("restoreBackup")}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleRestoreChange}
                disabled={restorePending}
              />
            </label>
          </div>
          {restoreMsg ? (
            <p className={restoreMsg.ok ? "text-sm text-success" : "text-sm text-destructive"}>
              {restoreMsg.text}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setClearOpen(true)}
            disabled={clearPending}
            className="w-fit text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {clearPending ? t("clearing") : t("clearAllAnalytics")}
          </Button>
          {clearMsg ? (
            <p className={clearMsg.includes("cleared") ? "text-sm text-success" : "text-sm text-destructive"}>
              {clearMsg}
            </p>
          ) : null}
        </div>

        <form action={handleRetention} className="flex flex-col gap-2">
          <Label htmlFor="retention">{t("retentionLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="retention"
              type="number"
              min={0}
              value={retention}
              onChange={(e) => setRetentionValue(e.target.value)}
              placeholder={t("keepForeverHint")}
              className="max-w-48"
            />
            <Button type="submit" variant="outline" disabled={retentionPending}>
              <Save className="size-4" />
              {retentionPending ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("retentionHint")}
          </p>
          {retentionSaved ? (
            <p className="text-sm text-success">{tCommon("saved")}</p>
          ) : null}
        </form>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">{t("updateNotifications")}</p>
            <p className="text-xs text-muted-foreground">{t("checkReleases")}</p>
          </div>
          <label htmlFor="update-check" className="relative inline-flex cursor-pointer items-center">
            <input
              id="update-check"
              type="checkbox"
              role="switch"
              aria-label={t("updateNotifications")}
              className="peer sr-only"
              defaultChecked={updateCheckEnabled}
              onChange={async (e) => {
                await toggleUpdateCheck(e.target.checked);
                router.refresh();
              }}
            />
            <div className="peer h-5 w-9 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:size-4 after:rounded-full after:bg-foreground after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* #81 E.1: auto-promotion of significant A/B tests (settings KV,
            default OFF — opted-in automation only). Same switch pattern as
            update notifications above. */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">{t("abAutoPromote")}</p>
            <p className="text-xs text-muted-foreground">{t("abAutoPromoteHint")}</p>
          </div>
          <label htmlFor="ab-auto-promote" className="relative inline-flex cursor-pointer items-center">
            <input
              id="ab-auto-promote"
              type="checkbox"
              role="switch"
              aria-label={t("abAutoPromote")}
              className="peer sr-only"
              defaultChecked={abAutoPromoteEnabled}
              onChange={async (e) => {
                const fd = new FormData();
                fd.set("abAutoPromote", e.target.checked ? "on" : "off");
                await setAbAutoPromote(fd);
                router.refresh();
              }}
            />
            <div className="peer h-5 w-9 rounded-full bg-muted transition-colors after:absolute after:left-[2px] after:top-[2px] after:size-4 after:rounded-full after:bg-foreground after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4" />
          </label>
        </div>
      </CardContent>

      {/* Restore confirmation */}
      <Dialog open={pendingFile !== null} onOpenChange={(open) => { if (!open) setPendingFile(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("restoreTitle")}</DialogTitle>
            <DialogDescription>{t("restoreWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPendingFile(null)}>{t("cancel")}</Button>
            <Button variant="destructive" type="button" onClick={confirmRestore}>{t("restore")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear analytics confirmation */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("clearAnalyticsTitle")}</DialogTitle>
            <DialogDescription>{t("clearWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setClearOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" type="button" onClick={handleClear}>{t("clear")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

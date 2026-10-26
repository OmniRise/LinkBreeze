"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useAutosavedForm, useSavedAction } from "@/hooks/use-saved-action";
import {
  deleteNotificationConfigAction,
  saveNotificationConfigAction,
  sendTestNotificationAction,
} from "@/server/actions/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NotificationConfigRow, NotificationDeliveryRow } from "@/server/queries/notifications";

const PROVIDERS = ["discord", "slack", "telegram", "ntfy"] as const;

// Scoped color-scheme + token styling: the app sets no global color-scheme,
// so a bare <select> renders UA-white in BOTH themes (see backups-card).
const selectClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export interface NotificationsCardProps {
  pageId: number;
  initialConfig: NotificationConfigRow | null;
  initialDeliveries: NotificationDeliveryRow[];
}

/**
 * Webhook notifications card (Settings - Integration, per page).
 * One config per page, autosaved (useAutosavedForm: every input schedules,
 * the flush submits the form's live DOM values). The test button fires a
 * sample event through the real delivery pipeline; the delivery log is
 * server-fetched and refreshed by the actions' revalidatePath.
 */
export function NotificationsCard({
  pageId,
  initialConfig,
  initialDeliveries,
}: NotificationsCardProps) {
  const t = useTranslations("settings.notifications");
  const tErr = useTranslations("errors");
  const savedAction = useSavedAction();

  const [testState, setTestState] = React.useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "ok" } | { kind: "failed"; detail: string }
  >({ kind: "idle" });
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const submit = React.useCallback(
    (fd: FormData) => {
      setSaveError(null);
      void savedAction.run(saveNotificationConfigAction, fd).then((res) => {
        if (!res.success) setSaveError(localizeActionError(tErr, res.error));
      });
    },
    [savedAction, tErr],
  );

  const { formRef, schedule, status } = useAutosavedForm(submit);

  const handleTest = async () => {
    if (testState.kind === "sending") return;
    // Persist whatever is on screen first, then test the SAVED config.
    formRef.current?.requestSubmit();
    setTestState({ kind: "sending" });
    const fd = new FormData();
    fd.set("pageId", String(pageId));
    const res = await savedAction.run(sendTestNotificationAction, fd);
    if (!res.success) {
      setTestState({ kind: "failed", detail: localizeActionError(tErr, res.error) });
    } else if (res.detail) {
      setTestState({ kind: "failed", detail: res.detail });
    } else {
      setTestState({ kind: "ok" });
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    const fd = new FormData();
    fd.set("pageId", String(pageId));
    const res = await savedAction.run(deleteNotificationConfigAction, fd);
    if (!res.success) setDeleteError(localizeActionError(tErr, res.error));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="pageId" value={pageId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="lb-webhook-url" className="text-sm font-medium">
              {t("url")}
            </label>
            <input
              id="lb-webhook-url"
              name="url"
              type="url"
              required
              defaultValue={initialConfig?.url ?? ""}
              placeholder="https://discord.com/api/webhooks/..."
              className={inputClasses}
              onChange={() => schedule()}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lb-webhook-provider" className="text-sm font-medium">
                {t("provider")}
              </label>
              <select
                id="lb-webhook-provider"
                name="provider"
                defaultValue={initialConfig?.provider ?? "discord"}
                className={selectClasses}
                onChange={() => schedule()}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p} className="bg-background text-foreground">
                    {p === "discord"
                      ? t("providerDiscord")
                      : p === "slack"
                        ? t("providerSlack")
                        : p === "telegram"
                          ? t("providerTelegram")
                          : t("providerNtfy")}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="lb-webhook-enabled"
                name="enabled"
                type="checkbox"
                value="true"
                defaultChecked={initialConfig ? initialConfig.enabled : true}
                className="size-4 accent-[var(--primary,theme(colors.violet.500))]"
                onChange={() => schedule()}
              />
              <label htmlFor="lb-webhook-enabled" className="text-sm font-medium">
                {t("enabled")}
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lb-webhook-clicks" className="text-sm font-medium">
                {t("clicksThreshold")}
              </label>
              <input
                id="lb-webhook-clicks"
                name="clicksThreshold"
                type="number"
                min={1}
                step={1}
                defaultValue={initialConfig?.clicksThreshold ?? ""}
                placeholder="100"
                className={inputClasses}
                onChange={() => schedule()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lb-webhook-views" className="text-sm font-medium">
                {t("viewsThreshold")}
              </label>
              <input
                id="lb-webhook-views"
                name="viewsThreshold"
                type="number"
                min={1}
                step={1}
                defaultValue={initialConfig?.viewsThreshold ?? ""}
                placeholder="1000"
                className={inputClasses}
                onChange={() => schedule()}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("thresholdHint")}</p>

          {saveError ? (
            <span className="text-xs text-destructive" role="alert">
              {saveError}
            </span>
          ) : null}

          {/* Autosave status: idle | saving | saved (~2s) */}
          <p aria-live="polite" className="h-4 text-xs text-muted-foreground">
            {status === "saving" ? t("saving") : status === "saved" ? t("saved") : ""}
          </p>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testState.kind === "sending"}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {testState.kind === "sending" ? t("testing") : t("sendTest")}
          </button>
          {initialConfig ? (
            <button
              type="button"
              onClick={handleDelete}
              className="text-sm font-medium text-destructive underline-offset-2 hover:underline"
            >
              {t("delete")}
            </button>
          ) : null}
        </div>
        {testState.kind === "ok" ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t("testOk")}
          </span>
        ) : null}
        {testState.kind === "failed" ? (
          <span className="text-xs text-destructive" role="alert">
            {t("testFailed")} {testState.detail}
          </span>
        ) : null}
        {deleteError ? (
          <span className="text-xs text-destructive" role="alert">
            {deleteError}
          </span>
        ) : null}

        {/* Delivery log (read-only, newest first) */}
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{t("deliveryLog")}</p>
          {initialDeliveries.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("deliveryEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {initialDeliveries.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-2 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <span
                    className={
                      d.status === "success"
                        ? "font-medium text-emerald-600 dark:text-emerald-400"
                        : d.status === "failed"
                          ? "font-medium text-destructive"
                          : "font-medium text-muted-foreground"
                    }
                  >
                    {d.status === "success"
                      ? t("statusSuccess")
                      : d.status === "failed"
                        ? t("statusFailed")
                        : t("statusPending")}
                  </span>
                  <span className="text-muted-foreground">
                    {d.createdAt} - {t("attempt", { count: d.attempt })}
                    {d.httpStatus !== null ? ` - HTTP ${d.httpStatus}` : ""}
                  </span>
                  {d.error ? (
                    <span className="text-muted-foreground">- {d.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

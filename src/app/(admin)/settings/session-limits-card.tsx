"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Hourglass } from "lucide-react";

import { localizeActionError } from "@/lib/action-error-i18n";
import { useSavedAction } from "@/hooks/use-saved-action";
import { saveSessionLimitsAction } from "@/server/actions/settings";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Global session lifetime defaults (Settings → Security, #124 follow-up).
 * Empty field = the built-in default (idle 7 days, absolute 90 days).
 * Per-role and per-user overrides layer on top of these.
 */
export function SessionLimitsCard({
  globalIdleMinutes,
  globalMaxHours,
}: {
  globalIdleMinutes: string;
  globalMaxHours: string;
}) {
  const t = useTranslations("settings.session");
  const tErr = useTranslations("errors");
  const savedAction = useSavedAction();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await savedAction.run(
        saveSessionLimitsAction as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string }>,
        fd,
      );
      if (res.success) setSaved(true);
      else setError(localizeActionError(tErr, (res as { error: string }).error));
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Hourglass className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">{t("title")}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap gap-3">
        <FormField label={t("idleMinutes")} htmlFor="session-idle">
          <Input
            id="session-idle"
            name="sessionIdleMinutes"
            type="number"
            min={1}
            defaultValue={globalIdleMinutes}
            placeholder={t("placeholderDefault")}
            autoComplete="off"
            className="max-w-40"
          />
        </FormField>
        <FormField label={t("maxHours")} htmlFor="session-max">
          <Input
            id="session-max"
            name="sessionMaxHours"
            type="number"
            min={1}
            defaultValue={globalMaxHours}
            placeholder={t("placeholderDefault")}
            autoComplete="off"
            className="max-w-40"
          />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-emerald-500">
          {t("saved")}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

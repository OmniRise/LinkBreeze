"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Loader2 } from "lucide-react";

import { localizeActionError } from "@/lib/action-error-i18n";
import { useSavedAction } from "@/hooks/use-saved-action";
import { saveOidcSettingsAction } from "@/server/actions/oidc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SuccessToast } from "@/components/ui/success-toast";

/**
 * OIDC SSO settings (#124 3.6): issuer + client id live in the settings KV;
 * the client secret is env-only (OIDC_CLIENT_SECRET) and shown as a presence
 * indicator, never an input — a secret in the KV would leak verbatim into
 * every unencrypted backup file.
 */
const SELECT_CLASSES =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]";

export function OidcCard({
  issuer,
  clientId,
  jit,
  mode,
  secretSet,
}: {
  issuer: string;
  clientId: string;
  jit: boolean;
  mode: "optional" | "replaces_local";
  secretSet: boolean;
}) {
  const t = useTranslations("settings.oidc");
  const tCommon = useTranslations("common");
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
        saveOidcSettingsAction as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string }>,
        fd,
      );
      if (res.success) {
        setSaved(true);
      } else {
        setError(localizeActionError(tErr, (res as { error: string }).error));
      }
    });
  };

  return (
    <Card>
      {saved && <SuccessToast message={tCommon("saved")} onDismiss={() => setSaved(false)} />}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <FormField label={t("issuer")} htmlFor="oidc-issuer" hint={t("issuerHint")}>
            <Input
              id="oidc-issuer"
              name="issuer"
              defaultValue={issuer}
              placeholder="https://idp.example.com"
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>

          <FormField label={t("clientId")} htmlFor="oidc-client-id">
            <Input
              id="oidc-client-id"
              name="clientId"
              defaultValue={clientId}
              autoComplete="off"
              spellCheck={false}
              className="max-w-sm"
            />
          </FormField>

          <div
            className={`flex items-center gap-2 rounded-lg border border-border p-3 text-sm ${secretSet ? "text-muted-foreground" : "border-destructive/40 text-destructive"}`}
          >
            <KeyRound className="size-4 shrink-0" aria-hidden />
            {secretSet ? t("secretSet") : t("secretMissing")}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="jit" defaultChecked={jit} className="size-4" />
            {t("jit")}
          </label>

          <FormField label={t("mode")} htmlFor="oidc-mode">
            <select id="oidc-mode" name="mode" defaultValue={mode} className={SELECT_CLASSES}>
              <option value="optional" className="bg-background text-foreground">
                {t("modeOptional")}
              </option>
              <option value="replaces_local" className="bg-background text-foreground">
                {t("modeReplaces")}
              </option>
            </select>
          </FormField>

          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {tCommon("saving")}
                </>
              ) : (
                tCommon("save")
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

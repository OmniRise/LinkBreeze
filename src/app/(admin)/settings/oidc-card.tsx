"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  KeyRound,
  Loader2,
  Plus,
} from "lucide-react";

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
  groupClaim,
  noGroupMatch,
  groupRoleMap,
  claimUsername,
  claimEmail,
  claimName,
  claimFallback,
  roles,
}: {
  issuer: string;
  clientId: string;
  jit: boolean;
  mode: "optional" | "replaces_local";
  secretSet: boolean;
  groupClaim: string;
  noGroupMatch: "default_role" | "refuse";
  groupRoleMap: string;
  claimUsername: string;
  claimEmail: string;
  claimName: string;
  claimFallback: boolean;
  roles: { id: number; name: string }[];
}) {
  const t = useTranslations("settings.oidc");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const savedAction = useSavedAction();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const initialMap: { group: string; roleId: number }[] = React.useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(groupRoleMap);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is { group: string; roleId: number } =>
          typeof e === "object" && e !== null &&
          typeof (e as { group?: unknown }).group === "string" &&
          typeof (e as { roleId?: unknown }).roleId === "number",
      );
    } catch {
      return [];
    }
  }, [groupRoleMap]);
  const [mapRows, setMapRows] = React.useState<{ group: string; roleId: number }[]>(initialMap);
  // Reset local rows when the server value changes after a save (render-time
  // reconciliation — setState-in-effect trips the cascading-render rule).
  const [syncedMap, setSyncedMap] = React.useState(initialMap);
  if (syncedMap !== initialMap) {
    setSyncedMap(initialMap);
    setMapRows(initialMap);
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // The editor keeps the rows in state; serialize them for the action.
    fd.set("groupRoleMap", JSON.stringify(mapRows.filter((r) => r.group.trim() !== "")));
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

          {/* ── Claim customization ──────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("claimsTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("claimsHint")}</p>
            {claimFallback && (
              <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                {t("claimsFallbackFlag")}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label={t("claimUsername")} htmlFor="oidc-claim-username">
                <Input
                  id="oidc-claim-username"
                  name="claimUsername"
                  defaultValue={claimUsername}
                  placeholder="preferred_username"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
              <FormField label={t("claimEmail")} htmlFor="oidc-claim-email">
                <Input
                  id="oidc-claim-email"
                  name="claimEmail"
                  defaultValue={claimEmail}
                  placeholder="email"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
              <FormField label={t("claimName")} htmlFor="oidc-claim-name">
                <Input
                  id="oidc-claim-name"
                  name="claimName"
                  defaultValue={claimName}
                  placeholder="name"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>
            </div>
          </div>

          {/* ── Group → role mapping ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <FormField
              label={t("groupClaim")}
              htmlFor="oidc-group-claim"
              hint={t("groupClaimHint")}
            >
              <Input
                id="oidc-group-claim"
                name="groupClaim"
                defaultValue={groupClaim}
                autoComplete="off"
                spellCheck={false}
                className="max-w-xs"
              />
            </FormField>

            <p className="text-sm font-medium">{t("groupMapTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("groupMapHint")}</p>
            {mapRows.length > 0 && (
              <div className="flex flex-col gap-2">
                {mapRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={row.group}
                      onChange={(e) =>
                        setMapRows((rows) => rows.map((r, j) => (j === i ? { ...r, group: e.target.value } : r)))
                      }
                      aria-label={t("groupMapGroup")}
                      placeholder={t("groupMapGroup")}
                      autoComplete="off"
                      spellCheck={false}
                      className="max-w-48"
                    />
                    <span aria-hidden className="text-xs text-muted-foreground">→</span>
                    <select
                      value={row.roleId}
                      onChange={(e) =>
                        setMapRows((rows) => rows.map((r, j) => (j === i ? { ...r, roleId: Number(e.target.value) } : r)))
                      }
                      aria-label={t("groupMapRole")}
                      className={SELECT_CLASSES}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id} className="bg-background text-foreground">
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMapRows((rows) => rows.filter((_, j) => j !== i))}
                      aria-label={t("groupMapRemove")}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMapRows((rows) => [...rows, { group: "", roleId: roles[0]?.id ?? 0 }])
                }
                disabled={roles.length === 0}
              >
                <Plus className="size-3.5" aria-hidden />
                {t("groupMapAdd")}
              </Button>
            </div>

            <FormField label={t("noGroupMatch")} htmlFor="oidc-no-group-match">
              <select
                id="oidc-no-group-match"
                name="noGroupMatch"
                defaultValue={noGroupMatch}
                className={SELECT_CLASSES}
              >
                <option value="default_role" className="bg-background text-foreground">
                  {t("noMatchDefault")}
                </option>
                <option value="refuse" className="bg-background text-foreground">
                  {t("noMatchRefuse")}
                </option>
              </select>
            </FormField>
          </div>

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

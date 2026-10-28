"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRoundX,
} from "lucide-react";

import { localizeActionError } from "@/lib/action-error-i18n";
import { useSavedAction } from "@/hooks/use-saved-action";
import type { AccountSummary } from "@/server/actions/accounts";
import {
  createAccountAction,
  deleteAccountAction,
  setAccountRoleAction,
  setAccountStatusAction,
} from "@/server/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ErrorBanner } from "@/components/ui/error-banner";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

/**
 * Accounts manager (#124): the admin list of sign-in accounts, a create form,
 * per-account enable/disable + role toggle, and a delete dialog that offers to
 * release the owned page's slug. All mutations go through the admin-gated
 * server actions in `@/server/actions/accounts`.
 *
 * The page slug lives on the row (`pageSlug`) because the delete dialog needs
 * it to explain what the "release slug" checkbox will free up.
 */

const SELECT_CLASSES =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]";

interface DeleteTarget {
  account: AccountSummary;
}

export function AccountsManager({
  accounts,
  currentUserId,
}: {
  accounts: AccountSummary[];
  currentUserId: number;
}) {
  const t = useTranslations("accounts");
  const tErr = useTranslations("errors");
  const savedAction = useSavedAction();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [releaseSlug, setReleaseSlug] = React.useState(false);

  const runAction = (
    action: (...args: never[]) => Promise<{ success: boolean; error?: string }>,
    ...args: unknown[]
  ) => {
    setError(null);
    startTransition(async () => {
      const res = await savedAction.run(action, ...args);
      if (!res.success) {
        setError(localizeActionError(tErr, (res as { error: string }).error));
      }
    });
  };

  const runForm = (
    action: (formData: FormData) => Promise<{ success: boolean; error?: string }>,
    formData: FormData,
  ) => runAction(action as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string }>, formData);

  const openDelete = (account: AccountSummary) => {
    setDeleteTarget({ account });
    setReleaseSlug(false);
    setError(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("userId", String(deleteTarget.account.id));
    fd.set("releaseSlug", releaseSlug ? "on" : "off");
    if (releaseSlug && deleteTarget.account.pageSlug) {
      fd.set("slug", deleteTarget.account.pageSlug);
    }
    setDeleteTarget(null);
    runForm(deleteAccountAction, fd);
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* ── Create account ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            {t("createTitle")}
          </CardTitle>
          <CardDescription>{t("createDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              runForm(createAccountAction, fd);
              form.reset();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <FormField label={t("createUsername")} htmlFor="new-username">
              <Input
                id="new-username"
                name="username"
                autoComplete="off"
                spellCheck={false}
                required
                className="w-56"
              />
            </FormField>
            <FormField
              label={t("createPassword")}
              htmlFor="new-password"
              hint={t("createPasswordHint")}
            >
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="w-56"
              />
            </FormField>
            <FormField label={t("createRole")} htmlFor="new-role">
              <select id="new-role" name="role" defaultValue="owner" className={SELECT_CLASSES}>
                <option value="owner" className="bg-background text-foreground">
                  {t("roleOwner")}
                </option>
                <option value="admin" className="bg-background text-foreground">
                  {t("roleAdmin")}
                </option>
              </select>
            </FormField>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("creating")}
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden />
                  {t("createSubmit")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Account list ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}

          {accounts.map((a) => {
            const isSelf = a.id === currentUserId;
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex min-w-40 flex-col">
                  <span className="text-sm font-medium">{a.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.pageSlug ? `/${a.pageSlug}` : t("noPage")}
                  </span>
                </div>

                <Badge variant={a.role === "admin" ? "default" : "outline"}>
                  {a.role === "admin" ? (
                    <ShieldCheck className="size-3" aria-hidden />
                  ) : (
                    <UserCog className="size-3" aria-hidden />
                  )}
                  {a.role === "admin" ? t("roleAdmin") : t("roleOwner")}
                </Badge>

                {a.status === "active" ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="size-3" aria-hidden />
                    {t("statusActive")}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("statusDisabled")}</Badge>
                )}

                {isSelf && <Badge variant="secondary">{t("selfBadge")}</Badge>}

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || isSelf}
                    title={isSelf ? t("lastAdminHint") : undefined}
                    onClick={() =>
                      runAction(
                        setAccountStatusAction as unknown as (
                          ...args: never[]
                        ) => Promise<{ success: boolean; error?: string }>,
                        a.id,
                        a.status === "active" ? ("disabled" as const) : ("active" as const),
                      )
                    }
                  >
                    {a.status === "active" ? t("disable") : t("enable")}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || isSelf}
                    title={isSelf ? t("lastAdminHint") : undefined}
                    onClick={() =>
                      runAction(
                        setAccountRoleAction as unknown as (
                          ...args: never[]
                        ) => Promise<{ success: boolean; error?: string }>,
                        a.id,
                        a.role === "admin" ? ("owner" as const) : ("admin" as const),
                      )
                    }
                  >
                    {a.role === "admin" ? t("demoteToOwner") : t("promoteToAdmin")}
                  </Button>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending || isSelf}
                    title={isSelf ? t("lastAdminHint") : undefined}
                    onClick={() => openDelete(a)}
                    aria-label={`${t("delete")} ${a.username}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Delete dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundX className="size-4" />
              {t("deleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("deleteWarning", { username: deleteTarget?.account.username ?? "" })}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget?.account.pageSlug && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={releaseSlug}
                onChange={(e) => setReleaseSlug(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{t("releaseSlugLabel")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("releaseSlugHint", { slug: deleteTarget.account.pageSlug })}
                </span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("deleting")}
                </>
              ) : (
                t("deleteSubmit")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

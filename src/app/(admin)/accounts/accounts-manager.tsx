"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Hourglass,
  Link2,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRoundX,
} from "lucide-react";

import { localizeActionError } from "@/lib/action-error-i18n";
import { useSavedAction } from "@/hooks/use-saved-action";
import type { AccountSummary } from "@/server/actions/accounts";
import {
  assignAccountRoleAction,
  setUserSessionOverrideAction,
  createAccountAction,
  deleteAccountAction,
  setAccountPagePolicyAction,
  setAccountStatusAction,
} from "@/server/actions/accounts";
import {
  createInviteAction,
  revokeInviteAction,
  listInvitesAction,
} from "@/server/actions/invites";
import {
  createRoleAction,
  deleteRoleAction,
  updateRoleAction,
} from "@/server/actions/roles";
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
 * Accounts manager (#124 2B): the admin list of sign-in accounts, a create
 * form with a role picker, per-account role assignment, enable/disable, a
 * delete dialog that offers to release the owned page's slug, the instance
 * page policy, and the role model editor. All mutations go through the
 * capability-gated server actions in `@/server/actions/{accounts,roles}`.
 */

const SELECT_CLASSES =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none transition-colors [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]";

export interface RoleRowLite {
  id: number;
  name: string;
  isBuiltin: boolean;
  pagesLimit: number | null;
  pagesVisibility: string;
  canManageAccounts: boolean;
  canManageInstance: boolean;
  idleMinutes: number | null;
  maxHours: number | null;
}

interface DeleteTarget {
  account: AccountSummary;
  userCount: number | null;
}

interface RoleDialogState {
  role: RoleRowLite | null; // null = create
}

export function AccountsManager({
  accounts,
  roles,
  pagePolicy,
  currentUserId,
  canManageInstance,
}: {
  accounts: AccountSummary[];
  roles: RoleRowLite[];
  pagePolicy: "per_user" | "manual";
  currentUserId: number;
  canManageInstance: boolean;
}) {
  const t = useTranslations("accounts");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");
  const savedAction = useSavedAction();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [releaseSlug, setReleaseSlug] = React.useState(false);
  const [roleDialog, setRoleDialog] = React.useState<RoleDialogState | null>(null);
  const [roleDeleteTarget, setRoleDeleteTarget] = React.useState<RoleRowLite | null>(null);
  const [deletePassword, setDeletePassword] = React.useState("");
  const [sessionTarget, setSessionTarget] = React.useState<AccountSummary | null>(null);
  const [inviteDialog, setInviteDialog] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState<{ token: string; expiresAt: string } | null>(null);
  const [invites, setInvites] = React.useState<
    { id: number; roleName: string | null; expiresAt: string; used: boolean }[]
  >([]);
  const [copied, setCopied] = React.useState(false);

  const memberRole = roles.find((r) => r.name === "Member") ?? roles[0];

  const runAction = (
    action: (...args: never[]) => Promise<{ success: boolean; error?: string }>,
    ...args: unknown[]
  ): Promise<void> => {
    setError(null);
    // Resolves when the transition (action + hook-driven refresh) settles, so
    // callers can chain a trailing refresh — Next coalesces router.refresh()
    // calls fired while another refresh transition is still pending, which
    // silently dropped the list update on rapid back-to-back saves (caught
    // by the live E2E: create role → create account → account row stale).
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await savedAction.run(action, ...args);
        if (!res.success) {
          setError(localizeActionError(tErr, (res as { error: string }).error));
        }
        resolve();
      });
    });
  };

  const runForm = (
    action: (formData: FormData) => Promise<{ success: boolean; error?: string }>,
    formData: FormData,
  ): Promise<void> =>
    runAction(action as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string }>, formData);

  const openDelete = (account: AccountSummary) => {
    setDeleteTarget({ account, userCount: null });
    setReleaseSlug(false);
    setDeletePassword("");
    setError(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.set("userId", String(deleteTarget.account.id));
    fd.set("releaseSlug", releaseSlug ? "on" : "off");
    fd.set("confirmPassword", deletePassword);
    if (releaseSlug && deleteTarget.account.pageSlug) {
      fd.set("slug", deleteTarget.account.pageSlug);
    }
    setDeleteTarget(null);
    runForm(deleteAccountAction, fd);
  };

  const refreshInvites = React.useCallback(() => {
    void startTransition(async () => {
      const res = await listInvitesAction();
      if (res.success) setInvites(res.invites);
    });
  }, []);

  const openInviteDialog = () => {
    setInviteLink(null);
    setCopied(false);
    setInviteDialog(true);
    refreshInvites();
  };

  const generateInvite = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await savedAction.run(
        createInviteAction as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string; token?: string; expiresAt?: string }>,
        fd,
      );
      if (res.success && res.token) {
        setInviteLink({ token: res.token, expiresAt: res.expiresAt ?? "" });
        refreshInvites();
      } else {
        setError(localizeActionError(tErr, (res as { error: string }).error));
      }
    });
  };

  const inviteUrl = inviteLink
    ? `${window.location.origin}/invite/${inviteLink.token}`
    : "";

  const visibilityLabel = (v: string) =>
    v === "manage_all" ? t("visManageAll") : v === "view_all" ? t("visViewAll") : t("visOwn");

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
              void runForm(createAccountAction, fd).then((() => {
                // Next 16's client router cache serves the /accounts RSC
                // payload for a while, and back-to-back saves (create role →
                // create account) keep hitting it — router.refresh() alone
                // left the new account invisible in the list (live E2E).
                // A full reload always reflects the DB; account creation is
                // a rare admin action, so the extra load is fine.
                window.location.reload();
              }));
              form.reset();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <FormField
              label={t("createUsername")}
              htmlFor="new-username"
              hint={t("createUsernameHint")}
            >
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
              <select
                id="new-role"
                name="roleId"
                defaultValue={memberRole?.id ?? ""}
                className={SELECT_CLASSES}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id} className="bg-background text-foreground">
                    {r.name}
                  </option>
                ))}
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
          <div className="mt-5 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={openInviteDialog}>
              <Link2 className="size-3.5" aria-hidden />
              {t("inviteOpen")}
            </Button>
          </div>
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
                  {a.roleName ?? (a.role === "admin" ? t("roleAdmin") : t("roleOwner"))}
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
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="sr-only">{t("createRole")}</span>
                    <select
                      aria-label={t("createRole")}
                      value={a.roleId ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        runAction(
                          assignAccountRoleAction as unknown as (
                            ...args: never[]
                          ) => Promise<{ success: boolean; error?: string }>,
                          a.id,
                          Number(e.target.value),
                        )
                      }
                      className={`${SELECT_CLASSES} h-8`}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id} className="bg-background text-foreground">
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>

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
                    disabled={pending}
                    onClick={() => setSessionTarget(a)}
                    aria-label={`${t("sessionTitle")} ${a.username}`}
                    title={t("sessionTitle")}
                  >
                    <Hourglass className="size-3.5" aria-hidden />
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

      {/* ── Page policy (instance setting) ────────────────────────────────── */}
      {canManageInstance && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pagePolicyTitle")}</CardTitle>
            <CardDescription>{t("pagePolicyDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">{t("pagePolicyTitle")}</span>
              <select
                value={pagePolicy}
                disabled={pending}
                onChange={(e) =>
                  runAction(
                    setAccountPagePolicyAction as unknown as (
                      ...args: never[]
                    ) => Promise<{ success: boolean; error?: string }>,
                    e.target.value,
                  )
                }
                className={SELECT_CLASSES}
              >
                <option value="per_user" className="bg-background text-foreground">
                  {t("policyPerUser")}
                </option>
                <option value="manual" className="bg-background text-foreground">
                  {t("policyManual")}
                </option>
              </select>
            </label>
          </CardContent>
        </Card>
      )}

      {/* ── Role model ────────────────────────────────────────────────────── */}
      {canManageInstance && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>{t("rolesTitle")}</CardTitle>
                <CardDescription>{t("rolesDescription")}</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRoleDialog({ role: null })}
              >
                <Plus className="size-3.5" aria-hidden />
                {t("roleNew")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {roles.map((r) => {
              const isAdminRow = r.isBuiltin && r.name === "Admin";
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
                >
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.isBuiltin && (
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="size-3" aria-hidden />
                      {t("builtinBadge")}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {r.pagesLimit == null
                      ? t("pagesLimitUnlimited")
                      : t("pagesLimitValue", { count: r.pagesLimit })}
                    {" · "}
                    {visibilityLabel(r.pagesVisibility)}
                    {r.canManageAccounts ? ` · ${t("canManageAccountsShort")}` : ""}
                    {r.canManageInstance ? ` · ${t("canManageInstanceShort")}` : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || isAdminRow}
                      title={isAdminRow ? t("adminRoleLocked") : undefined}
                      onClick={() => setRoleDialog({ role: r })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      <span className="sr-only">{t("roleEdit")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending || r.isBuiltin}
                      title={r.isBuiltin ? t("builtinRoleLocked") : undefined}
                      onClick={() => setRoleDeleteTarget(r)}
                      aria-label={`${t("roleDeleteTitle")} ${r.name}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Delete account dialog ─────────────────────────────────────────── */}
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

          <FormField
            label={t("confirmPassword")}
            htmlFor="delete-confirm-password"
            hint={t("confirmPasswordHint")}
          >
            <Input
              id="delete-confirm-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </FormField>

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

      {/* ── Create / edit role dialog ─────────────────────────────────────── */}
      <Dialog
        open={roleDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRoleDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleDialog?.role ? t("roleEditTitle", { name: roleDialog.role.name }) : t("roleNew")}
            </DialogTitle>
            <DialogDescription>{t("roleDialogDescription")}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              if (roleDialog?.role) {
                fd.set("roleId", String(roleDialog.role.id));
                setRoleDialog(null);
                runForm(updateRoleAction, fd);
              } else {
                setRoleDialog(null);
                runForm(createRoleAction, fd);
              }
            }}
            className="flex flex-col gap-4"
          >
            <FormField label={t("roleNameLabel")} htmlFor="role-name">
              <Input
                id="role-name"
                name="name"
                defaultValue={roleDialog?.role?.name ?? ""}
                required
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
            <FormField
              label={t("pagesLimitLabel")}
              htmlFor="role-limit"
              hint={t("pagesLimitHint")}
            >
              <Input
                id="role-limit"
                name="pagesLimit"
                type="number"
                min={0}
                step={1}
                defaultValue={roleDialog?.role?.pagesLimit ?? ""}
                className="w-32"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("roleIdleMinutes")} htmlFor="role-idle">
                <Input
                  id="role-idle"
                  name="idleMinutes"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={roleDialog?.role?.idleMinutes ?? ""}
                  placeholder={t("pagesLimitPlaceholder")}
                />
              </FormField>
              <FormField label={t("roleMaxHours")} htmlFor="role-max">
                <Input
                  id="role-max"
                  name="maxHours"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={roleDialog?.role?.maxHours ?? ""}
                  placeholder={t("pagesLimitPlaceholder")}
                />
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground">{t("roleSessionHint")}</p>
            <FormField label={t("visibilityLabel")} htmlFor="role-visibility">
              <select
                id="role-visibility"
                name="pagesVisibility"
                defaultValue={roleDialog?.role?.pagesVisibility ?? "own"}
                className={SELECT_CLASSES}
              >
                <option value="own" className="bg-background text-foreground">
                  {t("visOwn")}
                </option>
                <option value="view_all" className="bg-background text-foreground">
                  {t("visViewAll")}
                </option>
                <option value="manage_all" className="bg-background text-foreground">
                  {t("visManageAll")}
                </option>
              </select>
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="canManageAccounts"
                defaultChecked={roleDialog?.role?.canManageAccounts ?? false}
                className="size-4"
              />
              {t("canManageAccountsLabel")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="canManageInstance"
                defaultChecked={roleDialog?.role?.canManageInstance ?? false}
                className="size-4"
              />
              {t("canManageInstanceLabel")}
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRoleDialog(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  t("roleSubmit")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete role dialog ────────────────────────────────────────────── */}
      <Dialog
        open={roleDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("roleDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("roleDeleteWarning", { name: roleDeleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setRoleDeleteTarget(null);
              runForm(deleteRoleAction, fd);
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="roleId" value={roleDeleteTarget?.id ?? ""} />
            <FormField label={t("reassignLabel")} htmlFor="role-reassign">
              <select id="role-reassign" name="reassignTo" className={SELECT_CLASSES}>
                <option value="" className="bg-background text-foreground">
                  {t("reassignNone")}
                </option>
                {roles
                  .filter((r) => r.id !== roleDeleteTarget?.id)
                  .map((r) => (
                    <option key={r.id} value={r.id} className="bg-background text-foreground">
                      {r.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRoleDeleteTarget(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  t("roleDeleteSubmit")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Per-user session override dialog ──────────────────────────────── */}
      <Dialog
        open={sessionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSessionTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hourglass className="size-4" aria-hidden />
              {t("sessionTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("sessionHint")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const target = sessionTarget;
              if (!target) return;
              const fd = new FormData(e.currentTarget);
              fd.set("userId", String(target.id));
              setSessionTarget(null);
              runForm(setUserSessionOverrideAction, fd);
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("roleIdleMinutes")} htmlFor="session-override-idle">
                <Input
                  id="session-override-idle"
                  name="idleMinutes"
                  type="number"
                  min={1}
                  step={1}
                  autoComplete="off"
                  placeholder={t("roleSessionInherit")}
                />
              </FormField>
              <FormField label={t("roleMaxHours")} htmlFor="session-override-max">
                <Input
                  id="session-override-max"
                  name="maxHours"
                  type="number"
                  min={1}
                  step={1}
                  autoComplete="off"
                  placeholder={t("roleSessionInherit")}
                />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSessionTarget(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : t("sessionSave")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Invite dialog (stage 1: links, no SMTP) ───────────────────────── */}
      <Dialog
        open={inviteDialog}
        onOpenChange={(open) => {
          if (!open) setInviteDialog(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4" aria-hidden />
              {t("inviteTitle")}
            </DialogTitle>
            <DialogDescription>{t("inviteHint")}</DialogDescription>
          </DialogHeader>

          {inviteLink ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{t("inviteLinkOnce")}</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? t("inviteCopied") : t("inviteCopy")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("inviteExpires", { date: inviteLink.expiresAt })}
              </p>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setInviteDialog(false)}>
                  {tCommon("close")}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={generateInvite} className="flex flex-col gap-4">
              <FormField label={t("createRole")} htmlFor="invite-role">
                <select id="invite-role" name="roleId" defaultValue={memberRole?.id ?? ""} className={SELECT_CLASSES}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id} className="bg-background text-foreground">
                      {r.name}
                    </option>
                  ))}
                </select>
              </FormField>

              {invites.filter((i) => !i.used).length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("invitePending")}</p>
                  {invites
                    .filter((i) => !i.used)
                    .slice(0, 8)
                    .map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                        <span className="text-xs">
                          {i.roleName ?? "Member"} · {t("inviteExpiresShort", { date: i.expiresAt.slice(0, 10) })}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await savedAction.run(
                                revokeInviteAction as unknown as (...args: never[]) => Promise<{ success: boolean; error?: string }>,
                                i.id,
                              );
                              if (res.success) refreshInvites();
                            })
                          }
                        >
                          {t("inviteRevoke")}
                        </Button>
                      </div>
                    ))}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteDialog(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : t("inviteGenerate")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getCapabilitiesForUser, listAccountSummaries, listRoles, getSetting } from "@/server/queries";

import { AccountsManager } from "./accounts-manager";

export const dynamic = "force-dynamic";

/**
 * Admin — accounts (#124): list every sign-in account, create new ones, assign
 * role rows, edit the role model, and pick the instance page policy. Purely a
 * server page: data loads here, the manager client component drives the
 * admin-gated server actions.
 *
 * The page slug is loaded via a single LEFT JOIN (`listAccountSummaries`), so
 * the list stays one query regardless of account count.
 */
export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!caps.manageAccounts) redirect("/dashboard");

  const [rows, roleRows, pagePolicy, t] = await Promise.all([
    listAccountSummaries(),
    listRoles(),
    getSetting("accountPagePolicy"),
    getTranslations("accounts"),
  ]);

  const accounts = rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    roleId: r.roleId,
    roleName: r.roleName,
    status: r.status,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
    pageSlug: r.pageSlug,
  }));

  const roles = roleRows.map((r) => ({
    id: r.id,
    name: r.name,
    isBuiltin: r.isBuiltin,
    pagesLimit: r.pagesLimit,
    pagesVisibility: r.pagesVisibility,
    canManageAccounts: r.canManageAccounts,
    canManageInstance: r.canManageInstance,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-6 md:pb-8">
      <div className="flex items-center gap-2">
        <Users className="size-5 shrink-0" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      <AccountsManager
        accounts={accounts}
        roles={roles}
        pagePolicy={pagePolicy === "manual" ? "manual" : "per_user"}
        currentUserId={session.userId}
        canManageInstance={caps.manageInstance}
      />
    </main>
  );
}

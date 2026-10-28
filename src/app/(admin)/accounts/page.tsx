import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getSession } from "@/lib/auth";
import { listAccountSummaries } from "@/server/queries";
import { redirect } from "next/navigation";

import { AccountsManager } from "./accounts-manager";

export const dynamic = "force-dynamic";

/**
 * Admin — accounts (#124): list every sign-in account, create new ones, and
 * enable/disable/promote/delete. Purely a server page: data loads here, the
 * manager client component drives the admin-gated server actions.
 *
 * The page slug is loaded via a single LEFT JOIN (`listAccountSummaries`), so
 * the list stays one query regardless of account count.
 */
export default async function AccountsPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/dashboard");
  }

  const [rows, t] = await Promise.all([
    listAccountSummaries(),
    getTranslations("accounts"),
  ]);

  const accounts = rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    status: r.status,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
    pageSlug: r.pageSlug,
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
      <AccountsManager accounts={accounts} currentUserId={session.userId} />
    </main>
  );
}

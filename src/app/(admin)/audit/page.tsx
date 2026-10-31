import Link from "next/link";
import { ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getCapabilitiesForUser } from "@/server/queries";
import { AUDIT_ACTIONS, listAuditActors, listAuditEntries } from "@/server/audit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const RANGE_CHOICES = [1, 7, 30, 90] as const;

/**
 * Admin — audit log (#124 follow-up). Append-only trail of security-relevant
 * events: account/role lifecycle, logins, SSO, settings changes. Clean,
 * server-rendered table; the filters are plain GET links (no client JS needed)
 * and pagination is a (createdAt, id) cursor.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!caps.manageInstance) redirect("/dashboard");

  const params = await searchParams;
  const t = await getTranslations("audit");

  const actorParam = typeof params.actor === "string" ? Number(params.actor) : NaN;
  const actorFilter = Number.isInteger(actorParam) && actorParam > 0 ? actorParam : undefined;
  const actionFilter = AUDIT_ACTIONS.find((a) => a === params.action);
  const rangeParam = typeof params.range === "string" ? Number(params.range) : NaN;
  const range = RANGE_CHOICES.find((r) => r === rangeParam);
  const before = typeof params.before === "string" ? params.before : undefined;
  const beforeId = typeof params.beforeId === "string" ? Number(params.beforeId) : undefined;

  const [{ entries, hasMore }, actors] = await Promise.all([
    listAuditEntries({
      actorUserId: actorFilter,
      action: actionFilter,
      sinceDays: range,
      before,
      beforeId: Number.isInteger(beforeId) ? beforeId : undefined,
      limit: PAGE_SIZE,
    }),
    listAuditActors(),
  ]);

  // Build a filter link that preserves the other params (used by tests too).
  const filterQuery = () => {
    const q = new URLSearchParams();
    if (actorFilter) q.set("actor", String(actorFilter));
    if (actionFilter) q.set("action", actionFilter);
    if (range) q.set("range", String(range));
    return q;
  };

  const last = entries[entries.length - 1];

  const olderHref = (() => {
    const q = filterQuery();
    q.set("before", last!.createdAt);
    q.set("beforeId", String(last!.id));
    return `/audit?${q.toString()}`;
  })();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-24 pt-6 md:pb-8">
      <div className="flex items-center gap-2">
        <ScrollText className="size-5 shrink-0" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      {/* Filters — plain GET form, no client JS */}
      <form method="get" action="/audit" className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("filterActor")}
          <select
            name="actor"
            defaultValue={actorFilter ? String(actorFilter) : ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="" className="bg-background text-foreground">{t("filterAllActors")}</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id} className="bg-background text-foreground">
                {a.username}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("filterAction")}
          <select
            name="action"
            defaultValue={actionFilter ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="" className="bg-background text-foreground">{t("filterAllActions")}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a} className="bg-background text-foreground">
                {t(`action.${a}` as never)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("filterRange")}
          <select
            name="range"
            defaultValue={range ? String(range) : ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="" className="bg-background text-foreground">{t("rangeAll")}</option>
            {RANGE_CHOICES.map((r) => (
              <option key={r} value={r} className="bg-background text-foreground">
                {t("rangeDays", { days: r })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-violet px-3 text-sm font-medium text-white transition-colors hover:bg-violet/85"
        >
          {t("apply")}
        </button>
        <Link href="/audit" className="h-9 leading-9 text-sm text-muted-foreground hover:text-foreground">
          {t("clear")}
        </Link>
      </form>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t("when")}</th>
                <th className="px-3 py-2 font-medium">{t("who")}</th>
                <th className="px-3 py-2 font-medium">{t("what")}</th>
                <th className="px-3 py-2 font-medium">{t("targetCol")}</th>
                <th className="px-3 py-2 font-medium">{t("ipCol")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {e.createdAt.replace("T", " ")}
                  </td>
                  <td className="px-3 py-2">{e.actorUsername ?? t("system")}</td>
                  <td className="px-3 py-2">{t(`action.${e.action}` as never)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.target ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {e.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("showing", { count: entries.length })}
        </span>
        {hasMore && last && (
          <Link href={olderHref} className="text-violet hover:underline">
            {t("older")} →
          </Link>
        )}
      </div>
    </main>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { LogOut, ChevronLeft, CircleArrowUp } from "lucide-react";
import { logout } from "@/server/actions/auth";
import { clearAllLinkDrafts } from "@/lib/link-drafts";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageSwitcher } from "@/components/admin/PageSwitcher";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface SidebarUpdateStatus {
  hasUpdate: boolean;
  latestVersion: string | null;
}

export type SidebarPage = {
  id: number;
  slug: string;
  title: string;
  isDefault: boolean;
  isPublished: boolean;
};

// ── rail (collapsed sidebar) store ──────────────────────────────────────
// Persisted in localStorage, read through useSyncExternalStore so SSR and
// hydration render expanded deterministically and flips stay reactive
// without a setState-in-effect (react-hooks/set-state-in-effect).
const RAIL_KEY = "lb-sidebar-rail";
const railSubscribers = new Set<() => void>();

function subscribeRail(onChange: () => void) {
  railSubscribers.add(onChange);
  return () => {
    railSubscribers.delete(onChange);
  };
}

function getRailSnapshot(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    return false;
  }
}

function getRailServerSnapshot(): boolean {
  return false;
}

function setRailStored(next: boolean) {
  try {
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
  } catch {
    // storage unavailable — still flip for this session via the subscribers
  }
  railSubscribers.forEach((cb) => cb());
}

/** Client shell for the desktop admin sidebar (md+): brand + collapse
 *  toggle, nav, Pages section, update chip, user footer. Collapsed mode is
 *  the Frappe-style icon rail — labels hide, nav items tooltip via title,
 *  Pages section folds away — and the choice persists in localStorage
 *  (read post-hydration so SSR stays deterministic). */
export function AdminSidebar({
  username,
  pages,
  canManageAccounts,
  canManageInstance,
  update,
}: {
  username: string;
  pages: SidebarPage[];
  canManageAccounts: boolean;
  canManageInstance: boolean;
  update: SidebarUpdateStatus;
}) {
  const t = useTranslations("shell");
  const tUpdate = useTranslations("update");

  const rail = React.useSyncExternalStore(
    subscribeRail,
    getRailSnapshot,
    getRailServerSnapshot,
  );

  const toggleRail = React.useCallback(() => {
    setRailStored(!getRailSnapshot());
  }, []);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-dvh md:self-start",
        rail ? "w-[62px]" : "w-60 p-4",
      )}
    >
      <div
        className={cn(
          "flex items-center",
          rail ? "flex-col gap-3 py-4" : "mb-6 gap-2 px-2",
        )}
      >
        <a
          href="https://linkbreeze.omnirise.dev/"
          target="_blank"
          rel="noopener noreferrer"
          title={t("visitSite")}
          aria-label={t("visitSite")}
          className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
        >
          <Image src="/logo-mark.svg" alt="LinkBreeze" width={24} height={24} unoptimized />
          {!rail && <span className="font-heading text-lg font-semibold">LinkBreeze</span>}
        </a>
        <button
          type="button"
          onClick={toggleRail}
          aria-expanded={!rail}
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-lavender/30 hover:text-lavender"
        >
          <ChevronLeft className={cn("size-4 transition-transform duration-200", rail && "rotate-180")} />
          <span className="sr-only">{rail ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      </div>

      <React.Suspense fallback={null}>
        <AdminNav
          rail={rail}
          canManageAccounts={canManageAccounts}
          canManageInstance={canManageInstance}
        />
      </React.Suspense>

      {!rail && (
        <div className="mb-3 border-t border-border pt-3">
          <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">
            {t("pagesSection")}
          </p>
          <React.Suspense fallback={null}>
            <PageSwitcher pages={pages} />
          </React.Suspense>
        </div>
      )}

      <div
        className={cn(
          "mt-auto flex flex-col border-t border-border pt-3",
          rail ? "gap-2 px-2 pb-4" : "gap-2",
        )}
      >
        {update.hasUpdate && update.latestVersion && (
          <Link
            href="/settings#data"
            title={tUpdate("available", { version: update.latestVersion })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-lavender/25 bg-violet/10 px-2.5 py-2 text-lavender-soft transition-colors hover:bg-violet/20",
              rail && "justify-center border-0 bg-transparent px-0",
            )}
          >
            <CircleArrowUp className="size-4 shrink-0 text-lavender" />
            {!rail && (
              <span className="truncate text-xs">
                {tUpdate("available", { version: update.latestVersion })}
              </span>
            )}
          </Link>
        )}
        {!rail && (
          <span className="px-2.5 text-xs text-muted-foreground">
            {t.rich("signedInAs", {
              name: username,
              b: (chunk) => (
                <span className="font-medium text-foreground">{chunk}</span>
              ),
            })}
          </span>
        )}
        <form
          action={logout}
          onSubmit={() => clearAllLinkDrafts()}
          className={cn(rail && "flex")}
        >
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            title={t("signOut")}
            className={cn(rail ? "flex-1 justify-center px-0" : "w-full justify-start gap-2")}
          >
            <LogOut className="size-4" />
            {!rail && t("signOut")}
          </Button>
        </form>
      </div>
    </aside>
  );
}

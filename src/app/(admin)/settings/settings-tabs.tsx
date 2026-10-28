"use client";

import * as React from "react";
import {
  Settings,
  Palette,
  Shield,
  Database,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "integration", label: "Integration", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: Shield },
  { id: "data", label: "Data", icon: Database },
];

export function SettingsTabs({
  tabs,
  allowed,
}: {
  tabs: Record<string, React.ReactNode>;
  /** #124: when set (e.g. ["security"] for members), only these tabs render. */
  allowed?: string[];
}) {
  const t = useTranslations("settings.tabs");

  // The active tab lives in the URL hash (`/settings#security`) so a refresh,
  // reopen, or shared link lands in the same tab. URL state is read through
  // useSyncExternalStore: SSR renders "general", the client takes over from
  // the hash after hydration, and no setState-in-effect cascade occurs.
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    window.addEventListener("hashchange", onStoreChange);
    return () => window.removeEventListener("hashchange", onStoreChange);
  }, []);
  const getSnapshot = React.useCallback(() => {
    const fromHash = window.location.hash.slice(1);
    return TABS.some((tab) => tab.id === fromHash) ? fromHash : "general";
  }, []);
  const active = React.useSyncExternalStore(subscribe, getSnapshot, () => "general");

  // #124 capability filter: members get only the tabs they may use (the
  // instance-level panels stay server-gated behind this too, but hiding them
  // stops members clicking into "forbidden" walls).
  const visibleTabs = allowed
    ? TABS.filter((tab) => allowed.includes(tab.id) && tabs[tab.id] != null)
    : TABS;
  const activeTabs = allowed
    ? Object.fromEntries(visibleTabs.map((tab) => [tab.id, tabs[tab.id]]))
    : tabs;
  const effectiveActive = visibleTabs.some((tab) => tab.id === active) ? active : visibleTabs[0]?.id ?? "general";

  const select = (id: string) => {
    const { pathname, search } = window.location;
    // replaceState doesn't fire hashchange — announce it so the store re-reads.
    window.history.replaceState(null, "", id === "general" ? `${pathname}${search}` : `#${id}`);
    window.dispatchEvent(new Event("hashchange"));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 backdrop-blur-xl">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => select(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active === tab.id
                ? "bg-violet/15 text-lavender"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {t(tab.id as never)}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div>{activeTabs[effectiveActive]}</div>
    </div>
  );
}

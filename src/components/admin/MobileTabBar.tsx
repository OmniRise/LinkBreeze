"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  Palette,
  User,
  Settings,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewButton } from "@/components/admin/PreviewPane";
import {
  SETTINGS_GROUP_PATHS,
  visibleSettingsGroup,
  type SettingsGroupItem,
} from "@/components/admin/settings-group";
import { useTranslations } from "next-intl";
import type { Messages } from "@/locales/en";

type DockTab = {
  href: string;
  label: keyof Messages["nav"] & string;
  icon: LucideIcon;
};

const LEFT_TABS: DockTab[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/links", label: "links", icon: LinkIcon },
  { href: "/theme", label: "theme", icon: Palette },
];

const RIGHT_TABS: DockTab[] = [{ href: "/profile", label: "profile", icon: User }];

/** Fixed bottom dock (mobile only). Thumb-reachable, always visible: two
 *  tabs left (Dashboard/Links), the raised aurora Preview circle center,
 *  Profile + Settings right. "Settings" is NOT a destination — tapping it
 *  opens a drop-up menu with the group (App/Domains/Accounts/Audit) above
 *  the bar, mirroring the desktop accordion and the rail flyout (same
 *  shared group, settings-group.ts). #124 capability gating applies to the
 *  menu items server-side too. ?page= param is preserved. */
export function MobileTabBar({
  canManageAccounts,
  canManageInstance,
}: {
  canManageAccounts: boolean;
  canManageInstance: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const query = pageParam ? `?page=${pageParam}` : "";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Drop-up: Settings slot opens the group as a popover above the dock.
  // The invisible fixed overlay beneath it closes on tap-away.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const groupItems = visibleSettingsGroup(canManageAccounts, canManageInstance);
  const settingsActive = SETTINGS_GROUP_PATHS.some(isActive);

  const renderTab = (tab: DockTab) => {
    const active = isActive(tab.href);
    return (
      <Link
        key={tab.href}
        href={`${tab.href}${query}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
          active ? "text-lavender" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--aurora-grad)]"
          />
        ) : null}
        <tab.icon className="size-5" />
        <span>{t(tab.label)}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label={t("primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-lavender/12 bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-12px_rgba(5,3,20,0.85)] backdrop-blur-md md:hidden"
    >
      <div className="flex items-end">
        <div className="flex flex-1 items-start">{LEFT_TABS.map(renderTab)}</div>
        <div className="flex-none px-1">
          <PreviewButton variant="dock" />
        </div>
        <div className="flex flex-1 items-start justify-end">
          {RIGHT_TABS.map(renderTab)}
          <div className="relative flex flex-1 flex-col items-center">
            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-label={t("settings")}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  aria-label={t("settings")}
                  className="absolute bottom-full right-0 z-50 mb-3 flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-sidebar/95 p-1.5 shadow-[0_-12px_32px_rgba(5,3,20,0.6)] backdrop-blur-xl"
                >
                  {groupItems.map((item: SettingsGroupItem) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        role="menuitem"
                        href={`${item.href}${query}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-violet/10 hover:text-lavender-soft",
                          active && "bg-violet/15 text-lavender",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        {t(item.label)}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                settingsActive || menuOpen
                  ? "text-lavender"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {settingsActive ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--aurora-grad)]"
                />
              ) : null}
              <Settings className="size-5" />
              <span className="flex items-center gap-0.5">
                {t("settings")}
                <ChevronUp
                  className={cn(
                    "size-3 opacity-70 transition-transform duration-200",
                    menuOpen && "rotate-180",
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

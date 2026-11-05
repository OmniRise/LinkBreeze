"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  User,
  Palette,
  Settings,
  ChevronDown,
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

type NavItem = {
  href: string;
  label: keyof Messages["nav"] & string;
  icon: LucideIcon;
};

const TOP_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/links", label: "links", icon: LinkIcon },
  { href: "/profile", label: "profile", icon: User },
];

/** Sidebar nav that preserves the ?page= param across admin sections.
 *  Active section carries an aurora notch + pill. "Settings" is ONLY a
 *  group label that folds the group (App/Domains/Accounts/Audit) — it is
 *  never a destination; the /settings page is reached through the "App"
 *  child. The rail flyout and the mobile dock drop-up consume the same
 *  shared group (settings-group.ts), so all three surfaces stay identical.
 *  #124: gated items render only for roles holding the matching capability
 *  — the pages behind them are gated server-side too.
 *  `rail` (collapsed icon mode): icons center (rows are w-full and buttons
 *  get explicit full width too — buttons shrink-to-fit otherwise, which
 *  misaligned them against the stretching links), labels hide (title
 *  tooltips), Settings opens the flyout. */
export function AdminNav({
  rail = false,
  canManageAccounts,
  canManageInstance,
}: {
  rail?: boolean;
  canManageAccounts: boolean;
  canManageInstance: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const query = pageParam ? `?page=${pageParam}` : "";

  const isActive = React.useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname],
  );
  const settingsActive = SETTINGS_GROUP_PATHS.some(isActive);

  // The accordion follows the route as its default (single source of
  // truth): open while you're inside the group's pages, closed elsewhere —
  // unless the user manually toggled it, which wins until they click
  // another top-level section (that click resets the override).
  const [userOpened, setUserOpened] = React.useState<boolean | null>(null);
  const open = userOpened ?? settingsActive;

  // Rail flyout: Settings icon opens the group as a popover. No effect
  // needed — the invisible fixed overlay beneath it closes on click-away.
  const [railMenuOpen, setRailMenuOpen] = React.useState(false);

  const groupItems = visibleSettingsGroup(canManageAccounts, canManageInstance);

  const itemClass = (active: boolean) =>
    cn(
      "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-[color,background-color,transform] hover:translate-x-0.5 rtl:hover:-translate-x-0.5 hover:bg-violet/15 hover:text-lavender",
      active && "bg-violet/15 text-lavender",
      rail && "w-full justify-center px-0 hover:translate-x-0 rtl:hover:translate-x-0",
    );

  const childLinkClass = (active: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-violet/10 hover:text-lavender-soft",
      active && "bg-violet/15 text-lavender",
    );

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={`${item.href}${query}`}
        aria-current={active ? "page" : undefined}
        title={rail ? t(item.label) : undefined}
        className={itemClass(active)}
        onClick={() => setUserOpened(null)}
      >
        {active && !rail ? (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-[var(--aurora-grad)]"
          />
        ) : null}
        <item.icon className="size-4 shrink-0" />
        <span className={cn(rail && "hidden")}>{t(item.label)}</span>
      </Link>
    );
  };

  const renderGroupItem = (item: SettingsGroupItem, onClick?: () => void) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={`${item.href}${query}`}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={childLinkClass(active)}
      >
        <item.icon className="size-3.5 shrink-0" />
        {t(item.label)}
      </Link>
    );
  };

  return (
    <nav className="relative flex flex-1 flex-col gap-1">
      {TOP_ITEMS.map(renderItem)}
      {canManageInstance &&
        renderItem({ href: "/theme", label: "theme", icon: Palette })}

      {/* Settings group. The row only folds/unfolds — it is not a link.
          Rail: the icon opens the flyout with the group. */}
      {rail ? (
        <div className="relative flex">
          <button
            type="button"
            onClick={() => setRailMenuOpen((o) => !o)}
            aria-expanded={railMenuOpen}
            aria-haspopup="menu"
            title={t("settings")}
            className={itemClass(settingsActive)}
          >
            <Settings className="size-4 shrink-0" />
          </button>
          {railMenuOpen ? (
            <>
              <button
                type="button"
                aria-label={t("settings")}
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setRailMenuOpen(false)}
              />
              <div className="absolute start-full top-0 z-50 ms-2 flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-sidebar/95 p-1.5 shadow-[0_12px_32px_rgba(5,3,20,0.6)] backdrop-blur-xl">
                {groupItems.map((item) =>
                  renderGroupItem(item, () => setRailMenuOpen(false)),
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setUserOpened(!open)}
            aria-expanded={open}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-[color,background-color] hover:bg-violet/15 hover:text-lavender",
              settingsActive && "bg-violet/15 text-lavender",
            )}
          >
            <Settings className="size-4 shrink-0" />
            {t("settings")}
            <ChevronDown
              className={cn(
                "ml-auto size-3.5 opacity-70 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200",
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-0.5 pb-1 pl-5">
                {groupItems.map((item) => renderGroupItem(item))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={cn("mt-1 border-t border-border pt-1", rail && "flex")}>
        <PreviewButton
          labelHidden={rail}
          className={rail ? "flex-1 justify-center px-0" : undefined}
        />
      </div>
    </nav>
  );
}

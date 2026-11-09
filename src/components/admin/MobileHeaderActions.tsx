"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/server/actions/auth";
import {
  SETTINGS_GROUP_PATHS,
  visibleSettingsGroup,
  type SettingsGroupItem,
} from "@/components/admin/settings-group";
import { useTranslations } from "next-intl";

/** Mobile top-bar action cluster: the Settings gear, whose drop-DOWN menu
 *  carries the same shared settings group (settings-group.ts) as the desktop
 *  accordion and the rail flyout, plus sign-out at the bottom — so the dock
 *  stays purely navigational (Dashboard/Links | raised Preview | Theme/
 *  Profile). #124 capability gating applies; ?page= is preserved. */
export function MobileHeaderActions({
  canManageAccounts,
  canManageInstance,
}: {
  canManageAccounts: boolean;
  canManageInstance: boolean;
}) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const query = pageParam ? `?page=${pageParam}` : "";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const settingsActive = SETTINGS_GROUP_PATHS.some(isActive);

  // Drop-down: the gear opens the group as a popover beneath the header.
  // The invisible fixed overlay beneath it closes on tap-away.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const groupItems = visibleSettingsGroup(canManageAccounts, canManageInstance);

  return (
    <div className="relative">
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
            className="absolute end-0 top-full z-50 mt-2 flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-sidebar/95 p-1.5 shadow-[0_12px_32px_rgba(5,3,20,0.6)] backdrop-blur-xl"
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
            <div aria-hidden="true" className="mx-1 my-1 border-t border-border" />
            {/* Sign-out rides in the same menu so the header stays two slots
                (pages + settings) and the dock stays purely navigational. */}
            <form action={logout}>
              <button
                role="menuitem"
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="size-4 shrink-0" />
                {tShell("signOut")}
              </button>
            </form>
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t("settings")}
        title={t("settings")}
        className={cn(
          "relative z-50 grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-lavender/30 hover:text-lavender",
          settingsActive && "border-lavender/30 text-lavender",
        )}
      >
        <Settings className="size-4" />
      </button>
    </div>
  );
}

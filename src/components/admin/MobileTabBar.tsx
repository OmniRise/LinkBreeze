"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  Palette,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewButton } from "@/components/admin/PreviewPane";
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
];

const RIGHT_TABS: DockTab[] = [
  { href: "/theme", label: "theme", icon: Palette },
  { href: "/profile", label: "profile", icon: User },
];

/** Fixed bottom dock (mobile only), always visible without scrolling: two
 *  tabs left (Dashboard/Links), the raised aurora Preview circle center, two
 *  tabs right (Theme/Profile) — 2+2 around the center, symmetric. Settings
 *  is configuration, not a destination: it lives in the mobile top bar
 *  (MobileHeaderActions, incl. sign-out). ?page= is preserved. */
export function MobileTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const query = pageParam ? `?page=${pageParam}` : "";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

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
        </div>
      </div>
    </nav>
  );
}

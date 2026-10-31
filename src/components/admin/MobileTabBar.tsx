"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  User,
  Palette,
  Settings,
  Globe,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewButton } from "@/components/admin/PreviewPane";
import { useTranslations } from "next-intl";
import type { Messages } from "@/locales/en";

const TABS: {
  href: string;
  label: keyof Messages["nav"] & string;
  icon: LucideIcon;
}[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/links", label: "links", icon: LinkIcon },
  { href: "/profile", label: "profile", icon: User },
  { href: "/theme", label: "theme", icon: Palette },
  { href: "/domains", label: "domains", icon: Globe },
  { href: "/accounts", label: "accounts", icon: Users },
  { href: "/audit", label: "audit", icon: ScrollText },
  { href: "/settings", label: "settings", icon: Settings },
];

/** Fixed opaque bottom tab bar (mobile only). Thumb-reachable, always visible.
 *  #124: instance-level tabs (theme, domains, accounts) render only for roles
 *  holding the matching capability — pages behind them are gated server-side. */
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

  const visible = TABS.filter(
    (tab) =>
      (tab.href !== "/accounts" || canManageAccounts) &&
      (tab.href !== "/audit" || canManageInstance) &&
      (tab.href !== "/domains" || canManageInstance) &&
      (tab.href !== "/theme" || canManageInstance),
  );

  return (
    <nav
      aria-label={t("primary")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-lavender/12 bg-background px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-12px_rgba(5,3,20,0.85)] md:hidden"
    >
      {visible.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={`${href}${query}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
              active ? "text-lavender" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--aurora-grad)]" />
            ) : null}
            <Icon className="size-5" />
            <span>{t(label)}</span>
          </Link>
        );
      })}
      <PreviewButton className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs" />
    </nav>
  );
}

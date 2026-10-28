"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Link as LinkIcon,
  User,
  Palette,
  Settings,
  Globe,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PreviewButton } from "@/components/admin/PreviewPane";
import { useTranslations } from "next-intl";
import type { Messages } from "@/locales/en";

const NAV: { href: string; label: keyof Messages["nav"] & string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard },
  { href: "/links", label: "links", icon: LinkIcon },
  { href: "/profile", label: "profile", icon: User },
  { href: "/theme", label: "theme", icon: Palette },
  { href: "/domains", label: "domains", icon: Globe },
  { href: "/accounts", label: "accounts", icon: Users },
  { href: "/settings", label: "settings", icon: Settings },
];

/** Sidebar nav that preserves the ?page= param across admin sections.
 *  #124: instance-level sections (theme, domains, accounts) render only for
 *  roles holding the matching capability — the pages behind them are gated
 *  server-side too, this just stops members clicking into refusals. */
export function AdminNav({
  canManageAccounts,
  canManageInstance,
}: {
  canManageAccounts: boolean;
  canManageInstance: boolean;
}) {
  const t = useTranslations("nav");
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const query = pageParam ? `?page=${pageParam}` : "";

  const visible = NAV.filter(
    (item) =>
      (item.href !== "/accounts" || canManageAccounts) &&
      (item.href !== "/domains" || canManageInstance) &&
      (item.href !== "/theme" || canManageInstance),
  );

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={`${item.href}${query}`}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-[color,background-color,transform] hover:translate-x-0.5 hover:bg-violet/15 hover:text-lavender"
        >
          <item.icon className="size-4" />
          {t(item.label)}
        </Link>
      ))}
      <div className="mt-1 border-t border-border pt-1">
        <PreviewButton />
      </div>
    </nav>
  );
}

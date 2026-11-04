import { Settings, Globe, Users, ScrollText, type LucideIcon } from "lucide-react";
import type { Messages } from "@/locales/en";

/** The Settings group: "App" IS the /settings page entry; Settings itself
 *  is only a group label, never a destination. Shared verbatim by the
 *  desktop accordion, the rail flyout, and the mobile dock drop-up so all
 *  three surfaces stay in lockstep. */
export type SettingsGroupItem = {
  href: string;
  label: keyof Messages["nav"] & string;
  icon: LucideIcon;
  /** #124 capability gate — item renders only when the capability is held
   *  (pages behind every item are gated server-side regardless). */
  gate?: "accounts" | "instance";
};

export const SETTINGS_GROUP: SettingsGroupItem[] = [
  { href: "/settings", label: "app", icon: Settings },
  { href: "/domains", label: "domains", icon: Globe, gate: "instance" },
  { href: "/accounts", label: "accounts", icon: Users, gate: "accounts" },
  { href: "/audit", label: "audit", icon: ScrollText, gate: "instance" },
];

export const SETTINGS_GROUP_PATHS = SETTINGS_GROUP.map((item) => item.href);

export function visibleSettingsGroup(
  canManageAccounts: boolean,
  canManageInstance: boolean,
): SettingsGroupItem[] {
  return SETTINGS_GROUP.filter(
    (item) =>
      (item.gate !== "accounts" || canManageAccounts) &&
      (item.gate !== "instance" || canManageInstance),
  );
}

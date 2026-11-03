import * as React from "react";
import {
  LogOut,
} from "lucide-react";
import Image from "next/image";
import { NextIntlClientProvider } from "next-intl";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { logout } from "@/server/actions/auth";
import { getAllPages } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "@/components/aurora/AuroraBackground";
import { MobileTabBar } from "@/components/admin/MobileTabBar";
import { PageSwitcher } from "@/components/admin/PageSwitcher";
import { getCapabilitiesForUser } from "@/server/queries";
import { filterVisiblePages } from "@/lib/ownership";
import { AdminNav } from "@/components/admin/AdminNav";
import { PreviewProvider } from "@/components/admin/PreviewPane";
import { getLocale } from "@/i18n/server";
import { LOCALE_HTML_LANG, localeDir } from "@/i18n/config";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/** Translated tab title for every admin page (root metadata stays English/SEO). */
export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("adminTitle") };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = await getTranslations("shell");
  const dir = localeDir(locale);
  const htmlLang = LOCALE_HTML_LANG[locale];

  // i18n provider wraps the whole admin shell (both branches) so the
  // login/setup screens are translated too. messages are resolved from
  // the request config; NextIntlClientProvider inherits them server-side
  // and serializes the needed namespaces to the client automatically.
  const shell = (inner: React.ReactNode) => (
    <NextIntlClientProvider>
      <div
        lang={htmlLang}
        dir={dir}
        className="min-h-dvh w-full dark"
      >
        <AuroraBackground />
        {inner}
      </div>
    </NextIntlClientProvider>
  );

  // Route protection is handled by middleware. Here we only decide whether to
  // render the admin chrome (authed) or a bare shell (login / setup).
  if (!session) {
    return shell(children);
  }

  // Load pages for the page switcher (only when authed). #124: the switcher
  // and dashboard are scoped to the pages the user's role may SEE — a plain
  // member never sees (or can pick) anyone else's page here.
  const capsForUser = await getCapabilitiesForUser(session.userId);
  const allPages = await getAllPages();
  const visiblePages = filterVisiblePages(allPages, capsForUser.caps, session.userId);
  const pageList = visiblePages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    isDefault: p.isDefault,
    isPublished: p.isPublished,
  }));

  return (
    <NextIntlClientProvider>
    <PreviewProvider pages={pageList}>
      <React.Suspense fallback={null}>
      <div
        lang={htmlLang}
        dir={dir}
        className="dark relative min-h-dvh bg-background text-foreground"
      >
        <AuroraBackground />
        {/* Full-bleed row: sidebar anchors to the left edge instead of floating
            in a centered box, so the layout stays grounded at every resolution. */}
        <div className="flex w-full">
          {/* Sidebar — pinned left, full viewport height, sticky while scrolling */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex md:sticky md:top-0 md:h-dvh md:self-start">
            <div className="mb-8 flex items-center gap-2 px-2">
              <a
                href="https://linkbreeze.omnirise.dev/"
                target="_blank"
                rel="noopener noreferrer"
                title={t("visitSite")}
                aria-label={t("visitSite")}
                className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
              >
                <Image src="/logo-mark.svg" alt="LinkBreeze" width={24} height={24} unoptimized />
                <span className="font-heading text-lg font-semibold">LinkBreeze</span>
              </a>
            </div>

            <React.Suspense fallback={null}>
              <AdminNav canManageAccounts={capsForUser.caps.manageAccounts} canManageInstance={capsForUser.caps.manageInstance} />
            </React.Suspense>

            <div className="border-t border-border pt-3 mb-3">
              <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">
                {t("pagesSection")}
              </p>
              <React.Suspense fallback={null}>
                <PageSwitcher pages={pageList} />
              </React.Suspense>
            </div>

            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
              <span className="px-2.5 text-xs text-muted-foreground">
                {t.rich("signedInAs", {
                  name: session.username,
                  b: (chunk) => (
                    <span className="font-medium text-foreground">{chunk}</span>
                  ),
                })}
              </span>
              <form action={logout}>
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  className="w-full justify-start gap-2"
                >
                  <LogOut className="size-4" />
                  {t("signOut")}
                </Button>
              </form>
            </div>
          </aside>

          {/* Main column */}
          <div className="flex min-h-dvh flex-1 flex-col min-w-0">
            {/* Mobile top bar */}
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 md:hidden">
              <div className="flex items-center gap-2">
                <a
                  href="https://linkbreeze.omnirise.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("visitSite")}
                  aria-label={t("visitSite")}
                  className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
                >
                  <Image src="/logo-mark.svg" alt="LinkBreeze" width={24} height={24} unoptimized />
                  <span className="font-heading font-semibold">LinkBreeze</span>
                </a>
              </div>
              <div className="flex items-center gap-2">
                <React.Suspense fallback={null}>
                  <PageSwitcher pages={pageList} variant="compact" />
                </React.Suspense>
                <form action={logout}>
                  <Button variant="ghost" size="icon-sm" type="submit">
                    <LogOut className="size-4" />
                  </Button>
                </form>
              </div>
            </header>

            {/* pb-24 reserves space for the fixed mobile tab bar so content is
                never hidden behind it; md:pb-8 restores desktop padding. */}
            <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
              <div className="w-full">
                {isDemoMode && (
                  <div className="mb-4 shrink-0 rounded-lg border border-violet/30 bg-violet/10 px-4 py-3 text-sm text-lavender">
                    <strong>{t("demoBannerLead")}</strong>{" "}
                    <a href="https://linkbreeze.omnirise.dev/" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
                      {t("demoBannerVisit")}
                    </a>
                    {" · "}
                    <a href="https://github.com/Manak-hash/LinkBreeze" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
                      {t("demoBannerDeploy")}
                    </a>
                  </div>
                )}
                {children}
              </div>
            </main>
            <React.Suspense fallback={null}>
              <MobileTabBar canManageAccounts={capsForUser.caps.manageAccounts} canManageInstance={capsForUser.caps.manageInstance} />
            </React.Suspense>
          </div>
        </div>
      </div>
      </React.Suspense>
      </PreviewProvider>
    </NextIntlClientProvider>
  );
}

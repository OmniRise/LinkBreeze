import { QrCode } from "lucide-react";
import { createHash } from "node:crypto";
import {
  getAllPages,
  getDefaultPage,
  getAllThemes,
  getActiveTheme,
  getAnalyticsRetentionDays,
  getSetting,
  getAllSubscribers,
  getActiveLinks,
  getOidcSettingsRaw,
  getCapabilitiesForUser,
} from "@/server/queries";
import { isUpdateCheckEnabled, getUpdateStatus } from "@/lib/update-check";
import { maybeRunScheduledBackup, getBackupOverview } from "@/server/backup-scheduler";
import { formatTimeOfDay } from "@/lib/backup-schedule";
import { parseQrStyle } from "@/lib/qr-style";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/server/queries";
import { QrCard } from "./qr-card";
import { GeneralTab, IntegrationTab, AppearanceTab, CustomCssCard } from "./settings-tab-forms";
import { OgImageCard } from "./og-image-card";
import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorCard } from "./two-factor-card";
import { OidcCard } from "./oidc-card";
import { DataManager } from "./data-manager";
import { UpdateStatusCard } from "./update-status-card";
import { BackupsCard } from "./backups-card";
import { SubscribersCard } from "./subscribers-card";
import { MigrationWizard } from "@/components/admin/MigrationWizard";
import { SettingsTabs } from "./settings-tabs";
import { WalletStatusCard } from "./wallet-status-card";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const session = await getSession();
  const currentUser = session ? await getUserById(session.userId) : null;
  async function getTotpEnabled(): Promise<boolean> {
    return Boolean(currentUser?.totpEnabled);
  }

  const [allPages, defaultPage] = await Promise.all([
    getAllPages(),
    getDefaultPage(),
  ]);
  let activePage;
  if (pageParam) {
    activePage = allPages.find((p) => p.id === Number(pageParam));
  }
  if (!activePage) {
    activePage = defaultPage ?? allPages[0];
  }

  const [themes, active, updateCheckEnabled, retentionDays, consentText, subscribers, searchEngineHidden] = await Promise.all([
    getAllThemes(),
    getActiveTheme(),
    isUpdateCheckEnabled(),
    getAnalyticsRetentionDays(),
    getSetting("consentText"),
    getAllSubscribers(),
    getSetting("searchEngineHidden"),
  ]);

  const slug = activePage?.slug || "u";
  const t = await getTranslations("settings");

  // Update status card (Data tab): installed vs latest on GitHub + website.
  const updateStatus = await getUpdateStatus();
  const oidcRaw = await getOidcSettingsRaw();
  const canManageInstance = session
    ? (await getCapabilitiesForUser(session.userId)).caps.manageInstance
    : false;

  // #83: opportunistic scheduled-backup trigger on admin loads (quiet
  // instances whose owners log in but get no public traffic still back up).
  maybeRunScheduledBackup();
  const backupOverview = await getBackupOverview();

  // Cache-buster for the OG preview: a hash of every page input the rendered
  // card consumes (theme, display name/title, bio, avatar). ANY change to any
  // of them — theme pick, profile edits, avatar upload — yields a new version,
  // so the preview in the Appearance tab re-fetches without a manual reload.
  // Poster Hero (#83 follow-up): the auto card now renders the page's top
  // link titles, so link edits must bust the preview cache too.
  const ogLinkTitles = activePage
    ? (await getActiveLinks(activePage.id)).map((l) => l.title)
    : [];
  const ogPreviewVersion = createHash("sha1")
    .update(
      [
        activePage?.id ?? 0,
        activePage?.themeId ?? 0,
        activePage?.title ?? "",
        activePage?.bio ?? "",
        activePage?.avatarUrl ?? "",
        activePage?.ogImageUrl ?? "",
        activePage?.ogImagePosX ?? 0,
        ogLinkTitles.join("\u0001"),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);

  // Theme accent swatches offered as one-click QR colors (valid hex only).
  const qrThemePresets = Array.from(
    new Set(
      [active?.primaryColor, active?.secondaryColor]
        .filter((c): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c))
        .map((c) => c.toLowerCase()),
    ),
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { slug })}
        </p>
      </div>

      <SettingsTabs
        allowed={canManageInstance ? undefined : ["security"]}
        tabs={{
          general: (
            <GeneralTab
              pageId={activePage?.id}
              slug={slug}
              title={activePage?.seoTitle || ""}
              description={activePage?.seoDescription || ""}
              footerText={activePage?.footerText || ""}
              privacyPolicy={activePage?.privacyPolicy || ""}
              searchEngineHidden={searchEngineHidden === "true"}
            />
          ),
          integration: (
            <div className="flex flex-col gap-4">
              <WalletStatusCard />
              <IntegrationTab
                pageId={activePage?.id}
                slug={slug}
                analyticsScript={activePage?.analyticsScript || ""}
                consentText={consentText}
                emailCapture={activePage?.emailCapture ?? false}
                shareEnabled={activePage?.shareEnabled ?? false}
              />
            </div>
          ),
          appearance: (
            <div className="flex flex-col gap-4">
              <AppearanceTab
                pageId={activePage?.id}
                slug={slug}
                customCss={activePage?.customCss || ""}
                faviconUrl={activePage?.faviconUrl || ""}
                themes={themes}
                activeThemeId={activePage?.themeId ?? active?.id ?? null}
              />
              {/* Social preview (OG) image — lives in the appearance tab */}
              {activePage ? (
                <OgImageCard
                  pageId={activePage.id}
                  slug={slug}
                  initialMode={activePage.ogImageMode ?? null}
                  initialUrl={activePage.ogImageUrl ?? null}
                  initialFit={activePage.ogImageFit ?? null}
                  initialPosX={activePage.ogImagePosX ?? null}
                  initialPosY={activePage.ogImagePosY ?? null}
                  initialZoom={activePage.ogImageZoom ?? null}
                  previewVersion={ogPreviewVersion}
                />
              ) : null}
              {/* QR Code customizer in appearance tab */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="size-5" />{t("qrTitle")}</CardTitle>
                  <CardDescription>
                    {t("qrCardDesc", { slug })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <QrCard
                    pageId={activePage?.id}
                    slug={slug}
                    initialStyle={parseQrStyle(activePage?.qrSettings)}
                    avatarAvailable={Boolean(activePage?.avatarUrl)}
                    faviconAvailable={Boolean(activePage?.faviconUrl)}
                    themePresets={qrThemePresets}
                  />
                </CardContent>
              </Card>
              {/* Custom CSS — own container, bottom of the tab */}
              <CustomCssCard
                pageId={activePage?.id}
                slug={slug}
                customCss={activePage?.customCss || ""}
              />
            </div>
          ),
          security: (
            <div className="flex flex-col gap-4">
              <ChangePasswordForm />
              <TwoFactorCard enabled={await getTotpEnabled()} />
              {canManageInstance && (
                <OidcCard
                  issuer={oidcRaw.issuer ?? ""}
                  clientId={oidcRaw.clientId ?? ""}
                  jit={oidcRaw.jit !== "off"}
                  mode={oidcRaw.mode === "replaces_local" ? "replaces_local" : "optional"}
                  secretSet={Boolean(process.env.OIDC_CLIENT_SECRET)}
                />
              )}
            </div>
          ),
          data: (
            <div className="flex flex-col gap-4">
              <UpdateStatusCard
                initial={updateStatus}
                checksEnabled={updateCheckEnabled}
              />
              <MigrationWizard pageId={activePage?.id ?? 0} />
              <SubscribersCard
                subscribers={subscribers}
                emailCaptureEnabled={activePage?.emailCapture ?? false}
              />
              <DataManager
                retentionDays={String(retentionDays)}
                updateCheckEnabled={updateCheckEnabled}
              />
              {/* Scheduled backups (#83) — config + stored-backup list */}
              <BackupsCard
                enabled={backupOverview.config.enabled}
                frequency={backupOverview.config.frequency}
                timeOfDay={formatTimeOfDay(backupOverview.config.timeOfDayMinutes)}
                retention={backupOverview.config.retention}
                backups={backupOverview.backups}
                lastRunAt={backupOverview.lastRunAt}
                lastResult={backupOverview.lastResult}
                backupDir={backupOverview.backupDir}
                freeMb={backupOverview.freeMb}
                minFreeMb={backupOverview.minFreeMb}
              />
            </div>
          ),
        }}
      />
    </div>
  );
}

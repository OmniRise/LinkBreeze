"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateSettings } from "@/server/actions/settings";
import { updatePageAction } from "@/server/actions/pages";
import type { ThemeRow } from "@/server/queries";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePreview } from "@/components/admin/PreviewPane";
import { useSavedAction, useAutosavedForm } from "@/hooks/use-saved-action";
import { LanguageCard } from "./language-card";

// ── Favicon upload (used in Appearance tab) ──────────────────────────────

function FaviconUpload({
  faviconUrl,
  onUpload,
}: {
  faviconUrl: string;
  onUpload: (url: string) => void;
}) {
  const t = useTranslations("settings.appearance");
  const tErr = useTranslations("errors");
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { uploadFavicon } = await import("@/server/actions/uploads");
      const res = await uploadFavicon(fd);
      if (res.success) {
        onUpload(res.url);
      } else {
        setError(localizeActionError(tErr, res.error));
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <FormField
      label={t("favicon")}
      htmlFor="faviconUpload"
      hint={t("faviconHint")}
    >
      <div className="flex flex-wrap items-center gap-3">
        {faviconUrl ? (
          <Image
            src={faviconUrl}
            alt={t("currentFavicon")}
            width={32}
            height={32}
            unoptimized
            className="size-8 rounded border border-border object-contain"
          />
        ) : null}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
          {uploading ? t("uploading") : t("uploadFavicon")}
          <input
            type="file"
            accept=".ico,.png,.svg,.gif,.webp,image/x-icon,image/png,image/svg+xml,image/gif,image/webp"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </FormField>
  );
}

interface GeneralTabProps {
  pageId?: number;
  slug: string;
  title: string;
  description: string;
  footerText: string;
  privacyPolicy: string;
  searchEngineHidden: boolean;
  vcard: {
    organization: string;
    jobTitle: string;
    email: string;
    phone: string;
    address: string;
  };
}

export function GeneralTab({
  pageId,
  slug,
  title,
  description,
  footerText,
  privacyPolicy,
  searchEngineHidden,
  vcard,
}: GeneralTabProps) {
  const t = useTranslations("settings.general");
  const startTransition = (fn: () => Promise<void>) => void fn();
  const savedAction = useSavedAction();
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    if (pageId) {
      formData.set("pageId", String(pageId));
      formData.set("seoTitle", formData.get("title") as string);
      formData.set("seoDescription", formData.get("description") as string);
      startTransition(async () => {
        await savedAction.run(updatePageAction, formData);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      await savedAction.run(updateSettings, formData);
      router.refresh();
    });
  };

  // Debounced autosave: same submit path as the Save button; note the SEO
  // mapping needs pageId-aware fields, so the flush rebuilds them here.
  const { formRef, schedule, flushNow } = useAutosavedForm((formData) => {
    if (pageId) {
      formData.set("pageId", String(pageId));
      formData.set("seoTitle", formData.get("title") as string);
      formData.set("seoDescription", formData.get("description") as string);
      return savedAction.run(updatePageAction, formData);
    }
    return savedAction.run(updateSettings, formData);
  });

  return (
    <div className="flex flex-col gap-6">
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <form
        ref={formRef}
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed settings save must keep the typed values.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        onBlurCapture={() => flushNow()}
      >
        <CardContent className="flex flex-col gap-4">
          <FormField
            label={t("pageSlug")}
            htmlFor="slug"
            required
            hint={t.rich("slugHintRich", { slug: slug || "u", code: (chunk) => <code>{chunk}</code> })}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/</span>
              <Input
                id="slug"
                name="slug"
                defaultValue={slug}
                required
                pattern="^@?[a-zA-Z0-9_\-]+$"
                maxLength={64}
                className="max-w-48"
                onChange={() => schedule()}
              />
              <a
                href={`/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("viewPublicPage")}
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
          </FormField>

          <FormField label={t("pageTitle")} htmlFor="title">
            <Input
              id="title"
              name="title"
              defaultValue={title}
              maxLength={120}
              placeholder={t("pageTitlePlaceholder")}
              onChange={() => schedule()}
            />
          </FormField>

          <FormField label={t("seoDescription")} htmlFor="description">
            <Input
              id="description"
              name="description"
              defaultValue={description}
              maxLength={300}
              placeholder={t("seoPlaceholder")}
              onChange={() => schedule()}
            />
          </FormField>

          <FormField label={t("footerText")} htmlFor="footerText">
            <Input
              id="footerText"
              name="footerText"
              defaultValue={footerText}
              maxLength={200}
              placeholder={t("footerPlaceholder")}
              onChange={() => schedule()}
            />
          </FormField>

          <FormField
            label={t("privacyPolicy")}
            htmlFor="privacyPolicy"
            hint={t.rich("privacyHintRich", { slug, code: (chunk) => <code>{chunk}</code>, strong: (chunk) => <strong>{chunk}</strong>, em: (chunk) => <em>{chunk}</em> })}
          >
            <textarea
              id="privacyPolicy"
              name="privacyPolicy"
              defaultValue={privacyPolicy}
              maxLength={20000}
              placeholder={t("privacyPlaceholder")}
              onChange={() => schedule()}
              className="min-h-[160px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              spellCheck={false}
            />
          </FormField>
        </CardContent>
      </form>
    </Card>
    {pageId ? <ContactCardCard pageId={pageId} values={vcard} /> : null}
    <SearchVisibilityCard initialHidden={searchEngineHidden} slug={slug} />
    <LanguageCard />
    </div>
  );
}

// ── Search-engine visibility (#94) ───────────────────────────────────────

function SearchVisibilityCard({
  initialHidden,
  slug,
}: {
  initialHidden: boolean;
  slug: string;
}) {
  const t = useTranslations("settings.visibility");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [hidden, setHidden] = React.useState(initialHidden);
  const router = useRouter();

  // Flip the setting server-side immediately — the switch IS the action.
  // There is nothing else to "save" in this card, so a separate Save
  // button would only invite doubt about whether the toggle took.
  const toggle = (next: boolean) => {
    setHidden(next);
    startTransition(async () => {
      const fd = new FormData();
      // The settings schema requires slug on every updateSettings call
      // (global settings live beside the default page's identity).
      fd.set("slug", slug || "u");
      fd.set("searchEngineHidden", next ? "true" : "false");
      await updateSettings(fd);
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-background/50 p-4 transition-colors hover:bg-muted/50">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {hidden ? t("hiddenLabel") : t("visibleLabel")}
            </span>
            <span className="text-xs text-muted-foreground">
              {hidden ? t("hiddenHint") : t("visibleHint")}
            </span>
          </span>
          <Switch checked={!hidden} onCheckedChange={(v) => toggle(!v)} disabled={pending} />
        </label>
      </CardContent>
      <CardFooter className="gap-3">
        {pending ? (
          <span className="text-sm text-muted-foreground">{tCommon("saving")}</span>
        ) : saved ? (
          <span className="text-sm text-muted-foreground">{tCommon("saved")}</span>
        ) : (
          <p className="text-xs text-muted-foreground">{t("footnote")}</p>
        )}
      </CardFooter>
    </Card>
  );
}

// ── Integration Tab ──────────────────────────────────────────────────────

interface IntegrationTabProps {
  pageId?: number;
  slug: string;
  analyticsScript: string | null;
  consentText: string | null;
  emailCapture: boolean;
  shareEnabled: boolean;
}

export function IntegrationTab({
  pageId,
  slug,
  analyticsScript,
  consentText,
  emailCapture,
  shareEnabled,
}: IntegrationTabProps) {
  const t = useTranslations("settings.integration");
  const tInt = t;
  const startTransition = (fn: () => Promise<void>) => void fn();
  const [emailEnabled, setEmailEnabled] = React.useState(emailCapture);
  const [shareOn, setShareOn] = React.useState(shareEnabled);
  const savedAction = useSavedAction();
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    formData.set("emailCapture", emailEnabled ? "on" : "off");
    formData.set("shareEnabled", shareOn ? "on" : "off");
    if (pageId) {
      formData.set("pageId", String(pageId));
      startTransition(async () => {
        await savedAction.run(updatePageAction, formData);
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      await savedAction.run(updateSettings, formData);
      router.refresh();
    });
  };

  // Debounced autosave: the toggles' current state rides via a ref so the
  // flush always carries the same checkbox contract as an explicit save.
  const toggleStateRef = React.useRef({ emailEnabled, shareOn });
  React.useEffect(() => {
    toggleStateRef.current = { emailEnabled, shareOn };
  }, [emailEnabled, shareOn]);
  const { formRef, schedule, flushNow } = useAutosavedForm((formData) => {
    const { emailEnabled: email, shareOn: share } = toggleStateRef.current;
    formData.set("emailCapture", email ? "on" : "off");
    formData.set("shareEnabled", share ? "on" : "off");
    if (pageId) {
      formData.set("pageId", String(pageId));
      return savedAction.run(updatePageAction, formData);
    }
    return savedAction.run(updateSettings, formData);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <form
        ref={formRef}
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed settings save must keep the typed values.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        onBlurCapture={() => flushNow()}
      >
        <CardContent className="flex flex-col gap-4">
          {pageId ? null : (
            <input type="hidden" name="slug" value={slug} />
          )}

          <FormField
            label={t("analyticsScript")}
            htmlFor="analyticsScript"
            hint={tInt.rich("analyticsHintRich", { code: (chunk) => <code>{chunk}</code> })}
          >
            <textarea
              id="analyticsScript"
              name="analyticsScript"
              defaultValue={analyticsScript || ""}
              maxLength={2000}
              placeholder={'<script defer data-domain="example.com" src="https://plausible.io/js/script.js"></script>'}
              onChange={() => schedule()}
              className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              spellCheck={false}
            />
          </FormField>

          <FormField
            label={t("emailCapture")}
            hint={tInt.rich("emailCaptureHintRich", {})}
          >
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={emailEnabled}
                onCheckedChange={(v) => {
                  setEmailEnabled(v);
                  schedule();
                }}
              />
              {emailEnabled ? t("enabled") : t("disabled")}
            </label>
          </FormField>

          {emailEnabled ? (
          <FormField
            label={t("consentText")}
            htmlFor="consentText"
            hint={tInt.rich("consentHintRich", { em: (chunk) => <em>{chunk}</em> })}
          >
            <Input
              id="consentText"
              name="consentText"
              defaultValue={consentText || ""}
              maxLength={500}
              placeholder={t("consentPlaceholder")}
              onChange={() => schedule()}
            />
          </FormField>
          ) : null}

          <FormField
            label={t("shareBlock")}
            hint={tInt.rich("shareBlockHintRich", { em: (chunk) => <em>{chunk}</em> })}
          >
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={shareOn}
                onCheckedChange={(v) => {
                  setShareOn(v);
                  schedule();
                }}
              />
              {shareOn ? t("enabled") : t("disabled")}
            </label>
          </FormField>
        </CardContent>
      </form>
    </Card>
  );
}

// ── Appearance Tab ───────────────────────────────────────────────────────
//
// Structure (Spec: "Appearance redesign"):
//   <AppearanceTab>   — theme showcase card + favicon card (one autosaving form)
//   <CustomCssCard>   — own container, mounted last in the tab by page.tsx

import { Check, ChevronDown, ChevronUp, ImagePlus } from "lucide-react";
import { resolveBackground } from "@/lib/theme-tokens";

/** Mini live preview of a theme built from its real tokens (mirrors the
 * /theme page's preset gallery so both feel like the same component). */
function ThemeMiniPreview({ theme }: { theme: ThemeRow }) {
  const isAurora = theme.backgroundType === "aurora";
  const bg = resolveBackground(theme);
  const bgStyle: React.CSSProperties = isAurora
    ? { background: theme.backgroundValue?.split(",")[0]?.trim() || "#0a0820" }
    : { background: bg };
  return (
    <div className="flex h-20 flex-col items-center justify-center overflow-hidden" style={bgStyle}>
      <div
        className="mb-1 size-4 rounded-full"
        style={{ background: theme.primaryColor ?? "#7c5ff0" }}
      />
      <div
        className="mb-1.5 h-1 w-12 rounded-full"
        style={{ background: theme.textColor ?? "#fff", opacity: 0.8 }}
      />
      <div className="w-full px-1.5">
        <div
          className="rounded border p-1"
          style={{
            background: theme.cardBackground ?? "rgba(255,255,255,0.1)",
            borderColor: theme.cardBorderColor ?? "rgba(255,255,255,0.1)",
          }}
        >
          <div
            className="h-0.5 w-full rounded-full"
            style={{ background: theme.textColor ?? "#fff", opacity: 0.5 }}
          />
        </div>
      </div>
    </div>
  );
}

/** Swatch dots for a theme (background stops + accent colors, deduped). */
function themeSwatches(theme: ThemeRow): string[] {
  const fromBg = (theme.backgroundValue ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#|rgb|hsl/.test(c));
  return Array.from(
    new Set([theme.primaryColor, theme.secondaryColor, ...fromBg].filter(Boolean)),
  ).slice(0, 4);
}

function ThemeOptionCard({
  theme,
  active,
  onSelect,
}: {
  theme: ThemeRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={active}
      className="group relative overflow-hidden rounded-xl border border-border text-left transition-all hover:ring-2 hover:ring-ring/50 data-[active=true]:ring-2 data-[active=true]:ring-primary"
    >
      <ThemeMiniPreview theme={theme} />
      <div className="flex items-center justify-between gap-2 bg-card p-2">
        <span className="truncate text-xs font-medium">{theme.name}</span>
        {active ? (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-2.5" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

interface AppearanceTabProps {
  pageId?: number;
  slug?: string;
  customCss: string;
  faviconUrl: string;
  themes: ThemeRow[];
  activeThemeId: number | null;
}

export function AppearanceTab({
  pageId,
  slug,
  faviconUrl: initialFaviconUrl,
  themes,
  activeThemeId,
}: AppearanceTabProps) {
  const t = useTranslations("settings.appearance");
  const savedAction = useSavedAction();
  const startTransition = (fn: () => Promise<void>) => void fn();
  const { reload: reloadPreview } = usePreview();
  const router = useRouter();
  const [selectedTheme, setSelectedTheme] = React.useState<string>(
    activeThemeId ? String(activeThemeId) : "",
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [faviconUrl, setFaviconUrl] = React.useState(initialFaviconUrl);

  const currentThemeId = selectedTheme || (activeThemeId ? String(activeThemeId) : "");
  const activeTheme = themes.find((th) => String(th.id) === currentThemeId) ?? null;

  const handleFaviconUploaded = (url: string) => {
    setFaviconUrl(url);
    reloadPreview();
    // The hidden faviconUrl input just changed — flush it through the same
    // autosave path as any field (rAF so React commits the value before the
    // flush reads FormData).
    requestAnimationFrame(schedule);
  };

  const handleSubmit = (formData: FormData) => {
    if (pageId) {
      formData.set("pageId", String(pageId));
      if (selectedTheme) formData.set("themeId", selectedTheme);
      startTransition(async () => {
        await savedAction.run(updatePageAction, formData);
        router.refresh();
      });
      return;
    }
    if (selectedTheme) formData.set("activeThemeId", selectedTheme);
    startTransition(async () => {
      await savedAction.run(updateSettings, formData);
      router.refresh();
    });
  };

  // Debounced autosave; theme chips already save immediately on click (see
  // selectTheme below).
  const selectedThemeRef = React.useRef(selectedTheme);
  React.useEffect(() => {
    selectedThemeRef.current = selectedTheme;
  }, [selectedTheme]);
  const { formRef, schedule, flushNow } = useAutosavedForm((formData) => {
    const theme = selectedThemeRef.current;
    if (pageId) {
      formData.set("pageId", String(pageId));
      if (theme) formData.set("themeId", theme);
      return savedAction.run(updatePageAction, formData);
    }
    if (theme) formData.set("activeThemeId", theme);
    return savedAction.run(updateSettings, formData);
  });

  // Theme pick = immediate save (selection is intentional and rare, unlike
  // typing) — and the showcase collapses back to the single selected card.
  const selectTheme = (id: string) => {
    setSelectedTheme(id);
    setPickerOpen(false);
    const fd = new FormData();
    if (pageId) {
      fd.set("pageId", String(pageId));
      fd.set("themeId", id);
      if (faviconUrl) fd.set("faviconUrl", faviconUrl);
      void savedAction.run(updatePageAction, fd);
    } else {
      fd.set("slug", slug ?? "");
      fd.set("activeThemeId", id);
      void savedAction.run(updateSettings, fd);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        // Opt out of React 19's post-action auto-reset of uncontrolled
        // inputs: a failed settings save must keep the typed values.
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
      onBlurCapture={() => flushNow()}
    >
      <div className="flex flex-col gap-4">
        {/* Theme showcase — only the selected theme, full visual treatment */}
        {themes.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {activeTheme ? (
                <div className="flex items-center gap-4 rounded-xl border border-border p-3">
                  <div className="w-32 shrink-0 overflow-hidden rounded-lg border border-border">
                    <ThemeMiniPreview theme={activeTheme} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {activeTheme.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-violet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-lavender">
                        {t("activeTheme")}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {themeSwatches(activeTheme).map((c) => (
                        <span
                          key={c}
                          className="size-3.5 rounded-full border border-white/10"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      aria-expanded={pickerOpen}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      {pickerOpen ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {t("changeTheme")}
                    </button>
                  </div>
                </div>
              ) : null}

              {pickerOpen ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {themes.map((th) => (
                    <ThemeOptionCard
                      key={th.id}
                      theme={th}
                      active={String(th.id) === currentThemeId}
                      onSelect={() => selectTheme(String(th.id))}
                    />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Favicon — prominent branding card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImagePlus className="size-5" />
              {t("favicon")}
            </CardTitle>
            <CardDescription>{t("faviconHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
                {faviconUrl ? (
                  <Image
                    src={faviconUrl}
                    alt={t("currentFavicon")}
                    width={40}
                    height={40}
                    unoptimized
                    className="size-10 rounded object-contain"
                  />
                ) : (
                  <ImagePlus className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <FaviconUpload faviconUrl={faviconUrl} onUpload={handleFaviconUploaded} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

// ── Custom CSS — own container, bottom of the Appearance tab ─────────────

/** Own container: custom CSS lives at the bottom of the Appearance tab. */
export function CustomCssCard({ pageId, slug, customCss }: {
  pageId?: number;
  slug?: string;
  customCss: string;
}) {
  const tInt = useTranslations("settings.integration");
  const savedAction = useSavedAction();
  const router = useRouter();
  const startTransition = (fn: () => Promise<void>) => void fn();

  const handleSubmit = (formData: FormData) => {
    if (pageId) {
      formData.set("pageId", String(pageId));
      startTransition(async () => {
        await savedAction.run(updatePageAction, formData);
        router.refresh();
      });
      return;
    }
    // updateSettings requires the page identity on every call.
    formData.set("slug", slug ?? "u");
    startTransition(async () => {
      await savedAction.run(updateSettings, formData);
      router.refresh();
    });
  };

  const { formRef, schedule, flushNow } = useAutosavedForm((formData) => {
    if (pageId) {
      formData.set("pageId", String(pageId));
      return savedAction.run(updatePageAction, formData);
    }
    formData.set("slug", slug ?? "u");
    return savedAction.run(updateSettings, formData);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tInt("customCss")}</CardTitle>
        <CardDescription>
          {tInt.rich("customCssHintRich", { code: (chunk) => <code>{chunk}</code> })}
        </CardDescription>
      </CardHeader>
      <form
        ref={formRef}
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed settings save must keep the typed values.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        onBlurCapture={() => flushNow()}
      >
        <CardContent>
          <FormField htmlFor="customCss">
            <textarea
              id="customCss"
              name="customCss"
              defaultValue={customCss}
              maxLength={10000}
              placeholder={"/* Custom styles for your public page */\n:root { --accent: #533fd6; }"}
              onChange={() => schedule()}
              className="min-h-[160px] w-full rounded-lg border border-input bg-background/50 px-3 py-2.5 font-mono text-xs leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              spellCheck={false}
            />
          </FormField>
        </CardContent>
      </form>
    </Card>
  );
}
// ── Contact card (native vCard overrides) ────────────────────────────────
// The public Save Contact card (/api/vcard/<slug>) is auto-generated from
// the page (title, bio, avatar, social links). Every field here is an
// OPTIONAL override: empty = keep the auto value, filled = win.

function ContactCardCard({
  pageId,
  values,
}: {
  pageId: number;
  values: {
    organization: string;
    jobTitle: string;
    email: string;
    phone: string;
    address: string;
  };
}) {
  const t = useTranslations("settings.vcard");
  const startTransition = (fn: () => Promise<void>) => void fn();
  const savedAction = useSavedAction();
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    formData.set("pageId", String(pageId));
    startTransition(async () => {
      await savedAction.run(updatePageAction, formData);
      router.refresh();
    });
  };

  const { formRef, schedule } = useAutosavedForm((formData) => {
    formData.set("pageId", String(pageId));
    return savedAction.run(updatePageAction, formData);
  });

  const fields = [
    { name: "vcardOrganization" as const, valueKey: "organization" as const, label: t("organization"), placeholder: t("organizationPlaceholder"), max: 120 },
    { name: "vcardJobTitle" as const, valueKey: "jobTitle" as const, label: t("jobTitle"), placeholder: t("jobTitlePlaceholder"), max: 120 },
    { name: "vcardEmail" as const, valueKey: "email" as const, label: t("email"), placeholder: t("emailPlaceholder"), max: 200 },
    { name: "vcardPhone" as const, valueKey: "phone" as const, label: t("phone"), placeholder: t("phonePlaceholder"), max: 60 },
    { name: "vcardAddress" as const, valueKey: "address" as const, label: t("address"), placeholder: t("addressPlaceholder"), max: 300 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <form
        ref={formRef}
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed settings save must keep the typed values.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        onBlurCapture={() => schedule()}
      >
        <CardContent className="flex flex-col gap-4">
          {fields.map((field) => (
            <FormField key={field.name} label={field.label} htmlFor={field.name}>
              <Input
                id={field.name}
                name={field.name}
                type={field.name === "vcardEmail" ? "email" : "text"}
                defaultValue={values[field.valueKey]}
                maxLength={field.max}
                placeholder={field.placeholder}
                onChange={() => schedule()}
              />
            </FormField>
          ))}
        </CardContent>
        <CardFooter className="mt-4">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("save")}
          </button>
        </CardFooter>
      </form>
    </Card>
  );
}

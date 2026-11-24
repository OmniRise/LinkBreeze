"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateProfile } from "@/server/actions/profile";
import { updatePageAction } from "@/server/actions/pages";
import { uploadAvatar } from "@/server/actions/uploads";
import { useSavedAction, createAutosaver, useAutosavedForm } from "@/hooks/use-saved-action";
import {
  SUPPORTED_PLATFORMS,
  getPlatformLabel,
  getSocialIconSvg,
  type SocialPlatform,
} from "@/lib/social-icons";
import type { SocialLink } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { usePreview } from "@/components/admin/PreviewPane";
import {
  ImagePositionPicker,
  pickerValueFrom,
  pickerToFormFields,
  type ImagePositionPickerValue,
} from "@/components/admin/image-position-picker";

// ── Platform icon chip ───────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return (
    <span
      className={className}
      aria-label={getPlatformLabel(platform)}
      dangerouslySetInnerHTML={{ __html: getSocialIconSvg(platform).replace('width="24" height="24"', 'width="16" height="16"') }}
    />
  );
}

interface ProfileFormProps {
  profile: {
    displayName: string;
    bio: string;
    badgeText: string;
    avatarUrl: string;
    bannerUrl?: string | null;
    socialLinks: SocialLink[];
    // Per-upload image adjustment metadata (Spec: Image-Positioning)
    avatarFit?: string | null;
    avatarPosX?: number | null;
    avatarPosY?: number | null;
    avatarZoom?: number | null;
    bannerFit?: string | null;
    bannerPosX?: number | null;
    bannerPosY?: number | null;
    bannerZoom?: number | null;
  } | null;
  pageId?: number;
}

export function ProfileForm({ profile, pageId }: ProfileFormProps) {
  const t = useTranslations("profile");
  const tA = useTranslations("settings.appearance");
  const tErr = useTranslations("errors");
  const { reload: reloadPreview } = usePreview();
  const savedAction = useSavedAction();
  const [socialLinks, setSocialLinks] = React.useState<SocialLink[]>(
    profile?.socialLinks ?? [],
  );
  const startTransition = (fn: () => Promise<void>) => void fn();
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = React.useState(profile?.bannerUrl ?? "");
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = React.useState(false);
  const [bannerError, setBannerError] = React.useState<string | null>(null);

  // ── Debounced autosave (Spec B, extended) ──
  // Identity fields AND social links autosave; the flush reads the live
  // form values and the current socialLinks state (fresh closure kept by
  // useAutosavedForm), so both cards save through the same debounced path
  // as an explicit Save.
  const socialLinksRef = React.useRef(socialLinks);
  React.useEffect(() => {
    socialLinksRef.current = socialLinks;
  }, [socialLinks]);

  const persistProfile = React.useCallback(
    (formData: FormData) => {
      const cleaned = socialLinksRef.current.filter((s) => s.url.trim().length > 0);
      formData.set("socialLinks", JSON.stringify(cleaned));
      if (pageId) {
        formData.set("pageId", String(pageId));
        formData.set("title", formData.get("displayName") as string);
        void savedAction.run(updatePageAction, formData);
      } else {
        void savedAction.run(updateProfile, formData);
      }
    },
    [pageId, savedAction],
  );

  const { formRef, schedule, flushNow } = useAutosavedForm(persistProfile);

  // ── Image position pickers (Spec: Image-Positioning) ──
  // Controlled state: every drag/slider move re-renders the preview; the
  // debounced autosaver persists ~600ms after the last movement so a drag
  // costs ONE server action, not one per pointermove.
  const [avatarAdj, setAvatarAdj] = React.useState<ImagePositionPickerValue>(() =>
    pickerValueFrom(profile?.avatarFit, profile?.avatarPosX, profile?.avatarPosY, profile?.avatarZoom),
  );
  const [bannerAdj, setBannerAdj] = React.useState<ImagePositionPickerValue>(() =>
    pickerValueFrom(profile?.bannerFit, profile?.bannerPosX, profile?.bannerPosY, profile?.bannerZoom),
  );
  const [avatarAdjOpen, setAvatarAdjOpen] = React.useState(false);
  const [bannerAdjOpen, setBannerAdjOpen] = React.useState(false);
  const adjAutosave = React.useMemo(
    () =>
      createAutosaver((fd: FormData) => {
        void savedAction.run(updatePageAction, fd);
      }, 600),
    // run is a stable useCallback — depending on `savedAction` itself (a new
    // object each render) would recreate (and cancel) the autosaver mid-drag.
    [savedAction],
  );
  React.useEffect(() => () => adjAutosave.cancel(), [adjAutosave]);
  const saveAdjustments = (surface: "avatar" | "banner", v: ImagePositionPickerValue) => {
    if (!pageId) return; // legacy singleton profile has no adjustment columns
    const fd = new FormData();
    fd.set("pageId", String(pageId));
    for (const [k, val] of Object.entries(pickerToFormFields(surface, v))) {
      fd.set(k, val);
    }
    adjAutosave.schedule(fd);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAvatar(fd);
      if (res.success) {
        setAvatarUrl(res.url);
        // A fresh upload is exactly when positioning matters — open the
        // tool immediately (auto-open on upload) and reset stale metadata.
        setAvatarAdj(pickerValueFrom(null, null, null, null));
        setAvatarAdjOpen(true);
        reloadPreview();
        // Persist the new URL through the same autosave path as typing.
        // rAF lets React commit the controlled input value before the
        // flush reads FormData (same pattern as addSocialPlatform).
        requestAnimationFrame(schedule);
      } else {
        setUploadError(localizeActionError(tErr, res.error));
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    setBannerError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAvatar(fd);
      if (res.success) {
        setBannerUrl(res.url);
        setBannerAdj(pickerValueFrom(null, null, null, null));
        setBannerAdjOpen(true);
        reloadPreview();
        // Same autosave contract as the avatar upload above.
        requestAnimationFrame(schedule);
      } else {
        setBannerError(localizeActionError(tErr, res.error));
      }
    } catch {
      setBannerError("Upload failed. Please try again.");
    } finally {
      setBannerUploading(false);
      e.target.value = "";
    }
  };

  const addSocialPlatform = (platform: SocialPlatform) => {
    setSocialLinks((prev) => [...prev, { platform, url: "" }]);
    // Programmatic change: the new chip exists in state but not in the DOM
    // yet — schedule from the next tick so the flush reads the rendered row.
    requestAnimationFrame(schedule);
  };

  const updateSocial = (index: number, field: keyof SocialLink, value: string) => {
    setSocialLinks((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
    schedule(); // social links autosave
  };

  const removeSocial = (index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
    requestAnimationFrame(schedule);
  };

  const handleSubmit = (formData: FormData) => {
    const cleaned = socialLinks.filter((s) => s.url.trim().length > 0);
    formData.set("socialLinks", JSON.stringify(cleaned));

    // Multi-page: route through the page action.
    if (pageId) {
      formData.set("pageId", String(pageId));
      // Map profile field names to page field names.
      formData.set("title", formData.get("displayName") as string);
      startTransition(async () => {
        await savedAction.run(updatePageAction, formData);
      });
      return;
    }

    startTransition(async () => {
      await savedAction.run(updateProfile, formData);
    });
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("thisInformationAppearsOnYourPublicPage")}</p>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          // Opt out of React 19's post-action auto-reset of uncontrolled
          // inputs: a failed profile save must keep the typed values.
          e.preventDefault();
          handleSubmit(new FormData(e.currentTarget));
        }}
        onBlurCapture={() => flushNow()}
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
            <CardDescription>{t("identityDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar with aurora ring */}
              <div className="relative size-16 shrink-0">
                <div className="absolute -inset-0.5 rounded-full bg-[var(--aurora-grad)] opacity-40 blur-sm" />
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="relative size-16 rounded-full object-cover ring-2 ring-lavender/30"
                  />
                ) : (
                  <div className="relative flex size-16 items-center justify-center rounded-full bg-muted text-xl font-semibold ring-2 ring-lavender/30">
                    {(profile?.displayName || "?").charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <FormField label={t("avatar")} htmlFor="avatarUrl">
                  <Input
                    id="avatarUrl"
                    name="avatarUrl"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://…/avatar.png"
                  />
                </FormField>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
                    <Upload className="size-4" />
                    {uploading ? t("uploading") : t("uploadImage")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                  {uploadError ? (
                    <span className="text-xs text-destructive">{uploadError}</span>
                  ) : null}
                  {avatarUrl && pageId ? (
                    <button
                      type="button"
                      onClick={() => setAvatarAdjOpen((v) => !v)}
                      className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {tA("adjustPosition")}
                    </button>
                  ) : null}
                </div>
                {avatarUrl && pageId && avatarAdjOpen ? (
                  <div className="mt-3 rounded-xl border border-border p-3">
                    <ImagePositionPicker
                      surface="avatar"
                      src={avatarUrl}
                      value={avatarAdj}
                      onChange={(v) => {
                        setAvatarAdj(v);
                        saveAdjustments("avatar", v);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <FormField label={t("banner")} htmlFor="bannerUrl">
              <Input
                id="bannerUrl"
                name="bannerUrl"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://…/banner.jpg — shown in Hero / Banner layouts (Theme page)"
              />
            </FormField>
            <div className="-mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
                <Upload className="size-4" />
                {bannerUploading ? t("uploading") : t("uploadBanner")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerUpload}
                  disabled={bannerUploading}
                />
              </label>
              {bannerUrl ? (
                <span className="text-xs text-muted-foreground">
                  {bannerUrl.startsWith("/api/uploads/") ? t("uploadedCheck") : t("customUrl")}
                </span>
              ) : null}
              {bannerError ? (
                <span className="text-xs text-destructive">{bannerError}</span>
              ) : null}
              {bannerUrl && pageId ? (
                <button
                  type="button"
                  onClick={() => setBannerAdjOpen((v) => !v)}
                  className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {tA("adjustPosition")}
                </button>
              ) : null}
            </div>
            {bannerUrl && pageId && bannerAdjOpen ? (
              <div className="rounded-xl border border-border p-3">
                <ImagePositionPicker
                  surface="banner"
                  src={bannerUrl}
                  value={bannerAdj}
                  onChange={(v) => {
                    setBannerAdj(v);
                    saveAdjustments("banner", v);
                  }}
                />
              </div>
            ) : null}

            <FormField label={t("displayName")} htmlFor="displayName" required>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={profile?.displayName ?? ""}
                required
                maxLength={80}
                placeholder={t("displayNamePlaceholder")}
                onChange={() => schedule()}
              />
            </FormField>

            <FormField label={t("bio")} htmlFor="bio">
              <Input
                id="bio"
                name="bio"
                defaultValue={profile?.bio ?? ""}
                maxLength={300}
                placeholder={t("bioPlaceholder")}
                onChange={() => schedule()}
              />
            </FormField>

            <FormField label={t("badge")} htmlFor="badgeText">
              <Input
                id="badgeText"
                name="badgeText"
                defaultValue={profile?.badgeText ?? ""}
                maxLength={40}
                placeholder={t("availableForWork")}
                onChange={() => schedule()}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("socialLinks")}</CardTitle>
            <CardDescription>
              {t("socialLinksHint")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Existing social links with inline icon */}
            {socialLinks.length > 0 && (
              <div className="flex flex-col gap-2">
                {socialLinks.map((item, i) => (
                  <div key={`${item.platform}-${i}`} className="flex items-center gap-2">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet/15 text-lavender">
                      <PlatformIcon platform={item.platform as SocialPlatform} />
                    </div>
                    <Input
                      value={item.url}
                      onChange={(e) => updateSocial(i, "url", e.target.value)}
                      placeholder={`${getPlatformLabel(item.platform as SocialPlatform)} URL…`}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      onClick={() => removeSocial(i)}
                      className="text-destructive"
                      aria-label={t("removeSocial")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Platform picker — icon chips grid */}
            <Separator className="my-1" />
            <p className="text-xs font-medium text-muted-foreground">{t("addAPlatform")}</p>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_PLATFORMS.map((p) => {
                const alreadyAdded = socialLinks.some((s) => s.platform === p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={alreadyAdded}
                    title={getPlatformLabel(p)}
                    onClick={() => addSocialPlatform(p)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:scale-110 hover:border-violet/30 hover:bg-violet/15 hover:text-lavender",
                      alreadyAdded && "pointer-events-none opacity-30",
                    )}
                  >
                    <PlatformIcon platform={p} />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createLink,
  updateLink,
} from "@/server/actions/links";
import type { LinkRow, LinkSectionRow, ThemeRow } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LINK_TYPES,
  getUrlLabel,
  getUrlPlaceholder,
  prefixLinkUrl,
} from "../link-helpers";
import { LucideIcon, isLucideIconName } from "@/components/public/LucideIcon";
import { ChevronDownIcon, EyeIcon, ImagePlus, Sparkles } from "lucide-react";
import { IconPicker } from "./icon-picker";
import type { IconMode } from "@/lib/link-icons";
import {
  normalizeSlug,
  slugError,
  MAX_SLUG_LENGTH,
} from "@/lib/link-slug";
import { parseVCardLinkConfig } from "@/lib/vcard-link";
import {
  checkSlugAvailability,
  setAbTest,
} from "@/server/actions/links";
import { useSavedAction } from "@/hooks/use-saved-action";
import { AbTestEditor } from "./ab-test-editor";
import { CardPreview, PopupBodyPreview } from "./card-preview";
import {
  loadLinkDraft,
  saveLinkDraft,
  clearLinkDraft,
  linkDraftHasContent,
  type LinkDraft,
} from "@/lib/link-drafts";

/** Derive the dialog's initial icon mode from an editing row (#91). */
function initialIconMode(editing?: LinkRow | null): IconMode {
  if (editing?.iconMode === "lucide" && isLucideIconName(editing.icon)) return "lucide";
  if (editing?.iconMode === "custom" && editing.customIconUrl) return "custom";
  return "auto";
}
import {
  parseUTM,
  stripUTM,
  appendUTM,
  emptyUTM,
  hasUTM,
  type UTMParams,
} from "@/lib/utm";

export interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: LinkRow | null;
  pageId?: number;
  sections?: LinkSectionRow[];
  /** Page's resolved theme row — drives the 1:1 live card preview. */
  pageTheme?: ThemeRow | null;
  pageSlug?: string | null;
}

function SectionSelect({
  value,
  onValueChange,
  sections,
}: {
  value: string;
  onValueChange: (v: string | null) => void;
  sections: LinkSectionRow[];
}) {
  const t = useTranslations("linksPage");

  return (
    <FormField label={t("section")}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("noSection")}</SelectItem>
          {sections.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {isLucideIconName(s.icon) ? (
                <LucideIcon name={s.icon as string} size={14} className="mr-1 inline-block align-[-2px] text-muted-foreground" />
              ) : null}
              {s.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* "none" → empty string so the server action stores NULL. */}
      <input type="hidden" name="sectionId" value={value === "none" ? "" : value} />
    </FormField>
  );
}

/**
 * #96 custom /go/ redirect slug — controlled input with a live availability
 * check (debounced 500ms server round-trip; validation itself is local via
 * the pure helpers).
 *
 * onChange normalizes the WHOLE DOM value with keepTrailingSeparator so a
 * separator the user just typed survives the controlled re-render: plain
 * normalization would trim "my-" back to "my" — the SAME string React had —
 * so it skips the update and the next keystroke swallows the separator
 * ("myC" instead of "my-c").
 */
const SLUG_ERROR_KEYS = {
  invalid: "slugErrInvalid",
  reserved: "slugErrReserved",
  numeric: "slugErrNumeric",
  length: "slugErrLength",
} as const;

function SlugField({
  editing,
  initialSlug,
  onSlugChange,
}: {
  editing?: LinkRow | null;
  /** Draft-restored value — wins over the stored row (session remount). */
  initialSlug?: string;
  /** Mirror for the parent's draft persistence. */
  onSlugChange?: (slug: string) => void;
}) {
  const t = useTranslations("linksPage");
  const storedSlug = editing?.redirectSlug ?? "";
  const [value, setValue] = React.useState(initialSlug ?? storedSlug);
  // Set ONLY from the async check callback — render derives everything else
  // (react-hooks/set-state-in-effect forbids sync setState in effects).
  const [lastCheck, setLastCheck] = React.useState<{ slug: string; available: boolean } | null>(null);

  const display = normalizeSlug(value, { keepTrailingSeparator: true });
  const settled = normalizeSlug(value);
  const localReason = settled ? slugError(settled) : null;

  const isOwnStored = !!editing && settled === storedSlug;
  const status: "idle" | "checking" | "available" | "taken" = localReason
    ? "idle"
    : !settled
      ? "idle"
      : isOwnStored
        ? "available"
        : lastCheck?.slug === settled
          ? lastCheck.available
            ? "available"
            : "taken"
          : "checking";

  React.useEffect(() => {
    if (!settled || localReason || isOwnStored) return;
    const timer = setTimeout(async () => {
      const res = await checkSlugAvailability(settled, editing?.id);
      setLastCheck({ slug: settled, available: res.available === true });
    }, 500);
    return () => clearTimeout(timer);
  }, [settled, localReason, isOwnStored, editing]);

  return (
    <FormField label={t("slugLabel")} hint={t("slugHint")}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="shrink-0 text-xs text-muted-foreground">/go/</span>
        <Input
          id="redirectSlug"
          name="redirectSlug"
          value={display}
          onChange={(e) => {
            setValue(e.target.value);
            onSlugChange?.(e.target.value);
          }}
          maxLength={MAX_SLUG_LENGTH + 1}
          placeholder="my-consulting"
          autoComplete="off"
          spellCheck={false}
          className="flex-1"
        />
      </div>
      {localReason ? (
        <p role="alert" className="text-xs text-destructive">{t(SLUG_ERROR_KEYS[localReason])}</p>
      ) : status === "checking" ? (
        <p className="text-xs text-muted-foreground">{t("slugChecking")}</p>
      ) : status === "taken" ? (
        <p role="alert" className="text-xs text-destructive">{t("slugTaken")}</p>
      ) : status === "available" ? (
        <p className="text-xs text-emerald-600">{t("slugAvailable")}</p>
      ) : null}
    </FormField>
  );
}

export function LinkDialog({ open, onOpenChange, editing, pageId, sections = [], pageTheme, pageSlug }: LinkDialogProps) {
  const t = useTranslations("linksPage");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = React.useTransition();
  const [type, setType] = React.useState(editing?.type ?? "url");
  const [highlighted, setHighlighted] = React.useState(editing?.isHighlighted ?? false);
  const [active, setActive] = React.useState(editing?.isActive ?? true);
  const [scheduled, setScheduled] = React.useState(!!editing?.scheduleStart || !!editing?.scheduleEnd);
  // Icon mode (#91): auto favicon / lucide pick / uploaded image.
  const [iconMode, setIconMode] = React.useState<IconMode>(initialIconMode(editing));
  // autoIcon is no longer a separate toggle (#91 redesign): the Icon section's
  // Auto segment IS the toggle. autoIcon derives from the mode — only "auto"
  // fetches favicons — while `editing.autoIcon === false` (explicitly
  // switched off before this redesign) still round-trips: the stored value
  // seeds the mode for old rows and is preserved on save.
  const [autoIconPrefOff] = React.useState(editing?.autoIcon === false);
  const autoIcon = iconMode === "auto" && !autoIconPrefOff;
  const [lucidePick, setLucidePick] = React.useState(editing?.iconMode === "lucide" ? editing.icon ?? "" : "");
  const [customIconUrl, setCustomIconUrl] = React.useState(editing?.iconMode === "custom" ? editing.customIconUrl ?? "" : "");
  const [iconFileName, setIconFileName] = React.useState("");
  const iconFileRef = React.useRef<HTMLInputElement>(null);
  // True once a NEW file is chosen in this session (drives preview swap).
  const [hasNewIconFile, setHasNewIconFile] = React.useState(false);
  const [cardStyle, setCardStyle] = React.useState<"compact" | "rich">(
    editing?.cardStyle === "rich" ? "rich" : "compact",
  );
  // Live card preview pane (expandable sheet): open when editing, where the
  // styling usually matters; collapsed for a quick add.
  const [previewOpen, setPreviewOpen] = React.useState(!!editing);
  // Controlled inputs — every keystroke updates these mirrors, which feed
  // the live preview AND the debounced sessionStorage draft (link-drafts.ts).
  const [titleValue, setTitleValue] = React.useState(editing?.title ?? "");
  // Starts at the DISPLAY url (UTM stripped for edited url links) — the same
  // value the old defaultValue showed; UTM params re-append on submit.
  const [urlValue, setUrlValue] = React.useState(() =>
    editing?.type === "url" && hasUTM(editing?.url ?? "")
      ? stripUTM(editing.url)
      : editing?.url ?? "",
  );
  const [descValue, setDescValue] = React.useState(editing?.description ?? "");
  const [imageValue, setImageValue] = React.useState(editing?.imageUrl ?? "");
  // Advanced disclosure (slug, icon, UTM, A/B, schedule): collapsed for a
  // fresh link — title + URL + Save is the whole job — open when editing.
  const [advancedOpen, setAdvancedOpen] = React.useState(!!editing);

  // UTM state — only relevant for type === "url"
  const isUrlType = type === "url";
  // #93 popup types share the popup fields (body, CTA).
  const isPopupType = type === "text" || type === "location";
  const isTextPopup = type === "text";
  // #87 dividers: decorative separator — no URL, description, thumbnail,
  // or icon. Style lives in the theme customizer, not per-link.
  const isDivider = type === "divider";
  // Native vCard: no URL field — the card always points at the page's own
  // /api/vcard/<slug> route and inherits the Contact card settings.
  const isVcard = type === "vcard";
  const storedUrl = editing?.url ?? "";
  const hadUTM = isUrlType && hasUTM(storedUrl);
  const [showUTM, setShowUTM] = React.useState(hadUTM);

  const router = useRouter();
  const savedAction = useSavedAction();
  // Action error surfaced inline (upload too large, bad SVG, unknown icon…).
  const [actionError, setActionError] = React.useState<string | null>(null);
  // Live-preview source for text popup bodies (mirror of the textarea).
  const [popupText, setPopupText] = React.useState(editing?.popupText ?? "");
  // Draft-persistence state: CTA label (lifted from an uncontrolled input),
  // section choice (lifted from SectionSelect) and the slug mirror — all
  // included in the sessionStorage draft (see link-drafts.ts).
  const [ctaLabelValue, setCtaLabelValue] = React.useState(editing?.ctaLabel ?? "");
  const [sectionValue, setSectionValue] = React.useState(
    editing?.sectionId ? String(editing.sectionId) : "none",
  );
  const [slugValue, setSlugValue] = React.useState("");
  // Custom vCard: mode + per-link contact fields. Custom cards are FULL
  // REPLACE — blank fields stay blank on the downloaded card (avatar and
  // social links still come from the page). Editing pre-fills from the
  // stored config; a fresh link starts on the page's default card.
  const storedVCard = parseVCardLinkConfig(editing?.vcardConfig ?? null);
  const [vcardMode, setVcardMode] = React.useState<"page" | "custom">(
    storedVCard ? "custom" : "page",
  );
  const [vcardOrg, setVcardOrg] = React.useState(storedVCard?.organization ?? "");
  const [vcardJob, setVcardJob] = React.useState(storedVCard?.jobTitle ?? "");
  const [vcardEmail, setVcardEmail] = React.useState(storedVCard?.email ?? "");
  const [vcardPhone, setVcardPhone] = React.useState(storedVCard?.phone ?? "");
  const [vcardAddress, setVcardAddress] = React.useState(storedVCard?.address ?? "");
  // True when this dialog session restored a saved draft (drives the chip).
  const [draftRestored, setDraftRestored] = React.useState(false);

  // Reset local form state whenever the dialog opens (or switches target).
  // After the defaults, a persisted draft (link-drafts.ts) wins: the
  // operator's half-typed entries survive closing and reopening the sheet,
  // until a successful save, logout, or tab close clears them.
  const sessionKey = open ? `open:${editing?.id ?? "new"}` : "closed";
  const [lastSession, setLastSession] = React.useState(sessionKey);
  const resetToDefaults = () => {
    setType(editing?.type ?? "url");
    setHighlighted(editing?.isHighlighted ?? false);
    setActive(editing?.isActive ?? true);
    setScheduled(!!editing?.scheduleStart || !!editing?.scheduleEnd);
    setIconMode(initialIconMode(editing));
    setLucidePick(editing?.iconMode === "lucide" ? editing.icon ?? "" : "");
    setCustomIconUrl(editing?.iconMode === "custom" ? editing.customIconUrl ?? "" : "");
    setIconFileName("");
    setHasNewIconFile(false);
    setActionError(null);
    setPopupText(editing?.popupText ?? "");
    setCardStyle(editing?.cardStyle === "rich" ? "rich" : "compact");
    setPreviewOpen(!!editing);
    setAdvancedOpen(!!editing);
    setTitleValue(editing?.title ?? "");
    setUrlValue(
      editing?.type === "url" && hasUTM(editing?.url ?? "")
        ? stripUTM(editing.url)
        : editing?.url ?? "",
    );
    setDescValue(editing?.description ?? "");
    setImageValue(editing?.imageUrl ?? "");
    setCtaLabelValue(editing?.ctaLabel ?? "");
    setSectionValue(editing?.sectionId ? String(editing.sectionId) : "none");
    setSlugValue("");
    setVcardMode(storedVCard ? "custom" : "page");
    setVcardOrg(storedVCard?.organization ?? "");
    setVcardJob(storedVCard?.jobTitle ?? "");
    setVcardEmail(storedVCard?.email ?? "");
    setVcardPhone(storedVCard?.phone ?? "");
    setVcardAddress(storedVCard?.address ?? "");
    setDraftRestored(false);

    const had = editing?.type === "url" && hasUTM(editing?.url ?? "");
    setShowUTM(had);
  };
  if (sessionKey !== lastSession) {
    setLastSession(sessionKey);
    if (open) {
      resetToDefaults();
      const draft = loadLinkDraft(pageId, editing?.id);
      if (draft) {
        if (draft.type) setType(draft.type as LinkRow["type"]);
        if (typeof draft.highlighted === "boolean") setHighlighted(draft.highlighted);
        if (typeof draft.active === "boolean") setActive(draft.active);
        if (typeof draft.scheduled === "boolean") setScheduled(draft.scheduled);
        if (draft.iconMode) setIconMode(draft.iconMode as IconMode);
        if (typeof draft.lucidePick === "string") setLucidePick(draft.lucidePick);
        if (typeof draft.customIconUrl === "string") setCustomIconUrl(draft.customIconUrl);
        if (draft.cardStyle === "compact" || draft.cardStyle === "rich") setCardStyle(draft.cardStyle);
        if (draft.vcardMode === "custom" || draft.vcardMode === "page") setVcardMode(draft.vcardMode);
        if (typeof draft.vcardOrg === "string") setVcardOrg(draft.vcardOrg);
        if (typeof draft.vcardJob === "string") setVcardJob(draft.vcardJob);
        if (typeof draft.vcardEmail === "string") setVcardEmail(draft.vcardEmail);
        if (typeof draft.vcardPhone === "string") setVcardPhone(draft.vcardPhone);
        if (typeof draft.vcardAddress === "string") setVcardAddress(draft.vcardAddress);
        if (typeof draft.advancedOpen === "boolean") setAdvancedOpen(draft.advancedOpen);
        if (typeof draft.titleValue === "string") setTitleValue(draft.titleValue);
        if (typeof draft.urlValue === "string") setUrlValue(draft.urlValue);
        if (typeof draft.descValue === "string") setDescValue(draft.descValue);
        if (typeof draft.imageValue === "string") setImageValue(draft.imageValue);
        if (typeof draft.showUTM === "boolean") setShowUTM(draft.showUTM);
        if (typeof draft.popupText === "string") setPopupText(draft.popupText);
        if (typeof draft.ctaLabel === "string") setCtaLabelValue(draft.ctaLabel);
        if (draft.sectionValue) setSectionValue(draft.sectionValue);
        if (typeof draft.slug === "string") setSlugValue(draft.slug);
        setDraftRestored(true);
      }
    }
  }

  // Discard the restored draft: drop storage AND fall back to the defaults.
  const discardDraft = () => {
    clearLinkDraft(pageId, editing?.id);
    resetToDefaults();
  };

  // Debounced draft write (sessionStorage, see link-drafts.ts): fires while
  // the sheet is open and any field changes; when nothing is typed it drops
  // any stale draft instead, so an empty dialog never claims a restore.
  React.useEffect(() => {
    if (!open) return;
    const snapshot: LinkDraft = {
      v: 1,
      type,
      highlighted,
      active,
      scheduled,
      iconMode,
      lucidePick,
      customIconUrl,
      cardStyle,
      advancedOpen,
      titleValue,
      urlValue,
      descValue,
      imageValue,
      showUTM,
      popupText,
      ctaLabel: ctaLabelValue,
      sectionValue,
      slug: slugValue,
      vcardMode,
      vcardOrg,
      vcardJob,
      vcardEmail,
      vcardPhone,
      vcardAddress,
    };
    const timer = setTimeout(() => {
      if (linkDraftHasContent(snapshot)) {
        saveLinkDraft(pageId, editing?.id, snapshot);
      } else {
        clearLinkDraft(pageId, editing?.id);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, pageId, editing, type, highlighted, active, scheduled, iconMode,
      lucidePick, customIconUrl, cardStyle, advancedOpen, titleValue, urlValue,
      descValue, imageValue, showUTM, popupText, ctaLabelValue, sectionValue,
      slugValue, vcardMode, vcardOrg, vcardJob, vcardEmail, vcardPhone,
      vcardAddress]);

  // If user switches away from "url" type, collapse UTM (values preserved).
  const utmVisible = isUrlType && showUTM;

  const urlLabel = isPopupType
    ? isTextPopup
      ? t("ctaUrlLabel")
      : t("ltLocationLabel")
    : t(getUrlLabel(type));
  const urlPlaceholder = isPopupType
    ? isTextPopup
      ? t("phCtaUrl")
      : t("phLocation")
    : t(getUrlPlaceholder(type));

  // Pre-compute default values for the UTM fields when editing.
  const utmDefaults: UTMParams = hadUTM ? parseUTM(storedUrl) : emptyUTM();

  // Form action (React 19): the browser runs native validation (required,
  // maxLength…) before invoking this, so Enter and the Save button both
  // submit — no JavaScript-only interception.
  const handleSubmit = (formData: FormData) => {
    // Prepend the correct prefix for non-URL types
    const rawUrl = (formData.get("url") as string) || "";
    let finalUrl = prefixLinkUrl(type, rawUrl);
    formData.set("type", type);

    // Custom vCard: the mode flag drives the server's tri-state (present =
    // write; absent for non-vcard types = untouched). The per-field inputs
    // are unmounted when the type is not vcard, so they never ride along.
    if (isVcard) {
      formData.set("vcardMode", vcardMode);
    } else {
      formData.delete("vcardMode");
    }

    // Append UTM params for URL-type links when the builder is open.
    // Read from form fields (uncontrolled inputs) — no React state needed.
    if (utmVisible) {
      const utm: Partial<UTMParams> = {
        source: (formData.get("utm_source") as string) || "",
        medium: (formData.get("utm_medium") as string) || "",
        campaign: (formData.get("utm_campaign") as string) || "",
        term: (formData.get("utm_term") as string) || "",
        content: (formData.get("utm_content") as string) || "",
      };
      // Remove the raw utm_* fields from formData — they go into the URL.
      formData.delete("utm_source");
      formData.delete("utm_medium");
      formData.delete("utm_campaign");
      formData.delete("utm_term");
      formData.delete("utm_content");
      finalUrl = appendUTM(finalUrl, utm);
    }
    formData.set("url", finalUrl);

    formData.set("isHighlighted", highlighted ? "on" : "off");
    formData.set("isActive", active ? "on" : "off");
    formData.set("autoIcon", autoIcon ? "on" : "off");
    formData.set("cardStyle", cardStyle);

    // Icon system (#91): send the mode + its payload. Uploads ride along
    // as a File in the same FormData — no separate upload endpoint.
    formData.set("iconMode", iconMode);
    if (iconMode === "lucide") {
      formData.set("icon", lucidePick);
    } else {
      formData.delete("icon");
    }
    if (iconMode === "custom" && !iconFileRef.current?.files?.length) {
      // Editing without re-uploading: keep the stored URL.
      formData.set("iconCustomUrl", customIconUrl);
    }

    // If scheduling is toggled off, clear any stale schedule values.
    if (!scheduled) {
      formData.delete("scheduleStart");
      formData.delete("scheduleEnd");
    }

    startTransition(async () => {
      const result = editing
        ? await savedAction.run(updateLink, formData)
        : await savedAction.run(createLink, formData);
      if (!result.success) {
        setActionError(result.error ?? null);
        return;
      }
      // #81 A/B test: chain after the link save so a brand-new row exists
      // before setAbTest reads it. Toggle OFF at save = leave any existing
      // test untouched (removal is explicit via the detail page's Remove).
      // Reads the UNCONTROLLED inputs directly — the editor's hidden
      // ab_enabled flag gates whether the fields are even present.
      if (editing && formData.get("ab_enabled") === "on") {
        const abData = new FormData();
        abData.set("id", String(editing.id));
        abData.set("urlB", String(formData.get("ab_urlB") ?? ""));
        abData.set("labelA", String(formData.get("ab_labelA") ?? ""));
        abData.set("labelB", String(formData.get("ab_labelB") ?? ""));
        abData.set("weightA", String(formData.get("ab_weightA") ?? "50"));
        // E.2 time box: empty string = unbounded side (server stores null).
        abData.set("startsAt", String(formData.get("ab_startsAt") ?? ""));
        abData.set("endsAt", String(formData.get("ab_endsAt") ?? ""));
        const abResult = await savedAction.run(setAbTest, abData);
        if (!abResult.success) {
          // The link itself saved; surface the A/B error without closing.
          setActionError(abResult.error ?? null);
          return;
        }
      }
      setActionError(null);
      // Saved — the draft has served its purpose.
      clearLinkDraft(pageId, editing?.id);
      router.refresh();
      onOpenChange(false);
    });
  };


  // Live favicon for auto mode: the cached copy exists only after save, so
  // for the preview we resolve the same upstream the server's favicon chain
  // falls back to (DuckDuckGo icons) directly from the typed URL's domain.
  const autoIconUrl = React.useMemo(() => {
    if (iconMode !== "auto" || editing?.iconUrl) return null;
    try {
      const host = new URL(prefixLinkUrl(type, urlValue)).hostname;
      return host.includes(".") ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
    } catch {
      return null;
    }
  }, [iconMode, editing?.iconUrl, type, urlValue]);

  // Synthetic row for the live card preview: the exact buildLinkCardHtml input
  // the public page would receive for this form state. Kept in sync with every
  // keystroke via the mirrors above.
  const previewLink = React.useMemo<LinkRow>(
    () => ({
      id: editing?.id ?? -1,
      pageId: pageId ?? 0,
      sectionId: null,
      orderIndex: 0,
      type,
      title: type === "divider" ? "—" : titleValue,
      url: prefixLinkUrl(type, urlValue),
      description: descValue || null,
      icon: iconMode === "lucide" && lucidePick ? lucidePick : null,
      // Preview autofetch: cached favicon when editing a saved row, otherwise
      // the DuckDuckGo upstream resolved live from the typed URL (same
      // fallback source the server's favicon chain uses).
      iconUrl: editing?.iconUrl ?? autoIconUrl,
      autoIcon: iconMode === "auto",
      imageUrl: imageValue || null,
      // A freshly-picked file has no URL yet — the preview falls back to the
      // letter avatar until save (same as the public page pre-upload).
      customIconUrl:
        iconMode === "custom" && !hasNewIconFile ? customIconUrl || null : null,
      iconMode,
      isActive: active,
      scheduleStart: editing?.scheduleStart ?? null,
      scheduleEnd: editing?.scheduleEnd ?? null,
      clicksCount: editing?.clicksCount ?? 0,
      cardStyle,
      popupText: popupText || null,
      ctaLabel: ctaLabelValue || null,
      redirectSlug: editing?.redirectSlug ?? null,
      abConfig: editing?.abConfig ?? null,
      vcardConfig: editing?.vcardConfig ?? null,
      createdAt: editing?.createdAt ?? "2026-01-01 00:00:00",
      isHighlighted: highlighted,
    }),
    [editing, pageId, type, titleValue, urlValue, descValue, iconMode, lucidePick,
      customIconUrl, hasNewIconFile, imageValue, active, cardStyle, popupText, highlighted,
      autoIconUrl, ctaLabelValue],
  );

  // Peer fields that share a two-column row on wide panels (stack on mobile).
  const sectionField =
    sections.length > 0 ? (
      <SectionSelect
        value={sectionValue}
        onValueChange={(v) => setSectionValue(v ?? "none")}
        sections={sections}
      />
    ) : null;
  const cardStyleField = isUrlType ? (
    <FormField label={t("cardStyle")} hint={cardStyle === "rich" ? t("richHint") : t("iconHint")}>
      {/* Slim segmented control: mini glyphs stand in for the card
          layouts so the choice reads at a glance without three rows
          of description text. */}
      <div
        role="radiogroup"
        aria-label={t("cardStyle")}
        className="grid grid-cols-2 gap-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={cardStyle === "compact"}
          onClick={() => setCardStyle("compact")}
          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            cardStyle === "compact"
              ? "border-violet bg-violet/5 text-foreground"
              : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
          }`}
        >
          {/* compact glyph: icon + text lines */}
          <span aria-hidden className="flex size-7 items-center justify-center rounded-md border border-current/20 bg-background/60">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="0" y="4" width="4" height="4" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="5.5" y="4.9" width="7" height="1.4" rx="0.7" fill="currentColor" opacity="0.45" />
              <rect x="5.5" y="7.7" width="5" height="1.4" rx="0.7" fill="currentColor" opacity="0.3" />
            </svg>
          </span>
          <span className="font-medium">{t("compact")}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={cardStyle === "rich"}
          onClick={() => setCardStyle("rich")}
          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            cardStyle === "rich"
              ? "border-violet bg-violet/5 text-foreground"
              : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
          }`}
        >
          {/* rich glyph: image block + text lines */}
          <span aria-hidden className="flex size-7 items-center justify-center rounded-md border border-current/20 bg-background/60">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <rect x="0" y="2" width="12.5" height="6" rx="1" fill="currentColor" opacity="0.25" />
              <circle cx="3" cy="4" r="1" fill="currentColor" opacity="0.7" />
              <path d="M1 7.4 L4.5 5 L7 7 L9.5 4.6 L12.5 8" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="0" y="9.6" width="9" height="1.4" rx="0.7" fill="currentColor" opacity="0.45" />
            </svg>
          </span>
          <span className="font-medium">{t("richPreview")}</span>
        </button>
      </div>
    </FormField>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        side="left"
        className={previewOpen ? "w-full md:w-[980px]" : "w-full md:w-[640px]"}
      >
        {/* Sheet header: the aurora logo mark carries over from the sidebar
            rail so the panel reads as the sidebar expanding into the editor. */}
        <DialogHeader className="relative shrink-0 flex-row items-center gap-3 border-b border-border px-5 py-4 pr-24">
          <Image
            src="/logo-mark.svg"
            alt=""
            aria-hidden
            width={28}
            height={28}
            unoptimized
            className="size-7 shrink-0"
          />
          <div className="min-w-0">
            <DialogTitle>{editing ? t("editLink") : t("addLink")}</DialogTitle>
            <DialogDescription className="text-xs">
              {editing ? t("updateDescription") : t("createDescription")}
            </DialogDescription>
          </div>
          {/* Preview pane toggle — the sheet expands to the right border. */}
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            aria-pressed={previewOpen}
            aria-label={t("preview")}
            title={t("preview")}
            className={`hidden min-[980px]:absolute min-[980px]:right-12 min-[980px]:top-1/2 min-[980px]:-translate-y-1/2 min-[980px]:flex size-8 items-center justify-center rounded-lg border transition-colors ${
              previewOpen
                ? "border-violet/40 bg-violet/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <EyeIcon className="size-4" />
          </button>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            // React 19 auto-resets UNCONTROLLED inputs after a <form action>
            // resolves — a failed save (server validation error) would wipe
            // every field the operator typed (#Rene report: text popup with
            // CTA label but no URL → error → all entries gone). Manual
            // submit + preventDefault opts out of that reset; native
            // constraint validation still runs BEFORE the submit event, so
            // required/maxLength bubbles and Enter-key submit keep working.
            e.preventDefault();
            handleSubmit(new FormData(e.currentTarget));
          }}
          className="flex min-h-0 flex-1"
        >
          {/* Form pane: FIXED width, always — the same 600px whether the
              preview is open or not; expanding only ADDS the preview pane
              to the right of it. */}
          <div className="flex w-full min-w-0 flex-col md:w-[600px] md:shrink-0">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            {pageId ? <input type="hidden" name="pageId" value={pageId} /> : null}

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {/* Draft-restored chip: the sheet reopened with persisted
                  entries; one click discards them back to defaults. */}
              {draftRestored ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-violet/40 bg-violet/5 px-3 py-2 text-sm">
                  <span className="text-foreground">{t("draftRestored")}</span>
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("draftDiscard")}
                  </button>
                </div>
              ) : null}
              {/* Type first — it is a mode that re-lays-out the fields below
                  (URL label, popup fields, thumbnail visibility), so it leads. */}
              <FormField label={t("typeLabel")}>
                <div
                  role="radiogroup"
                  aria-label={t("typeLabel")}
                  className="flex flex-wrap gap-1.5"
                >
                  {LINK_TYPES.map((lt) => (
                    <button
                      key={lt.value}
                      type="button"
                      role="radio"
                      aria-checked={type === lt.value}
                      onClick={() => setType(lt.value)}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                        type === lt.value
                          ? "border-violet-bright/60 bg-violet/15 text-foreground"
                          : "border-border bg-accent/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(lt.label)}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label={t("title_field")} htmlFor="title" required>
                <Input
                  id="title"
                  name="title"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  required={!isDivider}
                  maxLength={120}
                  placeholder={t("titlePlaceholder")}
                />
              </FormField>

              {isDivider ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
                  {t("dividerHint")}
                </p>
              ) : isVcard ? (
                <>
                  {/* Custom vCard: page card vs per-link custom (full
                      replace — blank fields stay blank; the page's avatar
                      and social links still ride on the downloaded card). */}
                  <FormField label={t("ltVcard")}>
                    <div
                      role="radiogroup"
                      aria-label={t("ltVcard")}
                      className="grid grid-cols-2 gap-2"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={vcardMode === "page"}
                        onClick={() => setVcardMode("page")}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          vcardMode === "page"
                            ? "border-violet bg-violet/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                        }`}
                      >
                        <span className="font-medium">{t("vcardPageCard")}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={vcardMode === "custom"}
                        onClick={() => setVcardMode("custom")}
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          vcardMode === "custom"
                            ? "border-violet bg-violet/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                        }`}
                      >
                        <span className="font-medium">{t("vcardCustomCard")}</span>
                      </button>
                    </div>
                    <input type="hidden" name="vcardMode" value={vcardMode} />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {vcardMode === "page" ? t("vcardPageCardHint") : t("vcardCustomHint")}
                    </p>
                  </FormField>
                  {vcardMode === "custom" && (
                    <>
                      <FormField label={t("vcardFieldOrg")} htmlFor="vcardOrganization">
                        <Input
                          id="vcardOrganization"
                          name="vcardOrganization"
                          value={vcardOrg}
                          onChange={(e) => setVcardOrg(e.target.value)}
                          maxLength={120}
                          placeholder={t("vcardFieldBlank")}
                        />
                      </FormField>
                      <FormField label={t("vcardFieldJob")} htmlFor="vcardJobTitle">
                        <Input
                          id="vcardJobTitle"
                          name="vcardJobTitle"
                          value={vcardJob}
                          onChange={(e) => setVcardJob(e.target.value)}
                          maxLength={120}
                          placeholder={t("vcardFieldBlank")}
                        />
                      </FormField>
                      <FormField label={t("vcardFieldEmail")} htmlFor="vcardEmail">
                        <Input
                          id="vcardEmail"
                          name="vcardEmail"
                          type="email"
                          value={vcardEmail}
                          onChange={(e) => setVcardEmail(e.target.value)}
                          maxLength={200}
                          placeholder={t("vcardFieldBlank")}
                        />
                      </FormField>
                      <FormField label={t("vcardFieldPhone")} htmlFor="vcardPhone">
                        <Input
                          id="vcardPhone"
                          name="vcardPhone"
                          type="tel"
                          value={vcardPhone}
                          onChange={(e) => setVcardPhone(e.target.value)}
                          maxLength={60}
                          placeholder={t("vcardFieldBlank")}
                        />
                      </FormField>
                      <FormField label={t("vcardFieldAddress")} htmlFor="vcardAddress">
                        <Input
                          id="vcardAddress"
                          name="vcardAddress"
                          value={vcardAddress}
                          onChange={(e) => setVcardAddress(e.target.value)}
                          maxLength={300}
                          placeholder={t("vcardFieldBlank")}
                        />
                      </FormField>
                    </>
                  )}
                </>
              ) : (
              <FormField label={urlLabel} htmlFor="url" required={!isTextPopup}>
                <Input
                  id="url"
                  name="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  required={!isTextPopup}
                  maxLength={2048}
                  placeholder={urlPlaceholder}
                />
              </FormField>
              )}

              {/* #93 popup cards: body text (markdown subset) + optional CTA
                  label. The URL field above doubles as CTA target (text) or
                  place/address input (location) — labels swap per type. The
                  live popup-body rendering lives in the preview pane. */}
              {isPopupType ? (
                <FormField label={t("popupTextLabel")} htmlFor="popupText" required={isTextPopup}>
                  <textarea
                    id="popupText"
                    name="popupText"
                    value={isTextPopup ? popupText : undefined}
                    defaultValue={isTextPopup ? undefined : editing?.popupText ?? ""}
                    onChange={isTextPopup ? (e) => setPopupText(e.target.value) : undefined}
                    rows={isTextPopup ? 8 : 6}
                    maxLength={5000}
                    placeholder={t("phPopupText")}
                    className="flex min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-violet focus-visible:ring-2 focus-visible:ring-violet/20 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {isTextPopup ? (
                    /* Syntax hint (literal markdown tokens, no translation) + char counter. */
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="truncate font-mono">
                        **b** · *i* · `code` · [link](url) · # h · - list · 1. list · ---
                      </span>
                      <span className="shrink-0 tabular-nums">{popupText.length}/5000</span>
                    </div>
                  ) : null}
                </FormField>
              ) : null}
              {isPopupType ? (
                <FormField label={t("ctaLabel")} htmlFor="ctaLabel">
                  <Input
                    id="ctaLabel"
                    name="ctaLabel"
                    value={ctaLabelValue}
                    onChange={(e) => setCtaLabelValue(e.target.value)}
                    maxLength={80}
                    placeholder={isTextPopup ? t("phCtaLabel") : t("phCtaLabelLocation")}
                  />
                </FormField>
              ) : null}

              {/* Description + Thumbnail: both optional one-liners — natural
                  peers on a shared row (stacked on narrow screens). Hidden for
                  dividers (#87): they render nothing but the themed line. */}
              {!isDivider ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t("description")} htmlFor="description">
                  <Input
                    id="description"
                    name="description"
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    maxLength={300}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </FormField>

                <FormField label={t("thumbnail")} htmlFor="imageUrl">
                  <Input
                    id="imageUrl"
                    name="imageUrl"
                    value={imageValue}
                    onChange={(e) => setImageValue(e.target.value)}
                    maxLength={2048}
                    placeholder="https://example.com/image.jpg"
                  />
                </FormField>
              </div>
              ) : null}

              {/* Card style + Section: single-select peers on one row. */}
              {cardStyleField && sectionField ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {cardStyleField}
                  {sectionField}
                </div>
              ) : (
                cardStyleField ?? sectionField
              )}

              {/* Advanced disclosure: slug, icon, UTM, A/B, schedule — the
                  settings a simple link never touches. Collapsed by default
                  when adding, open when editing. Hidden inputs inside still
                  submit when collapsed. */}
              <div className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-accent/50 px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
                >
                  {t("advanced")}
                  <ChevronDownIcon
                    aria-hidden
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {advancedOpen ? (
                  <div className="flex flex-col gap-4 border-t border-border px-3.5 py-3.5">
                    {/* #96 custom /go/ redirect slug — every non-divider link
                        type can carry one (popups route their CTA through /go/
                        too). Remounts with the dialog session so state resets. */}
                    {!isDivider ? (
                      <SlugField
                        key={sessionKey}
                        editing={editing}
                        initialSlug={draftRestored && slugValue ? slugValue : undefined}
                        onSlugChange={setSlugValue}
                      />
                    ) : null}

                    {/* Icon system (#91): auto favicon / lucide pick / upload.
                        One-line segmented control with a live preview chip — the
                        chip shows WHAT is selected (favicon sparkle, picked icon,
                        uploaded image) so the mode names don't carry the meaning
                        alone. Hidden for dividers (#87): they have no icon. */}
                    {!isDivider ? (
                    <FormField
                      label={t("iconSection")}
                      hint={iconMode === "auto" ? t("iconAutoHint") : undefined}
                    >
                      <div className="flex items-stretch gap-2">
                        {/* Preview chip: 32px square showing the current icon */}
                        <span
                          aria-hidden
                          className={`flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                            iconMode === "auto"
                              ? "border-border bg-muted/40 text-muted-foreground"
                              : "border-violet/40 bg-violet/5 text-foreground"
                          }`}
                        >
                          {iconMode === "lucide" && lucidePick && isLucideIconName(lucidePick) ? (
                            <LucideIcon name={lucidePick} size={18} />
                          ) : iconMode === "custom" && (customIconUrl && !hasNewIconFile) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={customIconUrl} alt="" className="size-5 rounded object-cover" />
                          ) : iconMode === "custom" && iconFileName ? (
                            <ImagePlus size={18} className="text-muted-foreground" />
                          ) : (
                            <Sparkles size={18} className="text-muted-foreground" />
                          )}
                        </span>

                        {/* Segmented Auto / Pick / Upload */}
                        <div
                          role="radiogroup"
                          aria-label={t("iconSection")}
                          className="grid flex-1 grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1"
                        >
                          {(["auto", "lucide", "custom"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={iconMode === mode}
                              onClick={() => setIconMode(mode)}
                              className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                                iconMode === mode
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {mode === "auto" ? t("iconModeAuto") : mode === "lucide" ? t("iconModeLucide") : t("iconModeCustom")}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mode payloads */}
                      {iconMode === "lucide" ? (
                        <div className="mt-2">
                          <IconPicker value={lucidePick} onChange={setLucidePick} />
                        </div>
                      ) : null}
                      {iconMode === "custom" ? (
                        <div className="mt-2 flex items-center gap-3">
                          {customIconUrl && !hasNewIconFile ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={customIconUrl} alt="" className="size-8 rounded-md border border-border object-cover" />
                          ) : null}
                          <Input
                            ref={iconFileRef}
                            type="file"
                            name="iconFile"
                            accept=".png,.jpg,.jpeg,.webp,.gif,.ico,.svg"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setIconFileName(f?.name ?? "");
                              setHasNewIconFile(!!f);
                            }}
                            className="flex-1 text-xs"
                          />
                        </div>
                      ) : null}
                      {iconMode === "custom" && iconFileName ? (
                        <p className="mt-1 text-xs text-muted-foreground">{t("iconUploadSelected", { name: iconFileName })}</p>
                      ) : null}
                    </FormField>
                    ) : null}

                    {/* UTM + schedule expand inline under their switches. */}
                    {isUrlType ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={showUTM} onCheckedChange={setShowUTM} />{t("utmParameters")}</label>
                    ) : null}
                    {utmVisible ? (
                      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                        <UTMField label={t("utmSource")} name="utm_source" placeholder="instagram" defaultValue={utmDefaults.source} />
                        <UTMField label={t("utmMedium")} name="utm_medium" placeholder="social" defaultValue={utmDefaults.medium} />
                        <UTMField label={t("utmCampaign")} name="utm_campaign" placeholder="spring_sale" defaultValue={utmDefaults.campaign} />
                        <UTMField label={t("utmTerm")} name="utm_term" placeholder="running_shoes" defaultValue={utmDefaults.term} />
                        <UTMField label={t("utmContent")} name="utm_content" placeholder="banner_ad_1" defaultValue={utmDefaults.content} />
                      </div>
                    ) : null}

                    {/* #81 A/B test editor — URL links only, editing only
                        (setAbTest needs a saved row). Lives with the other
                        expandable builders in Advanced. */}
                    {isUrlType && editing ? (
                      <AbTestEditor storedConfig={editing.abConfig ?? null} urlA={editing.url} />
                    ) : null}

                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={scheduled} onCheckedChange={setScheduled} />{t("schedule")}</label>
                    {scheduled ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">{t("showFrom")}</span>
                          <Input
                            type="datetime-local"
                            name="scheduleStart"
                            defaultValue={
                              editing?.scheduleStart
                                ? editing.scheduleStart.replace(" ", "T").slice(0, 16)
                                : ""
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">{t("hideAfter")}</span>
                          <Input
                            type="datetime-local"
                            name="scheduleEnd"
                            defaultValue={
                              editing?.scheduleEnd
                                ? editing.scheduleEnd.replace(" ", "T").slice(0, 16)
                                : ""
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {actionError ? (
                <p role="alert" className="text-sm text-destructive">{actionError}</p>
              ) : null}
            </div>

            {/* Sticky footer: always-visible actions + the two booleans people
                actually flip while adding a link. */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-muted/50 px-5 py-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={highlighted} onCheckedChange={setHighlighted} />{t("featured")}</label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={active} onCheckedChange={setActive} />{t("active")}</label>
              </div>
              <div className="ms-auto flex gap-2">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? tCommon("saving") : tCommon("save")}
                </Button>
              </div>
            </div>
          </div>

          {/* Preview pane — added to the RIGHT border of the form pane (the
              sheet widens; the form never reflows). 1:1: the same
              buildLinkCardHtml the public page runs, with the page's real
              resolved theme tokens. Inert (no navigation). */}
          {previewOpen ? (
            <div className="hidden min-h-0 min-w-[280px] flex-1 flex-col items-center justify-center gap-3 overflow-y-auto border-l border-border bg-violet/10 px-5 py-5 min-[980px]:flex">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("preview")}
              </span>
              {isDivider ? null : (
                <CardPreview link={previewLink} theme={pageTheme} pageSlug={pageSlug} />
              )}
              {isTextPopup ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("popupTextLabel")}
                  </span>
                  <PopupBodyPreview content={popupText} theme={pageTheme} />
                </>
              ) : null}
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Single UTM input field with inline label (uncontrolled). */
function UTMField({
  label,
  name,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import Image from "next/image";
import {
  GripVertical,
  Pencil,
  Trash2,
  ExternalLink,
  BarChart3,
  Clock,
  Mail,
  Phone,
  Image as ImageIcon,
  Code2,
  Minus,
  MoreVertical,
} from "lucide-react";
import { toggleLink } from "@/server/actions/links";
import { createPortal } from "react-dom";
import { resolveIcon, isLucideIconName } from "@/lib/icon-registry";
import { useRouter } from "next/navigation";
import type { LinkRow } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSavedAction } from "@/hooks/use-saved-action";

export interface SortableLinkProps {
  link: LinkRow;
  onEdit: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
}

export function SortableLink({ link, onEdit, onDelete }: SortableLinkProps) {
  const t = useTranslations("linksPage");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: link.id });
  const router = useRouter();

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    ...(isDragging
      ? {
          boxShadow: "0 0 30px -4px rgba(124,58,237,0.4)",
          borderRadius: "0.875rem",
        }
      : {}),
  };

  // Resolve favicon/icon: manual choices (#91) first — picked lucide icon,
  // then uploaded image — then the cached favicon, then type icons and the
  // first-letter avatar, matching the public page's resolution order.
  const { displayIcon, displaySrc, letter } = React.useMemo(() => {
    // #87 dividers: no icon, just the row glyph (rendered separately below).
    if (link.type === "divider") return { displayIcon: Minus, displaySrc: null, letter: null };
    // Picked lucide icon stored as a dashed name.
    if (link.iconMode === "lucide" && link.icon && isLucideIconName(link.icon)) {
      return { displayIcon: resolveIcon(link.icon), displaySrc: null, letter: null };
    }
    // Uploaded custom icon.
    if (link.iconMode === "custom" && link.customIconUrl) {
      return { displayIcon: null, displaySrc: link.customIconUrl, letter: null };
    }
    if (link.type === "embed") return { displayIcon: Code2, displaySrc: null, letter: null };
    if (link.url.startsWith("mailto:")) return { displayIcon: Mail, displaySrc: null, letter: null };
    if (link.url.startsWith("tel:")) return { displayIcon: Phone, displaySrc: null, letter: null };

    // Prefer the cached favicon stored on the link
    if (link.iconUrl) return { displayIcon: null, displaySrc: link.iconUrl, letter: null };

    try {
      const u = new URL(link.url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        const ch = (link.title || u.hostname).trim().charAt(0).toUpperCase();
        return { displayIcon: null, displaySrc: null, letter: ch || "?" };
      }
    } catch {
      // not a parseable URL
    }
    return { displayIcon: ImageIcon, displaySrc: null, letter: null };
  }, [link.url, link.type, link.iconUrl, link.title, link.iconMode, link.icon, link.customIconUrl]);

  const Icon = displayIcon;

  const [toggling, setToggling] = React.useState(false);
  const savedAction = useSavedAction();

  const handleToggle = async () => {
    setToggling(true);
    try {
      await savedAction.run(toggleLink, link.id);
      router.refresh();
    } finally {
      setToggling(false);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        className="flex cursor-grab touch-none items-center px-1 text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={t("dragReorder")}
        type="button"
      >
        <GripVertical className="size-4" />
      </button>

      <Card className="flex-1 transition-[box-shadow] duration-200 hover:shadow-[0_0_20px_-8px_rgba(124,58,237,0.2)]">
        <CardContent className="flex items-center gap-3 py-3">
          {/* Favicon / Type icon */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
            {displaySrc ? (
              <Image
                src={displaySrc}
                alt=""
                width={16}
                height={16}
                unoptimized
                className="size-4 rounded-sm"
                loading="lazy"
                onError={(e) => {
                  // Hide broken favicon, show fallback icon
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : letter ? (
              <span className="flex size-4 items-center justify-center rounded-sm bg-violet/15 text-[10px] font-semibold leading-none text-violet">
                {letter}
              </span>
            ) : Icon ? (
              <Icon className="size-4 text-muted-foreground" />
            ) : (
              <ExternalLink className="size-4 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {link.type === "divider" ? (
                <>
                  <Minus className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm text-muted-foreground">{t("dividerRow")}</span>
                </>
              ) : (
                <>
                  <span className="truncate text-sm font-medium">{link.title}</span>
                  {link.isHighlighted ? (
                    <Badge className="shrink-0 border-transparent bg-[var(--aurora-grad)] text-white">{t("star")}</Badge>
                  ) : null}
                </>
              )}
              {!link.isActive ? (
                <Badge variant="outline" className="shrink-0">{t("hidden")}</Badge>
              ) : null}
              {link.scheduleStart || link.scheduleEnd ? (
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Clock className="size-3" />{t("scheduled")}</Badge>
              ) : null}
            </div>
            {/* Optional description, then the URL — both get room on mobile now
                that the inline actions collapsed into the 3-dots menu. */}
            {link.type !== "divider" && link.description ? (
              <p className="truncate text-xs text-foreground/80">{link.description}</p>
            ) : null}
            {link.type === "divider" ? null : (
              <p className="truncate text-xs text-muted-foreground">{link.url}</p>
            )}
          </div>

          <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
            {t("clicksCount", { count: link.clicksCount })}
          </span>

          {link.type === "divider" ? null : (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline-flex"
              aria-label={t("openLinkAria")}
            >
              <ExternalLink className="size-4" />
            </a>
          )}

          <Link
            href={`/links/${link.id}`}
            className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:block"
            aria-label={t("linkAnalyticsAria")}
          >
            <BarChart3 className="size-4" />
          </Link>

          <Switch
            checked={link.isActive}
            onCheckedChange={handleToggle}
            disabled={toggling}
            aria-label={t("toggleVisibilityAria")}
          />

          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => onEdit(link)}
            aria-label={t("editLinkAria")}
          >
            <Pencil className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden text-destructive hover:text-destructive sm:inline-flex"
            onClick={() => onDelete(link)}
            aria-label={t("deleteLinkAria")}
          >
            <Trash2 className="size-4" />
          </Button>

          {/* Mobile: inline actions collapse into a 3-dots dropdown so the
              title/description/URL get the row's width back. */}
          <RowActionsMenu link={link} onEdit={onEdit} onDelete={onDelete} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Mobile-only 3-dots actions menu for one link row (desktop keeps inline icons).
 *  The panel is position:FIXED (anchored to the trigger's rect at open time):
 *  the row Card clips overflow-hidden, so an absolutely-positioned panel would
 *  be cut off — and making the Card overflow-visible would un-clamp its
 *  min-width:auto and re-create the page-wide horizontal overflow. */
function RowActionsMenu({ link, onEdit, onDelete }: SortableLinkProps) {
  const t = useTranslations("linksPage");
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      // the panel is PORTALED to document.body (see below), so it is not a DOM
      // descendant of ref — treat taps inside it as "inside" or every tap on a
      // menu item would close the menu before the item's click fires.
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [open]);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent";

  // Toggle via a NATIVE listener on the button element (not React's delegated
  // onClick): hardened against browser extensions whose injected overlays /
  // capture-phase listeners can swallow delegated events (observed with the
  // Bitwarden autofill overlay fighting React DOM commits on this page).
  React.useEffect(() => {
    const btn = ref.current?.querySelector("button");
    if (!btn) return;
    const handler = () => {
      if (open) { setOpen(false); return; }
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
      setOpen(true);
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("moreActions")}
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && pos
        ? createPortal(
            /* PORTAL to document.body: dnd-kit puts an inline transform on every
               sortable row, and a transformed ancestor becomes the containing
               block for position:fixed — the panel's viewport coords (top/right
               from the trigger's getBoundingClientRect) would be re-interpreted
               inside the row's offset space and land off-screen (the "menu
               doesn't open" bug on real devices). Portaling escapes it. */
            <div
              ref={panelRef}
              className="fixed z-50 w-44 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-[0_20px_60px_-20px_rgba(5,3,20,0.8)]"
              style={{ top: pos.top, right: pos.right }}
            >
          <button
            type="button"
            className={itemCls}
            onClick={() => { setOpen(false); onEdit(link); }}
          >
            <Pencil className="size-4 text-muted-foreground" />{t("editLinkAria")}
          </button>
          <Link href={`/links/${link.id}`} className={itemCls} onClick={() => setOpen(false)}>
            <BarChart3 className="size-4 text-muted-foreground" />{t("linkAnalyticsAria")}
          </Link>
          {link.type !== "divider" ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={itemCls}
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="size-4 text-muted-foreground" />{t("openLinkAria")}
            </a>
          ) : null}
          <button
            type="button"
            className={`${itemCls} text-destructive hover:text-destructive`}
            onClick={() => { setOpen(false); onDelete(link); }}
          >
            <Trash2 className="size-4" />{t("deleteLinkAria")}
          </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

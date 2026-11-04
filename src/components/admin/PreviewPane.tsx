"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Eye, X, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageMeta {
  id: number;
  slug: string;
  title: string;
  isDefault: boolean;
  isPublished: boolean;
}

// ── Context ─────────────────────────────────────────────────────────────

const PreviewContext = React.createContext<{
  reload: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  previewUrl: string | null;
}>({
  reload: () => {},
  open: false,
  setOpen: () => {},
  previewUrl: null,
});

export function usePreview() {
  return React.useContext(PreviewContext);
}

// ── Provider (wraps the entire admin shell) ─────────────────────────────

export function PreviewProvider({
  pages,
  children,
}: {
  pages: PageMeta[];
  children: React.ReactNode;
}) {
  return (
    <ActivePageResolver pages={pages}>
      {children}
    </ActivePageResolver>
  );
}

/** Reads search params — must be inside <Suspense> (the layout wraps us). */
function ActivePageResolver({
  pages,
  children,
}: {
  pages: PageMeta[];
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const pageId = searchParams.get("page");

  const activePage = React.useMemo(() => {
    if (pageId) {
      const found = pages.find((p) => p.id === Number(pageId));
      if (found) return found;
    }
    return pages.find((p) => p.isDefault) ?? pages[0];
  }, [pageId, pages]);

  const [open, setOpen] = React.useState(false);
  // Last known scroll position inside the preview iframe. Lives here (above
  // the remount key) so it survives reloads; PhoneFrame keeps it updated and
  // restores it after each load, so an autosave-triggered refresh no longer
  // yanks the preview back to the top of the page.
  const previewScrollRef = React.useRef(0);
  // Cache-bust state: `t` is the timestamp stamped at reload time (each reload
  // gets a fresh query string so the iframe can never serve a stale cached
  // copy of the same URL), `k` counts reloads for the remount key.
  const [manualReload, setManualReload] = React.useState<{ t: number; k: number } | null>(null);
  const reload = React.useCallback(
    () => setManualReload((prev) => ({ t: Date.now(), k: (prev?.k ?? 0) + 1 })),
    [],
  );

  const bust = manualReload?.t ?? 0;
  const reloadKey = `${activePage?.id ?? 0}-${manualReload?.k ?? 0}`;
  const previewUrl = activePage
    ? bust > 0
      ? `/${activePage.slug}?v=${bust}`
      : `/${activePage.slug}`
    : null;

  const contextValue = React.useMemo(
    () => ({ reload, open, setOpen, previewUrl }),
    [reload, open, previewUrl],
  );

  return (
    <PreviewContext.Provider value={contextValue}>
      {/* When the desktop pane is open, reserve its exact width (360px at lg,
          400px at xl) as padding so the admin shell — sidebar AND content on
          every page — resizes instead of being covered. Without this the
          pane overlays the right edge of forms and they can't be used. */}
      <div
        className={
          open && previewUrl
            ? "lg:pr-[360px] xl:pr-[400px] transition-[padding] duration-200 ease-out"
            : "transition-[padding] duration-200 ease-out"
        }
      >
        {children}
      </div>
      {previewUrl && open && (
        <PreviewOverlay
          src={previewUrl}
          reloadKey={reloadKey}
          reload={reload}
          onClose={() => setOpen(false)}
          scrollRef={previewScrollRef}
        />
      )}
    </PreviewContext.Provider>
  );
}

// ── Preview Button (for sidebar + mobile tab bar) ───────────────────────

export function PreviewButton({
  className,
  variant = "sidebar",
  labelHidden = false,
}: {
  className?: string;
  /** "sidebar" = inline row (desktop sidebar); "dock" = raised aurora circle (mobile tab bar). */
  variant?: "sidebar" | "dock";
  labelHidden?: boolean;
}) {
  const { open, setOpen } = React.useContext(PreviewContext);
  const t = useTranslations("preview");
  if (variant === "dock") {
    return (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-pressed={open}
        aria-label={t("livePreview")}
        className={cn("group relative flex flex-col items-center", className)}
      >
        <span
          className={cn(
            "-mt-7 grid size-12 place-items-center rounded-full border-[3px] border-background shadow-[0_10px_26px_rgba(124,58,237,0.45)] transition-transform duration-150 group-hover:-translate-y-0.5",
            open && "ring-2 ring-lavender ring-offset-2 ring-offset-background",
          )}
          style={{ background: "var(--aurora-grad)" }}
        >
          <Eye className="size-5 text-white" />
        </span>
        <span className="mt-0.5 text-[10px] font-semibold text-lavender">{t("livePreview")}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all hover:translate-x-0.5 rtl:hover:-translate-x-0.5 hover:bg-violet/15 hover:text-lavender",
        open && "bg-violet/15 text-lavender",
        className,
      )}
    >
      <Eye className="size-4" />
      <span className={cn(labelHidden && "hidden")}>{t("livePreview")}</span>
    </button>
  );
}

// ── Overlay Panel ───────────────────────────────────────────────────────

function PreviewOverlay({
  src,
  reloadKey,
  reload,
  onClose,
  scrollRef,
}: {
  src: string;
  reloadKey: string;
  reload: () => void;
  onClose: () => void;
  scrollRef: React.RefObject<number>;
}) {
  return (
    <>
      {/* Desktop: floating panel anchored to right edge, full viewport height */}
      <div className="fixed right-0 top-0 z-30 hidden h-dvh w-[360px] flex-col border-l border-border bg-sidebar/80 backdrop-blur-xl lg:flex xl:w-[400px]">
        <PreviewHeader src={src} reload={reload} onClose={onClose} />
        <div className="flex-1 overflow-hidden">
          <PhoneFrame key={reloadKey} src={src} scrollRef={scrollRef} />
        </div>
      </div>

      {/* Mobile: full-screen overlay */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
        <PreviewHeader src={src} reload={reload} onClose={onClose} />
        <div className="flex-1 overflow-hidden">
          <PhoneFrame key={reloadKey} src={src} scrollRef={scrollRef} />
        </div>
      </div>
    </>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function PreviewHeader({
  src,
  reload,
  onClose,
}: {
  src: string;
  reload: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("preview");
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-lavender" />
        <span className="text-sm font-medium">{t("livePreview")}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={reload}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("refresh")}
        >
          <RefreshCw className="size-4" />
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("openNewTab")}
        >
          <ExternalLink className="size-4" />
        </a>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("close")}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ── Phone Frame ─────────────────────────────────────────────────────────

function PhoneFrame({ src, scrollRef }: { src: string; scrollRef: React.RefObject<number> }) {
  const t = useTranslations("preview");
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Track the preview's scroll offset so a reload (autosave refreshes the
  // iframe cache-busted) can restore it instead of snapping back to the top.
  React.useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const onScroll = () => {
      try {
        scrollRef.current = win.scrollY;
      } catch {
        /* cross-origin guard — never fires for same-origin previews */
      }
    };
    win.addEventListener("scroll", onScroll, { passive: true });
    // Restore after THIS mount's document finishes loading. Slight delay so
    // images/fonts that affect layout height have begun to settle.
    const restore = () => {
      const y = Math.min(scrollRef.current, Math.max(0, (win.document.body?.scrollHeight ?? 0) - win.innerHeight));
      try {
        win.scrollTo(0, y);
      } catch {
        /* ignore */
      }
    };
    win.addEventListener("load", restore);
    if (win.document.readyState === "complete") restore();
    return () => {
      win.removeEventListener("scroll", onScroll);
      win.removeEventListener("load", restore);
    };
  }, [scrollRef, src]);

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="relative flex h-full max-h-[720px] aspect-[9/19.5] w-auto overflow-hidden rounded-[2.5rem] border-[8px] border-night-900 bg-night-950 shadow-[0_0_60px_-12px_rgba(124,58,237,0.3)]">
        <div className="absolute left-1/2 top-0 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-night-900" />
        <iframe
          ref={iframeRef}
          src={src}
          title={t("livePreview")}
          className="h-full w-full border-0"
          loading="lazy"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        />
      </div>
    </div>
  );
}

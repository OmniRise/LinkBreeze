"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Plus, FileText, Star, Globe, Trash2, Download, Archive } from "lucide-react";
import type { PageRow } from "@/server/queries";
import { updatePageAction } from "@/server/actions/pages";
import { DeletePageDialog } from "@/components/admin/delete-page-dialog";
import { SuccessToast } from "@/components/ui/success-toast";

interface PageSwitcherProps {
  pages: Pick<PageRow, "id" | "slug" | "title" | "isDefault" | "isPublished">[];
  variant?: "full" | "compact";
}

export function PageSwitcher({ pages, variant = "full" }: PageSwitcherProps) {
  const t = useTranslations("pageSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPageId = searchParams.get("page");
  const [open, setOpen] = React.useState(false);
  const [pageToDelete, setPageToDelete] = React.useState<PageSwitcherProps["pages"][number] | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [defaultError, setDefaultError] = React.useState<string | null>(null);
  const [settingDefaultId, startDefaultTransition] = React.useTransition();
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Resolve the active page: explicit ?page= param → default page → first.
  const activePage = React.useMemo(() => {
    if (currentPageId) {
      const found = pages.find((p) => p.id === Number(currentPageId));
      if (found) return found;
    }
    return pages.find((p) => p.isDefault) ?? pages[0];
  }, [currentPageId, pages]);

  // Close dropdown on outside click.
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigateToPage(pageId: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(pageId));
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function setDefault(page: PageSwitcherProps["pages"][number]) {
    const formData = new FormData();
    formData.set("pageId", String(page.id));
    formData.set("isDefault", "true");
    startDefaultTransition(async () => {
      const result = await updatePageAction(formData);
      if (!result.success) {
        setDefaultError(result.error);
        return;
      }
      setDefaultError(null);
      setToast(t("nowDefault", { name: page.title || page.slug }));
      // Follow the page to its new home at the top of the list.
      navigateToPage(page.id);
      router.refresh();
    });
  }

  if (!activePage) return null;

  const isCompact = variant === "compact";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          isCompact
            ? "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50"
            : "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
        }
      >
        <span className="flex items-center gap-2 truncate">
          {activePage.isDefault ? (
            <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="max-w-[100px] truncate font-medium">
            {activePage.title || activePage.slug}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={
            isCompact
              ? "absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg"
              : "absolute bottom-full left-0 right-0 z-50 mb-1 rounded-lg border border-border bg-popover p-1 shadow-lg"
          }
        >
          {pages.map((page) => (
            <div
              key={page.id}
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
                page.id === activePage.id ? "bg-muted/30" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => navigateToPage(page.id)}
                className="flex flex-1 items-center gap-2 truncate text-left"
              >
                {page.isDefault ? (
                  <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">
                  {page.title || page.slug}
                </span>
                {!page.isPublished && (
                  <Globe className="size-3 shrink-0 text-muted-foreground opacity-50" />
                )}
              </button>
              {!page.isDefault && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDefault(page);
                    }}
                    disabled={settingDefaultId}
                    className="mr-1 shrink-0 text-muted-foreground transition-colors hover:text-warning disabled:opacity-50"
                    aria-label={t("makeDefault", { name: page.title || page.slug })}
                    title={t("makeDefault", { name: page.title || page.slug })}
                  >
                    <Star className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageToDelete(page);
                    }}
                    className="mr-1 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={t("deletePage", { name: page.title || page.slug })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <a
                href={`/api/pages/export?id=${page.id}`}
                className="mr-2 shrink-0 text-muted-foreground transition-colors hover:text-lavender"
                aria-label={t("exportHtml", { name: page.title || page.slug })}
                title={t("exportHtml", { name: page.title || page.slug })}
              >
                <Download className="size-3.5" />
              </a>
              <a
                href={`/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-lavender"
                aria-label={t("viewPage", { slug: page.slug })}
              >
                /{page.slug}
              </a>
            </div>
          ))}
          {defaultError ? (
            <p className="px-2 py-1.5 text-xs text-destructive" role="alert">
              {defaultError}
            </p>
          ) : null}
          <div className="mt-1 border-t border-border pt-1">
            {/* File download, not page navigation: <Link> would prefetch an
                attachment endpoint; a plain anchor lets the browser handle
                Content-Disposition natively. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/pages/export?all=1"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Archive className="size-3.5" />
              {t("exportAll")}
            </a>
            <Link
              href="/pages/new"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {t("newPage")}
            </Link>
          </div>
        </div>
      )}

      <DeletePageDialog
        page={pageToDelete}
        open={pageToDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPageToDelete(null);
        }}
      />

      {toast ? <SuccessToast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}

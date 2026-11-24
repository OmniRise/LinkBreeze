"use client";

import * as React from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, DownloadCloud, FolderOpen, GripVertical, Pencil, Trash2, Minus } from "lucide-react";
import { useRouter } from "next/navigation";
import { reorderContent } from "@/server/actions/sections";
import { createDivider } from "@/server/actions/links";
import type { LinkRow, LinkSectionRow, ThemeRow } from "@/server/queries";
import { groupLinksBySection } from "@/lib/link-sections";
import { LucideIcon, isLucideIconName } from "@/components/public/LucideIcon";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { usePreview } from "@/components/admin/PreviewPane";
import { SortableLink } from "./components/sortable-link";
import { LinkDialog } from "./components/link-dialog";
import { DeleteLinkDialog } from "./components/delete-link-dialog";
import { SectionDialog } from "./components/section-dialog";
import { DeleteSectionDialog } from "./components/delete-section-dialog";

/** Sections are droppable containers identified by `section:<id>` / `section:null`. */
function sectionDndId(sectionId: number | null): string {
  return `section:${sectionId ?? "none"}`;
}

/** A drop zone for one group (links + section header). */
function SectionGroup({
  section,
  links,
  onEditSection,
  onDeleteSection,
  children,
}: {
  section: LinkSectionRow | null;
  links: LinkRow[];
  onEditSection: (s: LinkSectionRow) => void;
  onDeleteSection: (s: LinkSectionRow) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("linksPage");
  const dndId = sectionDndId(section?.id ?? null);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dndId });
  const {
    attributes,
    listeners,
    setNodeRef: setHeaderRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `section-header-${section?.id ?? "none"}`,
    data: { type: "section-header" },
  });

  return (
    <div
      ref={setDropRef}
      className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
        isOver ? "border-violet/60 bg-violet/5" : "border-border"
      }`}
    >
      <div
        ref={setHeaderRef}
        className="flex items-center justify-between gap-2"
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {section ? (
            <button
              className="flex cursor-grab touch-none items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
              {...attributes}
              {...listeners}
              aria-label={t("dragReorderSection")}
              type="button"
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          {section ? (
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet/15 text-violet"
            >
              <FolderOpen className="size-4" />
            </span>
          ) : null}
          <span className="truncate text-sm font-semibold">
            {section ? (
              <>
                {isLucideIconName(section.icon) ? (
                  <LucideIcon name={section.icon as string} size={14} className="mr-1 inline-block align-[-2px] text-muted-foreground" />
                ) : null}
                {section.title}
              </>
            ) : (
              "Uncategorized"
            )}
          </span>
          <span className="ml-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {links.length}
          </span>
        </div>
        {section ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEditSection(section)}
              aria-label={t("editSectionAria")}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDeleteSection(section)}
              aria-label={t("deleteSectionAria")}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {children}
        {links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">{t("dropLinksHere")}</p>
        ) : null}
      </div>
    </div>
  );
}

export function LinksManager({
  initialLinks,
  sections,
  pageId,
  pageTheme,
  pageSlug,
}: {
  initialLinks: LinkRow[];
  sections: LinkSectionRow[];
  pageId?: number;
  /** Page's resolved theme row — feeds the live card preview in LinkDialog. */
  pageTheme?: ThemeRow | null;
  pageSlug?: string | null;
}) {
  const t = useTranslations("linksPage");
  const { reload: reloadPreview } = usePreview();
  const [items, setItems] = React.useState<LinkRow[]>(initialLinks);
  const [sectionList, setSectionList] = React.useState<LinkSectionRow[]>(sections);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LinkRow | null>(null);
  const [deleting, setDeleting] = React.useState<LinkRow | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = React.useState(false);
  const [editingSection, setEditingSection] = React.useState<LinkSectionRow | null>(null);
  const [deletingSection, setDeletingSection] = React.useState<LinkSectionRow | null>(null);
  const [deleteSectionOpen, setDeleteSectionOpen] = React.useState(false);

  // Sync local state when the server passes fresh data (after router.refresh()).
  // Adjusting state during render avoids the setState-in-effect anti-pattern.
  const [lastInitial, setLastInitial] = React.useState(initialLinks);
  if (initialLinks !== lastInitial) {
    setLastInitial(initialLinks);
    setItems(initialLinks);
  }
  const [lastSections, setLastSections] = React.useState(sections);
  if (sections !== lastSections) {
    setLastSections(sections);
    setSectionList(sections);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Current visual order, flattened across groups in render order.
  // dropEmpty=false keeps empty sections visible as drop targets.
  const groups = React.useMemo(
    () => groupLinksBySection(items, sectionList, false),
    [items, sectionList],
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Section headers are sortable among themselves.
    if (activeId.startsWith("section-header-")) {
      if (!overId.startsWith("section-header-")) return;
      const a = Number(activeId.replace("section-header-", ""));
      const b = Number(overId.replace("section-header-", ""));
      const oldIndex = sectionList.findIndex((s) => s.id === a);
      const newIndex = sectionList.findIndex((s) => s.id === b);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = [...sectionList];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setSectionList(reordered);
      await reorderContent({
        linkOrder: items.map((l) => ({ id: l.id, sectionId: l.sectionId })),
        sectionOrder: reordered.map((s) => s.id),
      });
      reloadPreview();
      return;
    }

    // Link drag. Determine target section from the drop target:
    // a section container id, or the section of the link we dropped on.
    const linkId = Number(activeId);
    const link = items.find((l) => l.id === linkId);
    if (!link) return;

    let targetSectionId: number | null;
    if (overId.startsWith("section:")) {
      const raw = overId.replace("section:", "");
      targetSectionId = raw === "none" ? null : Number(raw);
    } else {
      const overLink = items.find((l) => l.id === Number(overId));
      if (!overLink) return;
      targetSectionId = overLink.sectionId;
    }

    // Rebuild the flat order: remove, then insert at the over-link's position
    // (or at the end of the target group when dropped on the container).
    const without: LinkRow[] = [];
    for (const l of items) {
      if (l.id !== linkId) without.push({ ...l });
    }
    let insertAt = without.length;
    if (!overId.startsWith("section:")) {
      const overIdx = without.findIndex((l) => l.id === Number(overId));
      if (overIdx >= 0) {
        // Insert before/after the drop target. Both indices must come from
        // the SAME array: fromIdx is measured on the original order, so the
        // target index is converted back to original coordinates. Comparing
        // against `without`'s index instead was off by one for every move
        // upward (drag up = silent no-op) and landed long down-moves one
        // slot short.
        const fromIdx = items.findIndex((l) => l.id === linkId);
        const overIdxOrig = items.findIndex((l) => l.id === Number(overId));
        insertAt = fromIdx < overIdxOrig ? overIdx + 1 : overIdx;
      }
    }

    const updated: LinkRow = { ...link, sectionId: targetSectionId };
    without.splice(insertAt, 0, updated);
    setItems(without);

    await reorderContent({
      linkOrder: without.map((l) => ({ id: l.id, sectionId: l.sectionId })),
      sectionOrder: sectionList.map((s) => s.id),
    });
    reloadPreview();
  };

  const openEdit = (link: LinkRow) => {
    setEditing(link);
    setDialogOpen(true);
  };

  const openDelete = (link: LinkRow) => {
    setDeleting(link);
    setDeleteOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  // #87: one-click divider. Appends the row server-side; router.refresh()
  // picks up the new item and the preview reloads like any link save.
  const [dividerPending, setDividerPending] = React.useState(false);
  const router = useRouter();
  const addDivider = async () => {
    setDividerPending(true);
    try {
      const result = await createDivider(pageId);
      if (result.success) {
        router.refresh();
        reloadPreview();
      }
    } finally {
      setDividerPending(false);
    }
  };

  const openCreateSection = () => {
    setEditingSection(null);
    setSectionDialogOpen(true);
  };

  const openEditSection = (section: LinkSectionRow) => {
    setEditingSection(section);
    setSectionDialogOpen(true);
  };

  const openDeleteSection = (section: LinkSectionRow) => {
    setDeletingSection(section);
    setDeleteSectionOpen(true);
  };

  const hasAnyContent = items.length > 0 || sectionList.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("links")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("addEditAndReorder")}</p>
        </div>
        {/* Vertical stack on mobile (right side), horizontal row on sm+. */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={openCreateSection} aria-label={t("addSection")}>
            <FolderOpen className="size-4" /><span className="hidden sm:inline">{t("addSection")}</span>
          </Button>
          <Button variant="outline" onClick={addDivider} disabled={dividerPending} aria-label={t("addDivider")}>
            <Minus className="size-4" /><span className="hidden sm:inline">{t("addDivider")}</span>
          </Button>
          <Button onClick={openCreate} aria-label={t("addLink")}>
            <Plus className="size-4" /><span className="hidden sm:inline">{t("addLink")}</span>
          </Button>
        </div>
      </div>

      {!hasAnyContent ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-violet/15">
              <Plus className="size-5 text-violet" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t("noLinksYet")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("addALinkOrImport")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={openCreate}>
                <Plus className="size-4" />{t("addYourFirstLink")}</Button>
              <a
                href="/settings?tab=data"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <DownloadCloud className="size-4" />{t("importYourExistingPage")}</a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          id="links-dnd"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const sectionId = group.section?.id ?? null;
              return (
                <SectionGroup
                  key={sectionId ?? "none"}
                  section={group.section}
                  links={group.links}
                  onEditSection={openEditSection}
                  onDeleteSection={openDeleteSection}
                >
                  <SortableContext
                    items={group.links.map((l) => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {group.links.map((link) => (
                      <SortableLink
                        key={link.id}
                        link={link}
                        onEdit={openEdit}
                        onDelete={openDelete}
                      />
                    ))}
                  </SortableContext>
                </SectionGroup>
              );
            })}
          </div>
        </DndContext>
      )}

      <LinkDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) reloadPreview();
        }}
        editing={editing}
        pageId={pageId}
        sections={sectionList}
        pageTheme={pageTheme}
        pageSlug={pageSlug}
      />
      <DeleteLinkDialog
        link={deleting}
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v);
          if (!v) reloadPreview();
        }}
      />
      <SectionDialog
        open={sectionDialogOpen}
        onOpenChange={(v) => {
          setSectionDialogOpen(v);
          if (!v) reloadPreview();
        }}
        editing={editingSection}
        pageId={pageId}
      />
      <DeleteSectionDialog
        section={deletingSection}
        open={deleteSectionOpen}
        onOpenChange={(v) => {
          setDeleteSectionOpen(v);
          if (!v) reloadPreview();
        }}
      />
    </div>
  );
}

import "server-only";
import { db } from "@/db";
import {
  users,
  settings,
  profile,
  pages,
  links,
  linkSections,
  themes,
  customFonts,
  analyticsPageviews,
  analyticsClicks,
  subscribers,
} from "@/db/schema";
import { PRESETS } from "@/lib/theme-presets";
import {
  eq,
  and,
  or,
  lt,
  gt,
  asc,
  desc,
  isNull,
  sql,
} from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfileRow = typeof profile.$inferSelect;
export type LinkRow = typeof links.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type PageRow = typeof pages.$inferSelect;

export interface SocialLink {
  platform: string;
  url: string;
}

export interface DashboardStats {
  totalViews: number;
  uniqueVisitors: number;
  totalClicks: number;
  ctr: number;
  topLinks: Array<{ id: number; title: string; clicks: number }>;
  viewsPerDay: Array<{ date: string; views: number; clicks: number }>;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<ProfileRow | null> {
  const rows = await db.select().from(profile).limit(1);
  return rows[0] ?? null;
}

/**
 * Profile for public display. Currently identical to getProfile(), but kept
 * as a separate entry point so future filtering (e.g. per-user profiles,
 * published/unpublished flag) can go here without touching every caller.
 */
export async function getActiveProfile(): Promise<ProfileRow | null> {
  return getProfile();
}

export async function updateProfile(
  data: Partial<Pick<ProfileRow, "avatarUrl" | "displayName" | "bio" | "badgeText" | "socialLinks">>,
): Promise<void> {
  const existing = await getProfile();
  if (existing) {
    await db.update(profile).set(data).where(eq(profile.id, existing.id));
  } else {
    await db.insert(profile).values({
      avatarUrl: data.avatarUrl ?? null,
      displayName: data.displayName ?? "",
      bio: data.bio ?? "",
      badgeText: data.badgeText ?? null,
      socialLinks: data.socialLinks ?? "[]",
    });
  }
}

// ─── Pages (multi-page support) ──────────────────────────────────────────────

/**
 * Ensure the pages table has at least one row. On first migration the SQL
 * seeds a default page from legacy profile data, but if the table is empty
 * (edge case: fresh install with no profile row), this creates one.
 */
export async function ensureDefaultPage(): Promise<PageRow> {
  const existing = await db.select().from(pages).limit(1);
  if (existing[0]) return existing[0];

  const slug = (await getSetting("slug")) || "u";
  const [profileRow, activeTheme] = await Promise.all([
    getProfile(),
    getActiveTheme(),
  ]);

  const inserted = await db
    .insert(pages)
    .values({
      slug,
      title: profileRow?.displayName ?? "",
      bio: profileRow?.bio ?? "",
      avatarUrl: profileRow?.avatarUrl ?? null,
      badgeText: profileRow?.badgeText ?? null,
      socialLinks: profileRow?.socialLinks ?? "[]",
      themeId: activeTheme?.id ?? null,
      orderIndex: 0,
      isDefault: true,
      isPublished: true,
    })
    .returning();
  return inserted[0];
}

export async function getAllPages(): Promise<PageRow[]> {
  await ensureDefaultPage();
  // Default page pinned first; the rest keep their manual order.
  return db
    .select()
    .from(pages)
    .orderBy(desc(pages.isDefault), asc(pages.orderIndex), asc(pages.id));
}

export async function getDefaultPage(): Promise<PageRow> {
  await ensureDefaultPage();
  const rows = await db.select().from(pages).where(eq(pages.isDefault, true)).limit(1);
  if (rows[0]) return rows[0];
  // No default flag — fall back to first by order.
  const fallback = await db.select().from(pages).orderBy(asc(pages.orderIndex)).limit(1);
  if (fallback[0]) {
    await db.update(pages).set({ isDefault: true }).where(eq(pages.id, fallback[0].id));
    return { ...fallback[0], isDefault: true };
  }
  return ensureDefaultPage();
}

export async function getPageById(id: number): Promise<PageRow | null> {
  const rows = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPageBySlug(slug: string): Promise<PageRow | null> {
  const rows = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export interface CreatePageInput {
  slug: string;
  title?: string;
  bio?: string;
  /** #124: owning account. Absent/null = legacy unowned page (admin-managed). */
  userId?: number | null;
}

export async function createPage(data: CreatePageInput): Promise<PageRow> {
  await ensureDefaultPage();
  const maxOrder = await db.select({ m: sql<number>`max(${pages.orderIndex})` }).from(pages);
  const nextOrder = (maxOrder[0]?.m ?? -1) + 1;

  const inserted = await db
    .insert(pages)
    .values({
      slug: data.slug,
      title: data.title ?? "",
      bio: data.bio ?? "",
      orderIndex: nextOrder,
      isDefault: false,
      isPublished: true,
      userId: data.userId ?? null,
    })
    .returning();
  return inserted[0];
}

export interface UpdatePageInput {
  slug?: string;
  title?: string;
  bio?: string;
  avatarUrl?: string | null;
  badgeText?: string | null;
  socialLinks?: string;
  themeId?: number | null;
  isPublished?: boolean;
  isDefault?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  footerText?: string;
  analyticsScript?: string;
  customCss?: string;
  emailCapture?: boolean;
  faviconUrl?: string | null;
  privacyPolicy?: string;
  qrSettings?: string | null;
  // Per-upload image adjustments (Spec: Image-Positioning) — NULL resets.
  avatarFit?: string | null;
  avatarPosX?: number | null;
  avatarPosY?: number | null;
  avatarZoom?: number | null;
  bannerFit?: string | null;
  bannerPosX?: number | null;
  bannerPosY?: number | null;
  bannerZoom?: number | null;
  backgroundFitOverride?: string | null;
  backgroundPosX?: number | null;
  backgroundPosY?: number | null;
  backgroundZoom?: number | null;
  // OG image (per page) — NULL mode = auto; ogImageUrl NULL = none.
  ogImageMode?: string | null;
  ogImageUrl?: string | null;
  ogImageFit?: string | null;
  ogImagePosX?: number | null;
  ogImagePosY?: number | null;
  ogImageZoom?: number | null;
}

export async function updatePage(id: number, data: UpdatePageInput): Promise<void> {
  // If marking as default, un-default all others in the same transaction.
  if (data.isDefault) {
    db.transaction((tx) => {
      tx.update(pages).set({ isDefault: false }).run();
      tx.update(pages).set(data).where(eq(pages.id, id)).run();
    });
  } else {
    await db.update(pages).set(data).where(eq(pages.id, id));
  }
}

export async function deletePage(id: number, wipe = false): Promise<void> {
  const target = await getPageById(id);
  if (!target) return;
  if (target.isDefault) throw new Error("Cannot delete the default page");

  db.transaction((tx) => {
    if (wipe) {
      // Hard delete: links (their click analytics cascade), sections, then the page.
      tx.delete(links).where(eq(links.pageId, id)).run();
    } else {
      // Keep mode: move links to the default page (sections don't transfer).
      // The default page always exists (schema invariant), so assert it.
      const def = tx.select({ id: pages.id }).from(pages).where(eq(pages.isDefault, true)).limit(1).get();
      if (!def) throw new Error("No default page found to move links to");
      tx.update(links).set({ pageId: def.id, sectionId: null }).where(eq(links.pageId, id)).run();
    }
    // Clear pageId on analytics rows (keep historical data, disassociate page).
    tx.update(analyticsPageviews).set({ pageId: null }).where(eq(analyticsPageviews.pageId, id)).run();
    tx.delete(linkSections).where(eq(linkSections.pageId, id)).run();
    tx.delete(pages).where(eq(pages.id, id)).run();
  });
}

export async function reorderPages(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  db.transaction((tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      tx.update(pages).set({ orderIndex: i }).where(eq(pages.id, orderedIds[i])).run();
    }
  });
}

// ─── Links ────────────────────────────────────────────────────────────────────

const nowExpr = sql`datetime('now')`;

export async function getActiveLinks(pageId?: number): Promise<LinkRow[]> {
  const conditions = [
    eq(links.isActive, true),
    or(isNull(links.scheduleStart), lt(links.scheduleStart, nowExpr)),
    or(isNull(links.scheduleEnd), gt(links.scheduleEnd, nowExpr)),
  ];
  if (pageId !== undefined) {
    conditions.push(eq(links.pageId, pageId));
  }
  const rows = await db
    .select()
    .from(links)
    .where(and(...conditions))
    .orderBy(asc(links.orderIndex), asc(links.id));
  return rows;
}

export async function getAllLinks(pageId?: number): Promise<LinkRow[]> {
  if (pageId !== undefined) {
    return db
      .select()
      .from(links)
      .where(eq(links.pageId, pageId))
      .orderBy(asc(links.orderIndex), asc(links.id));
  }
  return db
    .select()
    .from(links)
    .orderBy(asc(links.orderIndex), asc(links.id));
}

export async function createLink(
  data: Pick<LinkRow, "title" | "url"> &
    Partial<
      Pick<
        LinkRow,
        | "pageId"
        | "type"
        | "description"
        | "icon"
        | "iconUrl"
        | "customIconUrl"
        | "iconMode"
        | "autoIcon"
        | "imageUrl"
        | "isHighlighted"
        | "isActive"
        | "scheduleStart"
        | "scheduleEnd"
        | "cardStyle"
        | "sectionId"
        | "popupText"
        | "ctaLabel"
        | "redirectSlug"
      >
    >,
): Promise<LinkRow> {
  const targetPageId = data.pageId ?? (await getDefaultPage()).id;
  const maxOrder = await db
    .select({ m: sql<number>`max(${links.orderIndex})` })
    .from(links)
    .where(eq(links.pageId, targetPageId));
  const nextOrder = (maxOrder[0]?.m ?? -1) + 1;

  const created = await db
    .insert(links)
    .values({
      title: data.title,
      url: data.url,
      pageId: targetPageId,
      type: data.type ?? "url",
      description: data.description ?? null,
      icon: data.icon ?? null,
      iconUrl: data.iconUrl ?? null,
      customIconUrl: data.customIconUrl ?? null,
      iconMode: data.iconMode ?? "auto",
      autoIcon: data.autoIcon ?? true,
      imageUrl: data.imageUrl ?? null,
      isHighlighted: data.isHighlighted ?? false,
      isActive: data.isActive ?? true,
      scheduleStart: data.scheduleStart ?? null,
      scheduleEnd: data.scheduleEnd ?? null,
      cardStyle: data.cardStyle ?? "compact",
      sectionId: data.sectionId ?? null,
      popupText: data.popupText ?? null,
      ctaLabel: data.ctaLabel ?? null,
      redirectSlug: data.redirectSlug ?? null,
      orderIndex: nextOrder,
    })
    .returning();
  return created[0];
}

export async function updateLink(
  id: number,
  data: Partial<
    Pick<
      LinkRow,
      | "title"
      | "url"
      | "type"
      | "description"
      | "icon"
      | "iconUrl"
      | "customIconUrl"
      | "iconMode"
      | "autoIcon"
      | "imageUrl"
      | "isHighlighted"
      | "isActive"
      | "scheduleStart"
      | "scheduleEnd"
      | "cardStyle"
      | "sectionId"
      | "popupText"
      | "ctaLabel"
      | "redirectSlug"
    >
  >,
): Promise<void> {
  await db.update(links).set(data).where(eq(links.id, id));
}

export async function deleteLink(id: number): Promise<void> {
  // Delete analytics clicks first so orphaned rows don't linger on
  // databases created before the FK constraint was added to the schema.
  await db.delete(analyticsClicks).where(eq(analyticsClicks.linkId, id));
  await db.delete(links).where(eq(links.id, id));
}

export async function reorderLinks(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  // Batch all updates in a single transaction so reorder is atomic and fast.
  db.transaction((tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      tx.update(links).set({ orderIndex: i }).where(eq(links.id, orderedIds[i])).run();
    }
  });
}

// ─── Link sections ────────────────────────────────────────────────────────────

export type LinkSectionRow = typeof linkSections.$inferSelect;

export async function getSectionsByPage(pageId: number): Promise<LinkSectionRow[]> {
  return db
    .select()
    .from(linkSections)
    .where(eq(linkSections.pageId, pageId))
    .orderBy(asc(linkSections.orderIndex), asc(linkSections.id));
}

export async function createSection(
  data: Pick<typeof linkSections.$inferInsert, "pageId" | "title"> &
    Partial<Pick<typeof linkSections.$inferInsert, "icon">>,
): Promise<LinkSectionRow> {
  const maxOrder = await db
    .select({ m: sql<number>`max(${linkSections.orderIndex})` })
    .from(linkSections)
    .where(eq(linkSections.pageId, data.pageId));
  const nextOrder = (maxOrder[0]?.m ?? -1) + 1;

  const created = await db
    .insert(linkSections)
    .values({
      pageId: data.pageId,
      title: data.title,
      icon: data.icon ?? null,
      orderIndex: nextOrder,
    })
    .returning();
  return created[0];
}

export async function updateSection(
  id: number,
  data: Partial<Pick<LinkSectionRow, "title" | "icon" | "orderIndex">>,
): Promise<void> {
  await db.update(linkSections).set(data).where(eq(linkSections.id, id));
}

/**
 * Delete a section. Its links fall back to uncategorized (sectionId → NULL)
 * — they are never lost. Links are nulled explicitly because SQLite does not
 * enforce foreign keys unless PRAGMA foreign_keys=ON.
 */
export async function deleteSection(id: number): Promise<void> {
  db.transaction((tx) => {
    tx.update(links).set({ sectionId: null }).where(eq(links.sectionId, id)).run();
    tx.delete(linkSections).where(eq(linkSections.id, id)).run();
  });
}

export async function reorderSections(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  db.transaction((tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      tx.update(linkSections)
        .set({ orderIndex: i })
        .where(eq(linkSections.id, orderedIds[i]))
        .run();
    }
  });
}

/**
 * Full content reorder for the links manager: persists link order within
 * every group and section order, in one transaction.
 *
 * @param linkOrder  Flat array of {id, sectionId} in visual order — the
 *                   orderIndex is derived from position, sectionId from the
 *                   group the link was dropped into.
 * @param sectionOrder Section ids in visual order.
 */
export async function reorderPageContent(
  linkOrder: Array<{ id: number; sectionId: number | null }>,
  sectionOrder: number[],
): Promise<void> {
  if (linkOrder.length === 0 && sectionOrder.length === 0) return;
  db.transaction((tx) => {
    for (let i = 0; i < sectionOrder.length; i++) {
      tx.update(linkSections)
        .set({ orderIndex: i })
        .where(eq(linkSections.id, sectionOrder[i]))
        .run();
    }
    for (let i = 0; i < linkOrder.length; i++) {
      tx.update(links)
        .set({ orderIndex: i, sectionId: linkOrder[i].sectionId })
        .where(eq(links.id, linkOrder[i].id))
        .run();
    }
  });
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export async function getActiveTheme(): Promise<ThemeRow | null> {
  // Ensure presets exist before querying. This was previously an inline
  // fallback that seeded a SINGLE Aurora theme, which prevented
  // seedThemesIfEmpty() from ever running (it saw count > 0 and bailed).
  // The public page calls getActiveTheme() before the admin theme page is
  // visited, so this must be the single source of truth for seeding.
  await seedThemesIfEmpty();
  // Newer presets also reach installs seeded by older versions.
  await backfillPresets();

  const rows = await db.select().from(themes).where(eq(themes.isActive, true)).limit(1);
  if (rows[0]) return rows[0];

  // No active theme — activate the first preset.
  const any = await db.select().from(themes).orderBy(asc(themes.id)).limit(1);
  if (any[0]) {
    await db.update(themes).set({ isActive: true }).where(eq(themes.id, any[0].id));
    return { ...any[0], isActive: true };
  }

  return null;
}

export async function getActiveThemeData(): Promise<ThemeRow | null> {
  return getActiveTheme();
}

export async function getAllThemes(): Promise<ThemeRow[]> {
  return db.select().from(themes).orderBy(asc(themes.id));
}

export async function getThemeById(id: number): Promise<ThemeRow | null> {
  const rows = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Pages rendering the given theme: pages with themeId set, plus every page when the theme is globally active. */
export async function getPagesUsingTheme(themeId: number): Promise<{ id: number; slug: string }[]> {
  const [active] = await db
    .select({ id: themes.id })
    .from(themes)
    .where(eq(themes.isActive, true))
    .limit(1);
  // Globally active theme renders on every page without its own themeId.
  if (active?.id === themeId) {
    return db.select({ id: pages.id, slug: pages.slug }).from(pages);
  }
  return db
    .select({ id: pages.id, slug: pages.slug })
    .from(pages)
    .where(eq(pages.themeId, themeId));
}

export async function setActiveTheme(id: number): Promise<void> {
  // Single transaction: deactivate all, then activate the target. If the
  // process crashes between them, the whole operation rolls back.
  db.transaction((tx) => {
    tx.update(themes).set({ isActive: false }).run();
    tx.update(themes).set({ isActive: true }).where(eq(themes.id, id)).run();
  });
}

export async function updateTheme(
  id: number,
  data: Partial<Omit<ThemeRow, "id" | "isActive" | "isPreset">>,
): Promise<void> {
  await db.update(themes).set(data).where(eq(themes.id, id));
}

/**
 * Duplicate a theme (preset or custom) as a new inactive custom theme.
 * Used by "Save as new" / "Duplicate" in the customizer so users can
 * clone a preset and modify the copy without touching the original.
 */
export async function duplicateTheme(id: number, newName: string): Promise<ThemeRow> {
  const rows = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
  const source = rows[0];
  if (!source) throw new Error("Theme not found");

  const { id: _id, isActive: _isActive, ...rest } = source;
  void _id;
  void _isActive;

  const inserted = await db
    .insert(themes)
    .values({
      ...rest,
      name: newName,
      isActive: false,
      isPreset: false,
    })
    .returning();

  return inserted[0];
}

/** Check whether a theme with the given name already exists (exact match, case-sensitive). */
export async function themeNameExists(name: string): Promise<boolean> {
  const rows = await db
    .select({ id: themes.id })
    .from(themes)
    .where(eq(themes.name, name.trim()))
    .limit(1);
  return rows.length > 0;
}

/** Delete a theme by id. Presets cannot be deleted. */
export async function deleteTheme(id: number): Promise<void> {
  const row = await getThemeById(id);
  if (row?.isPreset) throw new Error("Built-in preset themes cannot be deleted");
  await db.transaction((tx) => {
    // Release any pages still pinned to this theme so no dangling themeId
    // survives; those pages fall back to the globally active theme.
    tx.update(pages).set({ themeId: null }).where(eq(pages.themeId, id)).run();
    tx.delete(themes).where(eq(themes.id, id)).run();
  });
}

/** Seed a set of attractive preset themes if the table is empty. */
export async function seedThemesIfEmpty(): Promise<void> {
  const count = await db.select({ c: sql<number>`count(*)` }).from(themes);
  if ((count[0]?.c ?? 0) > 0) return;

  await db.insert(themes).values(PRESETS);
}

/**
 * Insert built-in presets that are missing from an existing install (matched
 * by name, isPreset rows only). Runs alongside seedThemesIfEmpty so a new
 * release's presets reach databases seeded by older versions without a SQL
 * migration. Never touches existing rows — user edits are safe.
 */
export async function backfillPresets(): Promise<void> {
  const rows = await db
    .select({ name: themes.name })
    .from(themes)
    .where(eq(themes.isPreset, true));
  const existing = new Set(rows.map((r) => r.name));
  const missing = PRESETS.filter((p) => !existing.has(p.name));
  if (missing.length === 0) return;

  await db.insert(themes).values(missing);
}

// ─── Custom fonts (#82) ───────────────────────────────────────────────────────

export type CustomFontRow = typeof customFonts.$inferSelect;

export async function getAllCustomFonts(): Promise<CustomFontRow[]> {
  return db.select().from(customFonts).orderBy(asc(customFonts.id));
}

export async function getCustomFontById(id: number): Promise<CustomFontRow | null> {
  const rows = await db.select().from(customFonts).where(eq(customFonts.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Font lookup map for the theme resolver ("custom:<id>" → family). */
export async function getCustomFontLookup(): Promise<Map<number, { family: string }>> {
  const rows = await db
    .select({ id: customFonts.id, family: customFonts.family })
    .from(customFonts);
  return new Map(rows.map((r) => [r.id, { family: r.family }]));
}

/**
 * Themes currently referencing a custom font via fontFamily or
 * cardFontFamily = "custom:<id>" (site font refs, card font refs, or both).
 */
export async function getThemesUsingCustomFont(
  fontId: number,
): Promise<Array<{ id: number; name: string }>> {
  const ref = `custom:${fontId}`;
  return db
    .select({ id: themes.id, name: themes.name })
    .from(themes)
    .where(or(eq(themes.fontFamily, ref), eq(themes.cardFontFamily, ref)));
}

export async function insertCustomFont(
  data: typeof customFonts.$inferInsert,
): Promise<CustomFontRow> {
  const inserted = await db.insert(customFonts).values(data).returning();
  return inserted[0];
}

/** Fill in the family name once the row id is known ("LB Custom 12"). */
export async function updateCustomFontFamily(id: number, family: string): Promise<void> {
  await db.update(customFonts).set({ family }).where(eq(customFonts.id, id));
}

/**
 * Delete a custom font row and reset every theme that referenced it back to
 * the default bundled font (inter). One transaction: no theme can keep a
 * dangling "custom:<id>" reference. Returns the affected theme names.
 */
export async function deleteCustomFont(
  fontId: number,
): Promise<{ affectedThemes: string[] }> {
  const affected = await getThemesUsingCustomFont(fontId);
  const ref = `custom:${fontId}`;
  db.transaction((tx) => {
    // Site font refs reset to Inter (the default); card font refs reset
    // to "" (cards inherit the site font again). A theme with the deleted
    // font in both columns gets each reset independently.
    tx.update(themes)
      .set({ fontFamily: "inter" })
      .where(eq(themes.fontFamily, ref))
      .run();
    tx.update(themes)
      .set({ cardFontFamily: "" })
      .where(eq(themes.cardFontFamily, ref))
      .run();
    tx.delete(customFonts).where(eq(customFonts.id, fontId)).run();
  });
  return { affectedThemes: affected.map((t) => t.name) };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (existing[0]) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserCount(): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)` }).from(users);
  return rows[0]?.c ?? 0;
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  username: string,
  passwordHash: string,
  opts: { role?: "admin" | "owner" } = {},
): Promise<UserRow> {
  const created = await db
    .insert(users)
    .values({ username, passwordHash, role: opts.role ?? "owner" })
    .returning();
  return created[0];
}

/**
 * Create the first user atomically. The getUserCount() pre-check in the
 * setup routes is TOCTOU — two concurrent POSTs on a fresh instance could
 * both pass it and mint two admin rows. The count re-check lives inside
 * the same transaction as the insert, so exactly one caller wins. Returns
 * null when a user already exists.
 */
export function createFirstUser(
  username: string,
  passwordHash: string,
): UserRow | null {
  return db.transaction((tx) => {
    const rows = tx.select({ c: sql<number>`count(*)` }).from(users).all();
    if ((rows[0]?.c ?? 0) > 0) return null;
    return tx.insert(users).values({ username, passwordHash }).returning().all()[0];
  });
}

export async function updateUserPassword(
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// #5 TOTP 2FA — user-scoped accessors. The secret is stored ENCRYPTED; these
// functions are transport only — encrypt/decrypt happens in two-factor actions.

export async function getUserById(userId: number): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function setUserTotp(
  userId: number,
  fields: { totpSecret: string | null; totpEnabled: boolean; recoveryCodes: string | null },
): Promise<void> {
  await db.update(users).set(fields).where(eq(users.id, userId));
}

// ─── Accounts (#124 multi-user) ──────────────────────────────────────────────
/** All accounts, oldest first (bootstrap admin is id 1 and stays first). */
export async function listUsers(): Promise<UserRow[]> {
  return db.select().from(users).orderBy(asc(users.id));
}

/**
 * Accounts joined with the page each one owns, for the /accounts admin list.
 * One LEFT JOIN, so it stays a single query regardless of account count (no
 * N+1). `pageSlug` is null when the account owns no page yet.
 *
 * Deliberately narrow: this row type never carries `passwordHash`,
 * `totpSecret` or `recoveryCodes`, so those can't leak to the client by
 * accident (defense in depth on top of `publicAccount`).
 */
export type AccountSummaryRow = Pick<
  UserRow,
  "id" | "username" | "role" | "status" | "createdAt" | "lastLoginAt"
> & { pageSlug: string | null };

export async function listAccountSummaries(): Promise<AccountSummaryRow[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      pageSlug: pages.slug,
    })
    .from(users)
    .leftJoin(pages, eq(pages.userId, users.id))
    .orderBy(asc(users.id));
}

export async function updateUserStatus(userId: number, status: "active" | "disabled"): Promise<void> {
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

export async function updateUserRole(userId: number, role: "admin" | "owner"): Promise<void> {
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/** Stamp last_login_at on a successful sign-in (local or OIDC). */
export async function touchLastLogin(userId: number): Promise<void> {
  await db.update(users).set({ lastLoginAt: sql`(datetime('now'))` }).where(eq(users.id, userId));
}

/**
 * Delete an account. The account's page is NOT deleted (content is preserved);
 * the caller decides whether to release the slug (set to a tombstone) or leave
 * it owned by nobody (userId NULL). Returns the number of rows deleted.
 */
export async function deleteUser(userId: number): Promise<number> {
  const res = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return res.length;
}

/** Reassign a page's owner (used when creating an account's page / relinking). */
export async function setPageOwner(pageId: number, userId: number | null): Promise<void> {
  await db.update(pages).set({ userId }).where(eq(pages.id, pageId));
}

/** The page owned by a given user, if any. */
export async function getPageByOwner(userId: number): Promise<PageRow | null> {
  const rows = await db.select().from(pages).where(eq(pages.userId, userId)).limit(1);
  return rows[0] ?? null;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/** Default analytics retention window in days, used when no setting is stored
 *  (#77). An explicit `0` from the operator means keep forever and IS
 *  respected — only a missing (or non-numeric) setting falls back to this. */
export const DEFAULT_ANALYTICS_RETENTION_DAYS = 90;

/** Resolve the effective analytics retention in days: the stored setting when
 *  it's a valid non-negative integer, otherwise the default. Every reader
 *  (pruner, settings UI, privacy policy) goes through this so they can never
 *  disagree about what "unlimited" means. */
export async function getAnalyticsRetentionDays(): Promise<number> {
  const raw = await getSetting("analyticsRetentionDays");
  if (raw === null) return DEFAULT_ANALYTICS_RETENTION_DAYS;
  return /^\d+$/.test(raw) ? Number(raw) : DEFAULT_ANALYTICS_RETENTION_DAYS;
}

// Cached retention window so we don't read settings on every pageview.
let retentionCache: { days: number; at: number } = { days: -1, at: 0 };

/** Opportunistically prune analytics older than the configured retention
 *  window (settings key `analyticsRetentionDays`). Reads the setting at most
 *  once per minute; a no-op when retention is set to 0 (keep forever). */
async function pruneAnalyticsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - retentionCache.at > 60_000) {
    retentionCache = { days: await getAnalyticsRetentionDays(), at: now };
  }
  const { days } = retentionCache;
  if (days <= 0) return;
  const cutoff = sql`datetime('now', ${`-${days} days`})`;
  db.delete(analyticsPageviews).where(lt(analyticsPageviews.createdAt, cutoff)).run();
  db.delete(analyticsClicks).where(lt(analyticsClicks.createdAt, cutoff)).run();
}

export async function recordPageview(
  visitorHash: string,
  referrer: string | null,
  deviceType: string | null,
  country: string | null,
  pageId?: number,
): Promise<void> {
  await db.insert(analyticsPageviews).values({
    visitorHash,
    referrer: referrer ?? null,
    deviceType: deviceType ?? null,
    country: country ?? null,
    pageId: pageId ?? null,
  });
  await pruneAnalyticsIfDue();
}

export async function recordClick(
  linkId: number,
  visitorHash: string,
  referrer: string | null,
  eventType: "click" | "open" = "click",
): Promise<void> {
  // Wrap in a transaction so the analytics insert and the denormalized
  // clicksCount increment can't drift apart if one fails.
  db.transaction((tx) => {
    tx.insert(analyticsClicks).values({
      linkId,
      visitorHash,
      referrer: referrer ?? null,
      eventType,
    }).run();
    // Popup opens are analytics-only: the denormalized counter stays a pure
    // outbound-click count (#93) so the links table never inflates CTR.
    if (eventType === "click") {
      tx.update(links)
        .set({ clicksCount: sql`${links.clicksCount} + 1` })
        .where(eq(links.id, linkId))
        .run();
    }
  });
  // Same opportunistic prune as pageviews, so click-heavy pages (e.g. a page
  // embedded somewhere that skips the pageview beacon) don't retain forever.
  await pruneAnalyticsIfDue();
}

// AnalyticsRange is re-exported from the shared analytics-range module so there
// is a single source of truth for the type + sinceExpr logic.
export type { AnalyticsRange } from "@/lib/analytics-range";
import { sinceExpr, type AnalyticsRange } from "@/lib/analytics-range";

export interface BreakdownEntry {
  label: string;
  count: number;
}

export interface AnalyticsBreakdown {
  referrers: BreakdownEntry[];
  devices: BreakdownEntry[];
  countries: BreakdownEntry[];
}

export interface LinkStats {
  link: LinkRow;
  totalClicks: number;
  clicksPerDay: Array<{ date: string; clicks: number }>;
  topReferrers: BreakdownEntry[];
}

/** Number of day-buckets to render for a range. */
async function rangeDayCount(range: AnalyticsRange): Promise<number> {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

/** `days` UTC date keys ending today, for zero-filling a chart series. */
function buildDaySeries(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function getDashboardStats(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<DashboardStats> {
  const since = sinceExpr(range);
  const seriesDates = buildDaySeries(await rangeDayCount(range));

  const pageFilter = pageId !== undefined ? eq(analyticsPageviews.pageId, pageId) : undefined;
  const clickPageFilter = pageId !== undefined
    ? sql`${analyticsClicks.linkId} IN (SELECT ${links.id} FROM ${links} WHERE ${links.pageId} = ${pageId})`
    : undefined;
  // #93: dashboard click metrics count real outbound clicks only — popup
  // opens (event_type='open') must never inflate CTR or top-links.
  const clickOnly = eq(analyticsClicks.eventType, "click");

  const viewsQuery = pageFilter
    ? db.select({ c: sql<number>`count(*)` }).from(analyticsPageviews).where(and(gt(analyticsPageviews.createdAt, since), pageFilter))
    : db.select({ c: sql<number>`count(*)` }).from(analyticsPageviews).where(gt(analyticsPageviews.createdAt, since));
  const viewRows = await viewsQuery;
  const totalViews = viewRows[0]?.c ?? 0;

  const uniqueQuery = pageFilter
    ? db.select({ c: sql<number>`count(distinct ${analyticsPageviews.visitorHash})` }).from(analyticsPageviews).where(and(gt(analyticsPageviews.createdAt, since), pageFilter))
    : db.select({ c: sql<number>`count(distinct ${analyticsPageviews.visitorHash})` }).from(analyticsPageviews).where(gt(analyticsPageviews.createdAt, since));
  const uniqueRows = await uniqueQuery;
  const uniqueVisitors = uniqueRows[0]?.c ?? 0;

  const clickQuery = clickPageFilter
    ? db.select({ c: sql<number>`count(*)` }).from(analyticsClicks).where(and(gt(analyticsClicks.createdAt, since), clickOnly, clickPageFilter))
    : db.select({ c: sql<number>`count(*)` }).from(analyticsClicks).where(and(gt(analyticsClicks.createdAt, since), clickOnly));
  const clickRows = await clickQuery;
  const totalClicks = clickRows[0]?.c ?? 0;

  const topLinkQuery = pageId !== undefined
    ? db.select({
        id: analyticsClicks.linkId,
        title: links.title,
        clicks: sql<number>`count(*)`,
      })
      .from(analyticsClicks)
      .innerJoin(links, eq(links.id, analyticsClicks.linkId))
      .where(and(gt(analyticsClicks.createdAt, since), clickOnly, eq(links.pageId, pageId)))
      .groupBy(analyticsClicks.linkId)
      .orderBy(desc(sql`count(*)`))
      .limit(5)
    : db.select({
        id: analyticsClicks.linkId,
        title: links.title,
        clicks: sql<number>`count(*)`,
      })
      .from(analyticsClicks)
      .innerJoin(links, eq(links.id, analyticsClicks.linkId))
      .where(and(gt(analyticsClicks.createdAt, since), clickOnly))
      .groupBy(analyticsClicks.linkId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);
  const topLinkRows = await topLinkQuery;
  const topLinks = topLinkRows.map((r) => ({
    id: r.id,
    title: r.title,
    clicks: Number(r.clicks),
  }));

  const viewsPerDayRows = pageFilter
    ? await db.select({
        date: sql<string>`date(${analyticsPageviews.createdAt})`,
        views: sql<number>`count(*)`,
      })
      .from(analyticsPageviews)
      .where(and(gt(analyticsPageviews.createdAt, since), pageFilter))
      .groupBy(sql`date(${analyticsPageviews.createdAt})`)
      .orderBy(asc(sql`date(${analyticsPageviews.createdAt})`))
    : await db.select({
        date: sql<string>`date(${analyticsPageviews.createdAt})`,
        views: sql<number>`count(*)`,
      })
      .from(analyticsPageviews)
      .where(gt(analyticsPageviews.createdAt, since))
      .groupBy(sql`date(${analyticsPageviews.createdAt})`)
      .orderBy(asc(sql`date(${analyticsPageviews.createdAt})`));

  const clicksPerDayRows = clickPageFilter
    ? await db.select({
        date: sql<string>`date(${analyticsClicks.createdAt})`,
        clicks: sql<number>`count(*)`,
      })
      .from(analyticsClicks)
      .where(and(gt(analyticsClicks.createdAt, since), clickOnly, clickPageFilter))
      .groupBy(sql`date(${analyticsClicks.createdAt})`)
      .orderBy(asc(sql`date(${analyticsClicks.createdAt})`))
    : await db.select({
        date: sql<string>`date(${analyticsClicks.createdAt})`,
        clicks: sql<number>`count(*)`,
      })
      .from(analyticsClicks)
      .where(and(gt(analyticsClicks.createdAt, since), clickOnly))
      .groupBy(sql`date(${analyticsClicks.createdAt})`)
      .orderBy(asc(sql`date(${analyticsClicks.createdAt})`));

  const viewsMap = new Map<string, number>();
  for (const r of viewsPerDayRows) viewsMap.set(r.date, Number(r.views));
  const clicksMap = new Map<string, number>();
  for (const r of clicksPerDayRows) clicksMap.set(r.date, Number(r.clicks));

  const viewsPerDay = seriesDates.map((date) => ({
    date,
    views: viewsMap.get(date) ?? 0,
    clicks: clicksMap.get(date) ?? 0,
  }));

  const ctr = totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0;

  return { totalViews, uniqueVisitors, totalClicks, ctr, topLinks, viewsPerDay };
}

/**
 * Previous-period stats for computing deltas on the dashboard.
 * Uses the same range but shifted back one window (e.g. 7d ago → 14d ago).
 */
export async function getPreviousStats(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<{ totalViews: number; totalClicks: number }> {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const startShift = sql`datetime('now', ${`-${days * 2} days`})`;
  const endShift = sql`datetime('now', ${`-${days} days`})`;

  const pageFilter = pageId !== undefined ? eq(analyticsPageviews.pageId, pageId) : undefined;
  const clickPageFilter = pageId !== undefined
    ? sql`${analyticsClicks.linkId} IN (SELECT ${links.id} FROM ${links} WHERE ${links.pageId} = ${pageId})`
    : undefined;

  const viewRows = pageFilter
    ? await db.select({ c: sql<number>`count(*)` }).from(analyticsPageviews).where(and(gt(analyticsPageviews.createdAt, startShift), lt(analyticsPageviews.createdAt, endShift), pageFilter))
    : await db.select({ c: sql<number>`count(*)` }).from(analyticsPageviews).where(and(gt(analyticsPageviews.createdAt, startShift), lt(analyticsPageviews.createdAt, endShift)));

  const clickRows = clickPageFilter
    ? await db.select({ c: sql<number>`count(*)` }).from(analyticsClicks).where(and(gt(analyticsClicks.createdAt, startShift), lt(analyticsClicks.createdAt, endShift), eq(analyticsClicks.eventType, "click"), clickPageFilter))
    : await db.select({ c: sql<number>`count(*)` }).from(analyticsClicks).where(and(gt(analyticsClicks.createdAt, startShift), lt(analyticsClicks.createdAt, endShift), eq(analyticsClicks.eventType, "click")));

  return {
    totalViews: viewRows[0]?.c ?? 0,
    totalClicks: clickRows[0]?.c ?? 0,
  };
}

/** Normalize a referrer string to just its hostname for grouping. */
function normalizeReferrer(raw: string): string {
  try {
    const url = new URL(raw);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.trim();
  }
}

/** Group referrer rows by normalized hostname, summing counts. */
function cleanReferrers(rows: Array<{ label: string | null; count: number }>) {
  const merged = new Map<string, number>();
  for (const r of rows) {
    if (!r.label || r.label.trim() === "") continue;
    const key = normalizeReferrer(r.label);
    merged.set(key, (merged.get(key) ?? 0) + Number(r.count));
  }
  return [...merged.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/** Top referrers / devices / countries among views in the window. */
export async function getAnalyticsBreakdown(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<AnalyticsBreakdown> {
  const clean = (rows: Array<{ label: string | null; count: number }>) =>
    rows.flatMap((r) =>
      r.label && r.label.trim() !== ""
        ? [{ label: r.label as string, count: Number(r.count) }]
        : [],
    );

  const since = sinceExpr(range);
  const pageCondition = pageId !== undefined ? eq(analyticsPageviews.pageId, pageId) : undefined;
  const baseWhere = pageCondition
    ? and(gt(analyticsPageviews.createdAt, since), pageCondition)
    : gt(analyticsPageviews.createdAt, since);

  const [referrerRows, deviceRows, countryRows] = await Promise.all([
    db.select({ label: analyticsPageviews.referrer, count: sql<number>`count(*)` })
      .from(analyticsPageviews).where(baseWhere)
      .groupBy(analyticsPageviews.referrer).orderBy(desc(sql`count(*)`)).limit(8),
    db.select({ label: analyticsPageviews.deviceType, count: sql<number>`count(*)` })
      .from(analyticsPageviews).where(baseWhere)
      .groupBy(analyticsPageviews.deviceType).orderBy(desc(sql`count(*)`)).limit(8),
    db.select({ label: analyticsPageviews.country, count: sql<number>`count(*)` })
      .from(analyticsPageviews).where(baseWhere)
      .groupBy(analyticsPageviews.country).orderBy(desc(sql`count(*)`)).limit(8),
  ]);

  return {
    referrers: cleanReferrers(referrerRows),
    devices: clean(deviceRows),
    countries: clean(countryRows),
  };
}

/** Per-link drill-down: clicks over time + total + top referrers. */
export async function getLinkStats(linkId: number, range: AnalyticsRange = "30d"): Promise<LinkStats | null> {
  const linkRows = await db.select().from(links).where(eq(links.id, linkId)).limit(1);
  const link = linkRows[0];
  if (!link) return null;

  const since = sinceExpr(range);
  const seriesDates = buildDaySeries(await rangeDayCount(range));

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(and(eq(analyticsClicks.linkId, linkId), gt(analyticsClicks.createdAt, since), eq(analyticsClicks.eventType, "click")));
  const totalClicks = totalRows[0]?.c ?? 0;

  const perDayRows = await db
    .select({
      date: sql<string>`date(${analyticsClicks.createdAt})`,
      clicks: sql<number>`count(*)`,
    })
    .from(analyticsClicks)
    .where(and(eq(analyticsClicks.linkId, linkId), gt(analyticsClicks.createdAt, since), eq(analyticsClicks.eventType, "click")))
    .groupBy(sql`date(${analyticsClicks.createdAt})`)
    .orderBy(asc(sql`date(${analyticsClicks.createdAt})`));
  const clicksMap = new Map<string, number>();
  for (const r of perDayRows) clicksMap.set(r.date, Number(r.clicks));
  const clicksPerDay = seriesDates.map((date) => ({ date, clicks: clicksMap.get(date) ?? 0 }));

  const refRows = await db
    .select({ label: analyticsClicks.referrer, count: sql<number>`count(*)` })
    .from(analyticsClicks)
    .where(and(eq(analyticsClicks.linkId, linkId), gt(analyticsClicks.createdAt, since), eq(analyticsClicks.eventType, "click")))
    .groupBy(analyticsClicks.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(8);
  const topReferrers = cleanReferrers(refRows);

  return { link, totalClicks, clicksPerDay, topReferrers };
}

export async function getLink(id: number): Promise<LinkRow | null> {
  const rows = await db.select().from(links).where(eq(links.id, id)).limit(1);
  return rows[0] ?? null;
}

// #96 custom /go/ redirect slugs. A ref is numeric (id form — behavior
// unchanged) or a slug (case-insensitive; stored lowercase). Pure-number
// refs NEVER match the slug column, so /go/<ref> has exactly one meaning.
export async function getLinkByRef(ref: string): Promise<LinkRow | null> {
  if (/^\d+$/.test(ref)) {
    return getLink(Number(ref));
  }
  const rows = await db
    .select()
    .from(links)
    .where(eq(links.redirectSlug, ref.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/** True when `slug` is already used (optionally excluding the link being edited). */
export async function isSlugTaken(
  slug: string,
  excludeLinkId?: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: links.id })
    .from(links)
    .where(eq(links.redirectSlug, slug));
  return rows.some((r) => r.id !== excludeLinkId);
}

// ─── Subscribers (email capture) ──────────────────────────────────────────────

export type SubscriberRow = typeof subscribers.$inferSelect;

export async function addSubscriber(
  email: string,
  consentText?: string,
): Promise<void> {
  const consentAt = new Date().toISOString();
  await db.insert(subscribers).values({
    email,
    consentAt: consentText ? consentAt : null,
    consentText: consentText ?? null,
  });
}

export async function getSubscriberCount(): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)` }).from(subscribers);
  return rows[0]?.c ?? 0;
}

export async function getAllSubscribers(): Promise<SubscriberRow[]> {
  return db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
}

export async function clearSubscribers(): Promise<void> {
  db.delete(subscribers).run();
}

import {
  getAllLinks,
  getAllPages,
  getDefaultPage,
  getSectionsByPage,
  getThemeById,
  getActiveTheme,
} from "@/server/queries";
import { LinksManager } from "./links-manager";

export const dynamic = "force-dynamic";

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;

  // Resolve active page from ?page= query param, default page, or first page.
  const [allPages, defaultPage] = await Promise.all([
    getAllPages(),
    getDefaultPage(),
  ]);
  let activePage = defaultPage;
  if (pageParam) {
    const found = allPages.find((p) => p.id === Number(pageParam));
    if (found) activePage = found;
  }

  // The add/edit link sheet renders a live card preview with the page's REAL
  // theme — same resolution order as the public page: page themeId → global
  // active theme.
  const [links, sections, pageTheme] = await Promise.all([
    getAllLinks(activePage.id),
    getSectionsByPage(activePage.id),
    activePage.themeId ? getThemeById(activePage.themeId) : getActiveTheme(),
  ]);
  return (
    <LinksManager
      initialLinks={links}
      sections={sections}
      pageId={activePage.id}
      pageTheme={pageTheme}
      pageSlug={activePage.slug}
    />
  );
}

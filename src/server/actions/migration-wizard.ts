"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { requireInstanceAdmin } from "@/server/access";
import { demoBlock } from "@/lib/demo";
import { getDefaultPage, getPageById, createLink, updatePage } from "@/server/queries";
import {
  extractFromUrl,
  extractFromFileContent,
  type ImportedLink,
} from "@/lib/migration-wizard";
import { rateLimit } from "@/lib/rate-limit";
import { isAllowedLinkUrl } from "@/lib/link-url";
import { fetchAndCacheFavicon, extractDomain } from "@/lib/favicon";
import { mapWithConcurrency } from "@/lib/concurrency";

export interface ImportPreviewResult {
  success: boolean;
  error?: string;
  links?: ImportedLink[];
  socialLinks?: ImportedLink[];
  profileName?: string;
  profileBio?: string;
  profileAvatar?: string;
  platform?: string;
}

export async function importPreviewUrl(
  prevState: ImportPreviewResult | null,
  formData: FormData,
): Promise<ImportPreviewResult> {
  const demo = demoBlock();
  if (demo) return { success: false, error: demo };

  // Instance-level: the wizard reads arbitrary source pages, fetches
  // external URLs server-side and writes bulk links — admin-only, same
  // gate class as restore/backup (#124).
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const session = await getSession();
  if (!session) return { success: false, error: "Unauthorized" };

  const rl = rateLimit("import-url", 1, 30_000);
  if (!rl.ok) {
    return { success: false, error: "Please wait 30 seconds between imports" };
  }

  const url = String(formData.get("url") || "").trim();
  if (!url) return { success: false, error: "URL is required" };

  try {
    const result = await extractFromUrl(url);
    return {
      success: true,
      links: result.links,
      socialLinks: result.socialLinks,
      profileName: result.profileName,
      profileBio: result.profileBio,
      profileAvatar: result.profileAvatar,
      platform: result.platform,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch the page",
    };
  }
}

export async function importPreviewFile(
  prevState: ImportPreviewResult | null,
  formData: FormData,
): Promise<ImportPreviewResult> {
  const demo = demoBlock();
  if (demo) return { success: false, error: demo };

  // Instance-level, same rationale as importPreviewUrl above.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const session = await getSession();
  if (!session) return { success: false, error: "Unauthorized" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "File is required" };
  }

  // 5 MB limit on uploaded files.
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "File too large (max 5 MB)" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["html", "htm", "json", "txt"].includes(ext || "")) {
    return { success: false, error: "Only HTML and JSON files are supported" };
  }

  try {
    const content = await file.text();
    const result = extractFromFileContent(content, file.name);
    return {
      success: true,
      links: result.links,
      socialLinks: result.socialLinks,
      profileName: result.profileName,
      profileBio: result.profileBio,
      profileAvatar: result.profileAvatar,
      platform: result.platform,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse the file",
    };
  }
}

export interface ConfirmImportResult {
  success: boolean;
  error?: string;
  importedCount?: number;
  socialCount?: number;
  /**
   * Imported links that resolved no favicon and will show the letter
   * placeholder (#95). 0 when every url-type link got its icon; the
   * wizard surfaces the count so the operator knows to re-save those
   * links (a re-save retries the favicon chain).
   */
  iconFallbackCount?: number;
}

/**
 * How many imported links save concurrently (#95). The old unbounded
 * Promise.all fired every link's favicon chain at once and tripped
 * upstream rate limits and timeouts; small batches keep the burst below
 * the thresholds while the import still finishes in reasonable time.
 */
const IMPORT_CONCURRENCY = 3;

export async function confirmImport(
  prevState: ConfirmImportResult | null,
  formData: FormData,
): Promise<ConfirmImportResult> {
  const demo = demoBlock();
  if (demo) return { success: false, error: demo };

  // Instance-level: the wizard can target any page and merges social
  // links straight into it (updatePage) — admin-only. GHSA-954q-vph2-prc8
  // follow-up: createLink's own page-access check covered the links half,
  // but the social merge wrote page.socialLinks unscoped.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;

  const session = await getSession();
  if (!session) return { success: false, error: "Unauthorized" };

  const pageIdRaw = formData.get("pageId");
  const pageId = pageIdRaw ? Number(pageIdRaw) : undefined;
  const page = pageId ? await getPageById(pageId) : await getDefaultPage();
  if (!page) return { success: false, error: "Target page not found" };

  // Parse the selected links from the form.
  const linksJson = String(formData.get("links") || "[]");
  const socialJson = String(formData.get("socialLinks") || "[]");

  let linksToImport: ImportedLink[];
  let socialToImport: ImportedLink[];
  try {
    linksToImport = JSON.parse(linksJson);
    socialToImport = JSON.parse(socialJson);
  } catch {
    return { success: false, error: "Invalid import data" };
  }

  // Filter to only selected links — AND re-apply the URL scheme allowlist.
  // The client JSON here is untrusted input (direct action invocation, a
  // crafted import file, or a hostile source page); without this check a
  // "javascript:" URL reaches createLink and renders as a live href on the
  // PUBLIC page. Mirror of the add-link action's validation boundary.
  const MAX_IMPORT_LINKS = 200;
  const selectedLinks = linksToImport.filter(
    (l) => l.selected && l.url && l.title && isAllowedLinkUrl(l.type || "url", l.url),
  ).slice(0, MAX_IMPORT_LINKS);
  const selectedSocial = socialToImport.filter(
    (l) => l.selected && l.url && isAllowedLinkUrl("url", l.url),
  ).slice(0, MAX_IMPORT_LINKS);

  let importedCount = 0;

  // Import page links with bounded concurrency (#95): the previous
  // unbounded Promise.all fired every link's favicon chain at once,
  // tripping upstream rate limits and timeouts. Batches of 3 also let
  // duplicate domains share one cache write (fetchAndCacheFavicon is
  // cached per domain, so two links on the same host only fetch once
  // — the second save hits the cache the first one warmed).
  let iconFallbackCount = 0;
  await mapWithConcurrency(
    selectedLinks,
    IMPORT_CONCURRENCY,
    async (link) => {
      // Imported links resolve favicons exactly like manual saves (#95):
      // the old import path skipped the favicon chain entirely, which is
      // why imported links showed the letter placeholder while the same
      // URL added through the link dialog always got its icon.
      let iconUrl: string | null = null;
      if ((link.type || "url") === "url" && extractDomain(link.url)) {
        iconUrl = await fetchAndCacheFavicon(link.url);
        if (!iconUrl) iconFallbackCount++;
      }

      await createLink({
        title: link.title.slice(0, 100),
        url: link.url,
        pageId: page.id,
        type: link.type || "url",
        description: link.description?.slice(0, 200),
        imageUrl: link.imageUrl,
        iconUrl,
        iconMode: "auto",
        autoIcon: true,
      });
    },
  );
  importedCount = selectedLinks.length;

  // Merge social links into the page's socialLinks array.
  let socialCount = 0;
  if (selectedSocial.length > 0) {
    let existingSocial: { platform: string; url: string }[] = [];
    try {
      existingSocial = JSON.parse(page.socialLinks || "[]");
    } catch {
      existingSocial = [];
    }

    // Add new social links (avoid duplicates by platform).
    const existingPlatforms = new Set(existingSocial.map((s) => s.platform));
    for (const social of selectedSocial) {
      if (social.platform && !existingPlatforms.has(social.platform)) {
        existingSocial.push({
          platform: social.platform,
          url: social.url,
        });
        existingPlatforms.add(social.platform);
        socialCount++;
      }
    }

    await updatePage(page.id, {
      socialLinks: JSON.stringify(existingSocial),
    });
  }

  revalidatePath("/links");
  revalidatePath("/profile");
  revalidatePath(`/${page.slug}`);

  return {
    success: true,
    importedCount,
    socialCount,
    iconFallbackCount,
  };
}
